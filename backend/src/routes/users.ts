import argon2 from "argon2";
import { Router, type NextFunction, type Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  requireAnyCapability,
  type AuthenticatedRequest,
  type UserRole,
} from "../middleware/auth.js";
import { normalizeEmail } from "../utils/email.js";
import {
  ERROR_APPROVE_NOT_FOUND,
  ERROR_REJECTION_REASON,
  type AccountStatusValue,
} from "../services/accountApproval.js";
import { canDecide, getUnitScope } from "../services/approvers.js";
import { sendNotificationEmail } from "../services/email.js";
import {
  assertInvitable,
  createPrivilegedInvite,
  ERROR_INVITE_AUTHORIZATION_REF,
  ERROR_INVITE_AUTHORIZED_BY,
  INVITABLE_ROLES,
  INVITE_TTL_HOURS,
  inviteExpiresAt,
  newInviteToken,
  type InvitableRole,
} from "../services/invites.js";
import { executeHandover } from "../services/handover.js";

export const usersRouter: Router = Router();

const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").optional(),
    email: z.string().trim().email("Enter a valid email").optional(),
  })
  .refine((data) => data.fullName !== undefined || data.email !== undefined, {
    message: "Nothing to update",
  });

const passwordSchema = z.object({
  password: z.string().min(8, "At least 8 characters"),
});

/**
 * `role` is optional on approval: the request itself always asks as `STAFF` (a
 * person must not be able to choose their own privileges), and this is where an
 * administrator assigns the real one.
 */
const approveSchema = z.object({
  role: z
    .enum(["SYSTEM_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"], {
      message: "Role must be one of the five system roles",
    })
    .optional(),
});

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, ERROR_REJECTION_REASON)
    .max(500, ERROR_REJECTION_REASON),
});

/** The account fields an administrator sees. Never the password hash. */
const userListSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  orgUnitId: true,
  createdAt: true,
  accountStatus: true,
  reviewedAt: true,
  reviewNote: true,
  _count: { select: { ownedItems: true } },
} as const;

function toAdminUser(user: {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  accountStatus: AccountStatusValue;
  reviewedAt: Date | null;
  reviewNote: string | null;
  _count: { ownedItems: number };
}, viewerRole: UserRole) {
  const response: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    itemCount?: number;
    accountStatus: AccountStatusValue;
    reviewedAt: Date | null;
    reviewNote: string | null;
  } = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    accountStatus: user.accountStatus,
    reviewedAt: user.reviewedAt,
    reviewNote: user.reviewNote,
  };

  // SYSTEM_ADMIN should not see asset data per security rule
  if (viewerRole !== "SYSTEM_ADMIN") {
    response.itemCount = user._count.ownedItems;
  }

  return response;
}

/**
 * Account administration (F1.3), all of it ADMIN-only.
 *
 * This closes gap G2 for the parts the admin screen needs: before it, `POST
 * /auth/register` was the only user endpoint, so an account could be created and
 * then never seen, corrected, promoted or removed.
 *
 * The deliberate asymmetry is **promote without demote**. A promote is additive —
 * it grants access — and is the operation an administrator actually needs. A
 * demote silently strips someone's access to every screen they were using, which
 * is the kind of change that should not be one mis-click away, so there is no
 * endpoint for it.
 *
 * ── The approval queue (spec 3.1.2) ────────────────────────────────────────
 * A person asks for an account through `POST /auth/account-requests`, which leaves
 * a `PENDING_APPROVAL` row that cannot sign in. The three routes below are the
 * administrator's side of that: see the queue, approve (optionally assigning the
 * role the request never chose), or reject with a reason.
 *
 * **Nobody approves their own account.** `assertCanReview` enforces it here, on the
 * server, and the queue screen omitting the buttons on your own row is only a
 * courtesy on top of that — the rule is what an API caller without the UI hits.
 */
/**
 * `GET /users/approvals` — the accounts waiting for a decision, oldest first.
 *
 * What a user sees depends on their role:
 * - ACCOUNT_ADMIN sees all pending requests (privileged + staff)
 * - DEPARTMENT_HEAD sees only STAFF requests in their department
 * - Others with ACCOUNT_MANAGE see all (should only be ACCOUNT_ADMIN in practice)
 */
usersRouter.get(
  "/approvals",
  authenticate,
  requireAnyCapability("ACCOUNT_APPROVE_ANY", "ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      /**
       * `?decided=true` — the accounts **this** viewer has already decided.
       *
       * A department head approves their unit's staff, and then the queue is
       * empty: the request they filed is gone, with no record of what they
       * decided and no way to see it again. The decisions are the second half
       * of the job, and they deserve the same screen as the queue.
       */
      const wantDecided = req.query.decided === "true";
      if (wantDecided) {
        const decidedWhere: Prisma.UserWhereInput = {
          reviewedById: user.id,
          accountStatus: { not: "PENDING_APPROVAL" },
        };
        const decided = await prisma.user.findMany({
          where: decidedWhere,
          orderBy: { reviewedAt: "desc" },
          select: userListSelect,
        });
        res.status(200).json(decided.map((u) => toAdminUser(u, user.role)));
        return;
      }

      let where: Prisma.UserWhereInput = { accountStatus: "PENDING_APPROVAL" };

      // SYSTEM_ADMIN sees everything: escalated, headless-unit, and stale requests
      if (user.role === "SYSTEM_ADMIN") {
        // No additional filter - sees all PENDING_APPROVAL
      } else if (user.role === "DEPARTMENT_HEAD") {
        // DEPARTMENT_HEAD only sees staff requests in their unit scope
        if (!user.orgUnitId) {
          res.status(403).json({ error: "You are not assigned to a department" });
          return;
        }
        const unitScope = await getUnitScope(user.orgUnitId);
        where = {
          ...where,
          role: "STAFF",
          orgUnitId: { in: unitScope },
          // Exclude escalated requests
          // "Not escalated" must include the rows that have **no** note at
          // all. `reviewNote NOT LIKE '%[ESCALATED]%'` is NULL (not TRUE) for
          // a NULL note, and SQL drops NULL from a WHERE clause — so every
          // **newly submitted** account request, which has no note yet, was
          // invisible in the head's own queue. The seeded rows were visible
          // only because the seed writes a note on them.
          //
          // The effect: a Department Head never saw a staff request unless
          // something else had written a note on it, and only a SYSTEM_ADMIN
          // could approve one. That silently undid D1 (the unit head approves
          // own-unit staff) while everything looked green: the mocked unit
          // tests never execute this WHERE clause, and the live queue looked
          // plausible because the seeded rows were in it.
          OR: [
            { reviewNote: null },
            { reviewNote: { not: { contains: "[ESCALATED]" } } },
          ],
        };
      } else {
        // Other roles with ACCOUNT_APPROVE_ANY (should not happen)
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }

      const pending = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "asc" },
        select: userListSelect,
      });

      res.status(200).json(pending.map((u) => toAdminUser(u, user.role)));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /users/approvals/count — count of accounts waiting for approval.
 * Used for the Accounts nav badge.
 */
usersRouter.get(
  "/approvals/count",
  authenticate,
  requireAnyCapability("ACCOUNT_APPROVE_ANY", "ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      let where: Prisma.UserWhereInput = { accountStatus: "PENDING_APPROVAL" };

      // SYSTEM_ADMIN sees everything: escalated, headless-unit, and stale requests
      if (user.role === "SYSTEM_ADMIN") {
        // No additional filter - sees all PENDING_APPROVAL
      } else if (user.role === "DEPARTMENT_HEAD") {
        // DEPARTMENT_HEAD only sees staff requests in their unit scope
        if (!user.orgUnitId) {
          res.status(403).json({ error: "You are not assigned to a department" });
          return;
        }
        const unitScope = await getUnitScope(user.orgUnitId);
        where = {
          ...where,
          role: "STAFF",
          orgUnitId: { in: unitScope },
          // Exclude escalated requests
          // "Not escalated" must include the rows that have **no** note at
          // all. `reviewNote NOT LIKE '%[ESCALATED]%'` is NULL (not TRUE) for
          // a NULL note, and SQL drops NULL from a WHERE clause — so every
          // **newly submitted** account request, which has no note yet, was
          // invisible in the head's own queue. The seeded rows were visible
          // only because the seed writes a note on them.
          //
          // The effect: a Department Head never saw a staff request unless
          // something else had written a note on it, and only a SYSTEM_ADMIN
          // could approve one. That silently undid D1 (the unit head approves
          // own-unit staff) while everything looked green: the mocked unit
          // tests never execute this WHERE clause, and the live queue looked
          // plausible because the seeded rows were in it.
          OR: [
            { reviewNote: null },
            { reviewNote: { not: { contains: "[ESCALATED]" } } },
          ],
        };
      } else {
        // Other roles with ACCOUNT_APPROVE_ANY (should not happen)
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }

      const count = await prisma.user.count({ where });
      res.status(200).json({ count });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `POST /users/:id/approve` — let the account sign in.
 *
 * The role is optional and defaults to the one the request already carries (`STAFF`,
 * assigned by `POST /auth/account-requests`). It is here because approving is the
 * moment an administrator knows who this person is.
 *
 * Authorization rules:
 * - SYSTEM_ADMIN (with ACCOUNT_APPROVE_ANY) can approve any role except SYSTEM_ADMIN
 * - DEPARTMENT_HEAD (with ACCOUNT_APPROVE_OWN_UNIT) can only approve STAFF in their unit scope
 * - Self-approval is never allowed
 *
 * Changing the role also bumps `tokenVersion`, the same way `promote` does.
 */
usersRouter.post(
  "/:id/approve",
  authenticate,
  requireAnyCapability("ACCOUNT_APPROVE_ANY", "ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const parsed = approveSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: ERROR_APPROVE_NOT_FOUND });
        return;
      }

      const reviewer = req.user!;

      // Check if reviewer can decide on this request
      const decision = await canDecide({
        id: reviewer.id,
        role: reviewer.role,
        accountStatus: reviewer.accountStatus ?? "ACTIVE",
        orgUnitId: reviewer.orgUnitId ?? null,
      }, {
        id: existing.id,
        userId: existing.id,
        requestedUnitId: existing.orgUnitId ?? "",
        status: existing.accountStatus,
      });

      if (!decision.allowed) {
        res.status(404).json({ error: decision.reason ?? "Not authorized to approve this request" });
        return;
      }

      // No self-approval
      if (reviewer.id === existing.id) {
        res.status(403).json({ error: "You cannot approve your own account request" });
        return;
      }

      const hasExplicitRole = parsed.data.role !== undefined;
      const requestedRole = parsed.data.role ?? existing.role;

      // SYSTEM_ADMIN can assign any role except SYSTEM_ADMIN
      if (reviewer.role === "SYSTEM_ADMIN") {
        if (requestedRole === "SYSTEM_ADMIN") {
          res.status(403).json({ error: "Cannot create SYSTEM_ADMIN accounts" });
          return;
        }
      } else if (reviewer.role === "DEPARTMENT_HEAD") {
        // DEPARTMENT_HEAD can only assign STAFF role
        if (requestedRole !== "STAFF") {
          res.status(403).json({ error: "Department heads can only approve staff accounts" });
          return;
        }
      }

      const updateData: Prisma.UserUpdateInput = {
        accountStatus: "ACTIVE",
        reviewedBy: { connect: { id: reviewer.id } },
        reviewedAt: new Date(),
        reviewNote: null,
        ...(hasExplicitRole ? { role: requestedRole } : {}),
        ...(hasExplicitRole ? { tokenVersion: { increment: 1 } } : {}),
      };

      const approved = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: updateData,
          select: userListSelect,
        });

        // Log approval to AdminActionLog
        await tx.adminActionLog.create({
          data: {
            actorId: reviewer.id,
            action: "ACCOUNT_APPROVED",
            targetUserId: existing.id,
            unitId: existing.orgUnitId ?? null,
            before: {
              accountStatus: existing.accountStatus,
              role: existing.role,
            },
            after: {
              accountStatus: "ACTIVE",
              role: requestedRole,
            },
          },
        });

        return updated;
      });

      // §5: Trigger structured handover when a DEPARTMENT_HEAD is activated
      if (requestedRole === "DEPARTMENT_HEAD" && approved.orgUnitId) {
        const unit = await prisma.orgUnit.findUnique({
          where: { id: approved.orgUnitId },
          select: { headId: true },
        });
        if (unit && unit.headId && unit.headId !== approved.id) {
          await executeHandover(prisma, {
            unitId: approved.orgUnitId,
            previousHeadId: unit.headId,
            newHeadId: approved.id,
          });
        }
        // Update the unit's head
        await prisma.orgUnit.update({
          where: { id: approved.orgUnitId },
          data: { headId: approved.id },
        });
      }

      // Send approval email (after transaction commits)
      sendNotificationEmail({
        to: approved.email,
        subject: "Your CNCS Property Management Account has been Approved",
        body: `Hello ${approved.fullName},\n\nYour account request has been approved. You can now sign in at ${process.env.SITE_ORIGIN || 'https://cncs-pms-web.vercel.app'}.\n\nYour role: ${requestedRole}\n\nIf you did not request this account, please contact the Property Office.`,
      }).catch((err) => console.error("Failed to send approval email:", err));

      res.status(200).json(toAdminUser(approved, reviewer.role));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `POST /users/:id/reject` — decline the request, with a reason.
 *
 * The reason is required and length-checked for the same reason a request rejection
 * is (F6.2): the person is told why, and "no" with no explanation is the answer that
 * sends them to the property office anyway. The row survives as `REJECTED` rather
 * than being deleted, so the same person cannot ask again into a void and an
 * administrator can see that this request was already declined once.
 */
usersRouter.post(
  "/:id/reject",
  authenticate,
  requireAnyCapability("ACCOUNT_APPROVE_ANY", "ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const parsed = rejectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: ERROR_REJECTION_REASON });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: ERROR_APPROVE_NOT_FOUND });
        return;
      }

      const reviewer = req.user!;

      // Check if reviewer can decide on this request
      const decision = await canDecide({
        id: reviewer.id,
        role: reviewer.role,
        accountStatus: reviewer.accountStatus ?? "ACTIVE",
        orgUnitId: reviewer.orgUnitId ?? null,
      }, {
        id: existing.id,
        userId: existing.id,
        requestedUnitId: existing.orgUnitId ?? "",
        status: existing.accountStatus,
      });

      if (!decision.allowed) {
        res.status(404).json({ error: decision.reason ?? "Not authorized to reject this request" });
        return;
      }

      // No self-rejection
      if (reviewer.id === existing.id) {
        res.status(403).json({ error: "You cannot reject your own account request" });
        return;
      }

      const rejected = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            accountStatus: "REJECTED",
            reviewedBy: { connect: { id: req.user!.id } },
            reviewedAt: new Date(),
            reviewNote: parsed.data.reason,
          },
          select: userListSelect,
        });

        // Log rejection to AdminActionLog
        await tx.adminActionLog.create({
          data: {
            actorId: reviewer.id,
            action: "ACCOUNT_REJECTED",
            targetUserId: existing.id,
            unitId: existing.orgUnitId ?? null,
            before: {
              accountStatus: existing.accountStatus,
            },
            after: {
              accountStatus: "REJECTED",
              rejectionReason: parsed.data.reason,
            },
          },
        });

        return updated;
      });

      // Send rejection email (after transaction commits)
      sendNotificationEmail({
        to: rejected.email,
        subject: "Your CNCS Property Management Account Request was Rejected",
        body: `Hello ${rejected.fullName},\n\nYour account request has been rejected.\n\nReason: ${parsed.data.reason}\n\nIf you believe this is an error, please contact the Property Office.`,
      }).catch((err) => console.error("Failed to send rejection email:", err));

      res.status(200).json(toAdminUser(rejected, reviewer.role));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `POST /users/:id/escalate` — mark a request as "Not in my department".
 *
 * Only the DEPARTMENT_HEAD in scope for the request can escalate.
 * The request moves to the SYSTEM_ADMIN queue.
 */
usersRouter.post(
  "/:id/escalate",
  authenticate,
  requireCapability("ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: ERROR_APPROVE_NOT_FOUND });
        return;
      }

      const reviewer = req.user!;

      // Check if reviewer can decide on this request (must be DEPARTMENT_HEAD in scope)
      if (reviewer.role !== "DEPARTMENT_HEAD") {
        res.status(403).json({ error: "Only department heads can escalate requests" });
        return;
      }

      const decision = await canDecide({
        id: reviewer.id,
        role: reviewer.role,
        accountStatus: reviewer.accountStatus ?? "ACTIVE",
        orgUnitId: reviewer.orgUnitId ?? null,
      }, {
        id: existing.id,
        userId: existing.id,
        requestedUnitId: existing.orgUnitId ?? "",
        status: existing.accountStatus,
      });

      if (!decision.allowed) {
        res.status(404).json({ error: decision.reason ?? "This request is not in your department scope" });
        return;
      }

      // No self-escalation
      if (reviewer.id === existing.id) {
        res.status(403).json({ error: "You cannot escalate your own account request" });
        return;
      }

      const escalated = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            accountStatus: "PENDING_APPROVAL", // Keep as pending but mark for SYSTEM_ADMIN
            reviewNote: (existing.reviewNote ?? "") + "\n[ESCALATED] Not in my department",
            escalatedAt: new Date(),
            escalatedById: reviewer.id,
          },
          select: userListSelect,
        });

        // Log escalation to AdminActionLog
        await tx.adminActionLog.create({
          data: {
            actorId: reviewer.id,
            action: "ACCOUNT_ESCALATED",
            targetUserId: existing.id,
            unitId: existing.orgUnitId ?? null,
            before: {
              accountStatus: existing.accountStatus,
            },
            after: {
              accountStatus: "PENDING_APPROVAL",
              escalatedAt: new Date(),
              escalatedById: reviewer.id,
            },
          },
        });

        return updated;
      });

      // Send escalation notification to SYSTEM_ADMIN (after transaction commits)
      // Find SYSTEM_ADMIN users to notify
      const systemAdmins = await prisma.user.findMany({
        where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
        select: { email: true, fullName: true },
      });
      for (const admin of systemAdmins) {
        sendNotificationEmail({
          to: admin.email,
          subject: "Account Request Escalated to SYSTEM_ADMIN",
          body: `An account request for ${existing.fullName} (${existing.email}) has been escalated by Department Head.\n\nReason: Not in my department\n\nPlease review this request in the approval queue.`,
        }).catch((err) => console.error("Failed to send escalation email:", err));
      }

      res.status(200).json(toAdminUser(escalated, reviewer.role));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The privileged-invite body (T6).
 *
 * `authorizedBy` and `authorizationRef` are required **here** as well as in the
 * service: this is where a payload missing them becomes a 400 with the field
 * named in `details`, and the service is where the same rule is enforced for any
 * caller that did not come through the HTTP layer. Repeating a rule at two layers
 * is deliberate for this pair — it is the requirement, and one enforcement point
 * that someone later refactors away is a requirement quietly dropped.
 */
const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(INVITABLE_ROLES, {
    message: "A privileged invite is for a department head, property officer, auditor or system admin",
  }),
  unitId: z.string().trim().min(1).nullish(),
  authorizedBy: z.string().trim().min(1, ERROR_INVITE_AUTHORIZED_BY).max(200),
  authorizationRef: z.string().trim().min(1, ERROR_INVITE_AUTHORIZATION_REF).max(200),
  authorizationNote: z.string().trim().max(500).nullish(),
});

/**
 * `POST /users/invite` — create a privileged account by invitation (T6).
 *
 * SYSTEM_ADMIN only (`ACCOUNT_INVITE`), and the account it creates **cannot be
 * signed into by anyone until the invitee sets their own password** through
 * `POST /auth/accept-invite`. That is the requirement, and it is why this route
 * has no `password` field at all: there is no code path here that could accept
 * one, so the legacy "administrator types a password and reads it out" flow is
 * not a thing a future edit can reintroduce by accident.
 *
 * The four rejections the authority doc's §4 table checks live in
 * `services/invites.ts` — missing authorization, a unit that already has an
 * active head, one person holding Property Officer and Auditor, and an admin
 * inviting themselves.
 *
 * The link is returned in the response as well as emailed. That is not a leak:
 * the caller is the administrator who just created the appointment, the link is
 * single-use and expires, and the transport below is a stub until `NOTIFY_EMAIL`
 * is on — without the link in the response an invitation could be created and
 * never delivered, which is a worse failure than the administrator seeing it.
 * `email` says which of the two happened.
 */
usersRouter.post(
  "/invite",
  authenticate,
  requireCapability("ACCOUNT_INVITE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = inviteSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const actor = req.user!;
      const data = parsed.data;
      const email = normalizeEmail(data.email);
      const role = data.role as InvitableRole;
      const unitId = role === "DEPARTMENT_HEAD" ? (data.unitId ?? null) : null;

      /**
       * The three facts the rules need, read together: the unit being appointed
       * (only for a head), a live account on the address, and a still-usable
       * invite on it. `liveInvite` and `lapsedAccount` are the two states that
       * look identical in the `User` table and must be told apart — the first
       * blocks the invite, the second is the renewal this route exists to serve.
       */
      const [actorRow, unit, account] = await Promise.all([
        prisma.user.findUnique({ where: { id: actor.id }, select: { email: true } }),
        unitId
          ? prisma.orgUnit.findUnique({
              where: { id: unitId },
              select: {
                id: true,
                name: true,
                isActive: true,
                headId: true,
                head: { select: { accountStatus: true } },
              },
            })
          : Promise.resolve(null),
        prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: {
            id: true,
            role: true,
            accountStatus: true,
            emailTokens: {
              where: { type: "INVITE", usedAt: null, expiresAt: { gt: new Date() } },
              select: { id: true },
              take: 1,
            },
          },
        }),
      ]);

      const liveInvite = account?.emailTokens.length
        ? { role: account.role }
        : null;
      const lapsedInviteUserId =
        account && !liveInvite && account.accountStatus === "PENDING_EMAIL_VERIFICATION"
          ? account.id
          : null;
      /** A live account that is not a lapsed invite: "already has an account". */
      const existingAccount =
        account && !liveInvite && !lapsedInviteUserId
          ? { id: account.id, role: account.role }
          : null;

      assertInvitable(
        {
          role,
          email,
          unitId,
          authorizedBy: data.authorizedBy,
          authorizationRef: data.authorizationRef,
          authorizationNote: data.authorizationNote ?? null,
        },
        {
          actor: { id: actor.id, email: actorRow?.email ?? "" },
          unit: unit
            ? {
                id: unit.id,
                name: unit.name,
                isActive: unit.isActive,
                headId: unit.headId,
                headIsActive: unit.head?.accountStatus === "ACTIVE",
              }
            : null,
          existingAccount,
          liveInviteRole: liveInvite?.role ?? null,
        },
      );

      const invite = await createPrivilegedInvite(
        {
          role,
          email,
          unitId,
          authorizedBy: data.authorizedBy,
          authorizationRef: data.authorizationRef,
          authorizationNote: data.authorizationNote ?? null,
        },
        { id: actor.id, email: actorRow?.email ?? "" },
        lapsedInviteUserId,
      );

      // Best-effort and after the transaction commits: a mail server that is down
      // must not undo an invitation that is already recorded. The response says
      // which of the two happened, and the link is in it either way.
      const delivery = await sendNotificationEmail({
        to: invite.email,
        subject: "Your CNCS PMS account invitation",
        body:
          `You have been invited to the CNCS Property Management System as ${role}.\n\n` +
          `Set your own password here (the link works once, for ${INVITE_TTL_HOURS} hours):\n` +
          `${invite.inviteUrl}\n\n` +
          `This appointment was authorized by ${data.authorizedBy.trim()} ` +
          `(ref: ${data.authorizationRef.trim()}).`,
      });

      res.status(201).json({
        invite: {
          userId: invite.userId,
          email: invite.email,
          role: invite.role,
          unitId: invite.unitId,
          status: invite.status,
          expiresAt: invite.expiresAt,
          renewed: lapsedInviteUserId !== null,
        },
        inviteUrl: invite.inviteUrl,
        email: delivery,
      });
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.get(
  "/",
  authenticate,
  requireCapability("USER_READ"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: userListSelect,
      });

      const user = req.user!;
      res.status(200).json(users.map((u) => toAdminUser(u, user.role)));
    } catch (err) {
      next(err);
    }
  }
);

/** `PATCH /users/:id` — correct a name or email. Role changes go through promote. */
usersRouter.patch(
  "/:id",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const user = req.user!;
      const { fullName } = parsed.data;
      const email =
        parsed.data.email === undefined ? undefined : normalizeEmail(parsed.data.email);

      /**
       * Changing an email to one already in use is a 409, not a 500 from the
       * unique constraint — checked here so the message can name the conflict.
       *
       * Compared without regard to case, and excluding this account, for the same
       * reason login is (`utils/email.ts`): the unique index is case-sensitive, so
       * an exact check would let `Admin@x` be set on one account while `admin@x`
       * sits on another. The `id: { not: id }` clause is what stops a legacy row
       * still stored as `Admin@x` from clashing with itself once normalised.
       */
      if (email !== undefined && email !== existing.email) {
        const clash = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" }, id: { not: id } },
        });
        if (clash) {
          res.status(409).json({ error: "Another account already uses this email" });
          return;
        }
      }

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(fullName !== undefined ? { fullName } : {}),
          ...(email !== undefined ? { email } : {}),
        },
        select: userListSelect,
      });

      res.status(200).json(toAdminUser(updated, user.role));
    } catch (err) {
      next(err);
    }
  }
);

const promoteSchema = z.object({
  role: z.enum(["SYSTEM_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"]),
});

/**
 * `POST /users/:id/promote` — set an account's role. There is no separate demote:
 * a role change is one operation, and every change bumps `tokenVersion` so the
 * account's old sessions — which carry the old role — die immediately. Without
 * that bump a demoted user would keep their previous privileges until their token
 * expired (gap-analysis E10).
 */
usersRouter.post(
  "/:id/promote",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const parsed = promoteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Role must be one of SYSTEM_ADMIN, PROPERTY_OFFICER, DEPARTMENT_HEAD, STAFF, AUDITOR",
          details: parsed.error.issues,
        });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const user = req.user!;

      if (existing.role === parsed.data.role) {
        res.status(409).json({ error: `This account is already ${parsed.data.role}` });
        return;
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { role: parsed.data.role, tokenVersion: { increment: 1 } },
        select: userListSelect,
      });

      // §5: Trigger structured handover when promoted to DEPARTMENT_HEAD
      if (parsed.data.role === "DEPARTMENT_HEAD" && updated.orgUnitId) {
        const unit = await prisma.orgUnit.findUnique({
          where: { id: updated.orgUnitId },
          select: { headId: true },
        });
        if (unit && unit.headId && unit.headId !== updated.id) {
          await executeHandover(prisma, {
            unitId: updated.orgUnitId,
            previousHeadId: unit.headId,
            newHeadId: updated.id,
          });
        }
        // Update the unit's head
        await prisma.orgUnit.update({
          where: { id: updated.orgUnitId },
          data: { headId: updated.id },
        });
      }

      res.status(200).json(toAdminUser(updated, user.role));
    } catch (err) {
      next(err);
    }
  }
);

/** `POST /users/:id/deactivate` — deactivate an account (not delete). */
usersRouter.post(
  "/:id/deactivate",
  authenticate,
  requireAnyCapability("ACCOUNT_DEACTIVATE_OWN_UNIT", "ACCOUNT_DEACTIVATE_PRIVILEGED"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      if (req.user?.id === id) {
        res.status(400).json({ error: "You cannot deactivate your own account" });
        return;
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, accountStatus: true, orgUnitId: true, reviewNote: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      if (existing.accountStatus === "DEACTIVATED") {
        res.status(409).json({ error: "Account is already deactivated" });
        return;
      }

      // DEPARTMENT_HEAD can only deactivate in their unit
      if (req.user?.role === "DEPARTMENT_HEAD") {
        if (!existing.orgUnitId || existing.orgUnitId !== req.user.orgUnitId) {
          res.status(403).json({ error: "You can only deactivate accounts in your department" });
          return;
        }
        if (existing.role === "PROPERTY_OFFICER" || existing.role === "SYSTEM_ADMIN") {
          res.status(403).json({ error: "Cannot deactivate privileged roles. Use SYSTEM_ADMIN for this." });
          return;
        }
      }

      await prisma.$transaction(async (tx) => {
        // §8.1: Reassign pending approvals to SYSTEM_ADMIN
        if (existing.role === "DEPARTMENT_HEAD" && existing.orgUnitId) {
          const unit = await tx.orgUnit.findUnique({
            where: { id: existing.orgUnitId },
            select: { headId: true },
          });
          if (unit && unit.headId === existing.id) {
            await tx.orgUnit.update({
              where: { id: existing.orgUnitId },
              data: { headId: null },
            });
          }
          const sysAdmin = await tx.user.findFirst({
            where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
            select: { id: true },
          });
          if (sysAdmin) {
            await tx.request.updateMany({
              where: {
                reviewedById: existing.id,
                status: { in: ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2"] },
              },
              data: {
                reviewedById: sysAdmin.id,
                reviewNote: (existing.reviewNote ?? "") + "\n[REASSIGNED] Original approver deactivated",
              },
            });
          }
        }

        // Revert items held by this user
        const heldItems = await tx.item.findMany({
          where: { holderId: existing.id, holderType: "STAFF" },
          select: { id: true },
        });
        for (const item of heldItems) {
          await tx.item.update({
            where: { id: item.id },
            data: {
              status: "REVERTED_UNVERIFIED",
              holderType: "COLLEGE",
              holderId: null,
            },
          });
          await tx.custodyEvent.create({
            data: {
              itemId: item.id,
              eventType: "HOLDER_DEACTIVATED",
              fromHolderType: "STAFF",
              fromHolderId: existing.id,
              toHolderType: "COLLEGE",
              toHolderId: null,
              actingUserId: req.user!.id,
              reason: "Holder deactivated",
            },
          });
        }

        await tx.user.update({
          where: { id },
          data: {
            accountStatus: "DEACTIVATED",
            tokenVersion: { increment: 1 },
          },
        });
      });

      res.status(200).json({ id, deactivated: true });
    } catch (err) {
      next(err);
    }
  }
);

/** `POST /users/:id/password` — set a new password for the account. */
usersRouter.post(
  "/:id/password",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const parsed = passwordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const passwordHash = await argon2.hash(parsed.data.password, {
        type: argon2.argon2id,
      });

      /**
       * A reset does two more things than writing a hash:
       *
       *   - `mustChangePassword: true` — the temporary password is a shared
       *     secret an administrator typed out loud, so the account holder is
       *     forced to replace it on next sign-in.
       *   - `tokenVersion` bumped — every session the account already had is
       *     revoked (the same guarantee `POST /auth/change-password` gives). A
       *     reset that left old tokens working would not actually be a reset.
       */
      await prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
      });

      res.status(200).json({ id, passwordChanged: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `DELETE /users/:id` — remove an account, but only one with no trail.
 *
 * An account that owns items, filed or reviewed a request, ran an audit or made
 * an edit is part of the record the rest of the system exists to preserve, and
 * every one of those relations would block the delete at the database level
 * anyway. So the handler checks first and reports *which* relations stand in the
 * way, rather than surfacing a foreign-key error.
 *
 * Notifications are the one exception: they are a per-account inbox, meaningless
 * without the account, so they go in the same transaction.
 *
 * Deleting yourself is refused — it would leave the acting administrator signed
 * out with no way back in mid-session, and it is almost always a mistake.
 */
usersRouter.delete(
  "/:id",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      if (req.user?.id === id) {
        res.status(400).json({ error: "You cannot delete your own account" });
        return;
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          _count: {
            select: {
              ownedItems: true,
              requestsCreated: true,
              requestsReviewed: true,
              auditsRun: true,
              itemEdits: true,
            },
          },
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const { ownedItems, requestsCreated, requestsReviewed, auditsRun, itemEdits } =
        existing._count;

      /**
       * `Request.newOwnerId` is a bare string with no foreign key, so it is not
       * covered by `_count` and the database would happily let the referenced
       * account disappear, leaving a transfer that can never be approved. It is
       * counted explicitly so that dangling reference cannot be created here.
       */
      const referencedAsNewOwner = await prisma.request.count({
        where: { newOwnerId: id },
      });

      const blockers = [
        [ownedItems, "owned item"],
        [requestsCreated, "filed request"],
        [requestsReviewed, "reviewed request"],
        [auditsRun, "audit"],
        [itemEdits, "edit-history row"],
        [referencedAsNewOwner, "pending transfer naming this account as its new owner"],
      ] as const;

      const inUse = blockers.filter(([count]) => count > 0);
      if (inUse.length > 0) {
        const summary = inUse
          .map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`)
          .join(", ");
        res.status(409).json({
          error: `This account is part of the record and cannot be deleted (${summary}). Records are preserved, not destroyed (F7.2).`,
        });
        return;
      }

      await prisma.$transaction([
        prisma.notification.deleteMany({ where: { userId: id } }),
        prisma.user.delete({ where: { id } }),
      ]);

      res.status(200).json({ id, deleted: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /org-units/:id/activate-head — activate new department head (§5.2)
 * Sets new head, marks department items as REVERTED_UNVERIFIED, reassigns pending approvals
 */
usersRouter.post(
  "/org-units/:id/activate-head",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "OrgUnit ID is required" });
        return;
      }
      const { newHeadId } = req.body as { newHeadId: string };
      if (!newHeadId) {
        res.status(400).json({ error: "newHeadId is required" });
        return;
      }
      const newHead = await prisma.user.findUnique({
        where: { id: newHeadId },
        select: { id: true, role: true, accountStatus: true },
      });
      if (!newHead) {
        res.status(404).json({ error: "New head not found" });
        return;
      }
      if (newHead.role !== "DEPARTMENT_HEAD") {
        res.status(400).json({ error: "New head must be a DEPARTMENT_HEAD" });
        return;
      }
      if (newHead.accountStatus !== "ACTIVE") {
        res.status(400).json({ error: "New head must be ACTIVE" });
        return;
      }
      const result = await prisma.$transaction(async (tx) => {
        // Set new head
        await tx.orgUnit.update({
          where: { id },
          data: { headId: newHeadId },
        });
        // Mark department-held items as REVERTED_UNVERIFIED
        await tx.item.updateMany({
          where: {
            orgUnitId: id,
            holderType: "DEPARTMENT",
            status: { not: "REVERTED_UNVERIFIED" },
          },
          data: {
            status: "REVERTED_UNVERIFIED",
          },
        });
        // Reassign pending approvals to new head
        const oldHead = await tx.orgUnit.findUnique({
          where: { id },
          select: { headId: true },
        });
        if (oldHead?.headId) {
          await tx.request.updateMany({
            where: {
              reviewedById: oldHead.headId,
              status: { in: ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2"] },
            },
            data: {
              reviewedById: newHeadId,
              reviewNote: "[REASSIGNED] Head changed on handover",
            },
          });
        }
        return { success: true };
      }, { maxWait: 5000, timeout: 15000 });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `GET /users/invites` — list outstanding invites with status (T8)
 *
 * An invite is a `User` row in `PENDING_EMAIL_VERIFICATION` plus an
 * `EmailToken` of type `INVITE` carrying the hash and the expiry. The expiry
 * lives on the token, not on the user — `User` has no `expiresAt` column, and
 * the earlier version of this route selected one, which made the endpoint fail
 * with a Prisma validation error (a 500 on the screen an administrator uses to
 * see who has not accepted yet).
 */
usersRouter.get(
  "/invites",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tokens = await prisma.emailToken.findMany({
        where: { type: "INVITE", usedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              orgUnitId: true,
              accountStatus: true,
              accountRequest: {
                select: { authorizedBy: true, authorizationRef: true, invitedAt: true },
              },
            },
          },
        },
      });

      const now = new Date();
      const withStatus = tokens.map((token) => ({
        id: token.user.id,
        tokenId: token.id,
        fullName: token.user.fullName,
        email: token.user.email,
        role: token.user.role,
        orgUnitId: token.user.orgUnitId,
        createdAt: token.user.accountRequest?.invitedAt ?? token.createdAt,
        expiresAt: token.expiresAt,
        authorizedBy: token.user.accountRequest?.authorizedBy ?? null,
        authorizationRef: token.user.accountRequest?.authorizationRef ?? null,
        status:
          token.expiresAt.getTime() < now.getTime()
            ? "EXPIRED"
            : token.user.accountStatus === "PENDING_EMAIL_VERIFICATION"
              ? "SENT"
              : "ACCEPTED",
      }));

      res.status(200).json(withStatus);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * `POST /users/invites/:id/resend` — resend an invite email (T8)
 *
 * Reissues the single-use token: the old token row is deleted and a new one
 * created with a fresh hash and expiry, so a link that leaked cannot be used
 * after a resend. The account row is reused (a lapsed invite is not a
 * duplicate), exactly as the invite service does when it renews one.
 */
usersRouter.post(
  "/invites/:id/resend",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Invite ID is required" });
        return;
      }

      const invite = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          accountStatus: true,
          accountRequest: { select: { id: true, authorizedBy: true, authorizationRef: true } },
        },
      });

      if (!invite || invite.accountStatus !== "PENDING_EMAIL_VERIFICATION") {
        res.status(404).json({ error: "Invite not found" });
        return;
      }

      const { token, tokenHash } = newInviteToken();
      const newExpiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.emailToken.deleteMany({ where: { userId: id, type: "INVITE", usedAt: null } });
        await tx.emailToken.create({
          data: { userId: id, type: "INVITE", tokenHash, expiresAt: newExpiresAt },
        });
        await tx.adminActionLog.create({
          data: {
            actorId: req.user!.id,
            action: "ACCOUNT_INVITE_RESENT",
            targetUserId: id,
            after: { email: invite.email, role: invite.role, expiresAt: newExpiresAt.toISOString() },
            authorizedBy: invite.accountRequest?.authorizedBy ?? null,
            authorizationRef: invite.accountRequest?.authorizationRef ?? null,
          },
        });
      });

      const inviteUrl = `${process.env.SITE_ORIGIN || "https://cncs-pms-web.vercel.app"}/accept-invite?token=${token}`;
      await sendNotificationEmail({
        to: invite.email,
        subject: "Your CNCS Property Management Account Invite",
        body: `Hello ${invite.fullName},\n\nYou have been invited to join the CNCS Property Management System as ${invite.role}.\n\nClick the link below to set your password and activate your account:\n\n${inviteUrl}\n\nThis link expires in 72 hours.`,
      }).catch((err) => console.error("Failed to send invite email:", err));

      res.status(200).json({ message: "Invite resent successfully", expiresAt: newExpiresAt });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * `DELETE /users/invites/:id` — revoke an invite (T8)
 */
usersRouter.delete(
  "/invites/:id",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Invite ID is required" });
        return;
      }

      const invite = await prisma.user.findUnique({
        where: { id },
        select: { accountStatus: true },
      });

      if (!invite || invite.accountStatus !== "PENDING_EMAIL_VERIFICATION") {
        res.status(404).json({ error: "Invite not found" });
        return;
      }

      await prisma.user.delete({ where: { id } });
      res.status(200).json({ message: "Invite revoked successfully" });
    } catch (err) {
      next(err);
    }
  },
);
