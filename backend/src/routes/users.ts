import argon2 from "argon2";
import crypto from "node:crypto";
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
import { sendEmail, renderEmailTemplate, sendNotificationEmail } from "../services/email.js";
import {
  assertInvitable,
  createPrivilegedInvite,
  ERROR_INVITE_AUTHORIZATION_REF,
  ERROR_INVITE_AUTHORIZED_BY,
  INVITABLE_ROLES,
  INVITE_TTL_HOURS,
  type InvitableRole,
} from "../services/invites.js";
import { executeHandover } from "../services/handover.js";
import { allow, assertOfficerAuditorExclusion } from "../services/permissions.js";

export const usersRouter: Router = Router();

const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").optional(),
    email: z.string().trim().email("Enter a valid email").optional(),
  })
  .refine((data) => data.fullName !== undefined || data.email !== undefined, {
    message: "Nothing to update",
  });

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, ERROR_REJECTION_REASON)
    .max(500, ERROR_REJECTION_REASON),
});

const designationSchema = z.object({
  designation: z.string().trim().min(1, "Designation name is required"),
  orgUnitId: z.string().trim().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
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
  staffId: true,
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
  staffId?: string | null;
  _count?: { ownedItems: number };
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    itemCount: user._count?.ownedItems ?? 0,
    accountStatus: user.accountStatus,
    reviewedAt: user.reviewedAt,
    reviewNote: user.reviewNote,
    staffId: user.staffId ?? null,
  };
}

/**
 * GET /users — accounts list for administrators and Property Officer.
 */
usersRouter.get(
  "/",
  authenticate,
  requireCapability("USER_READ"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const where: Prisma.UserWhereInput = {};

      if (user.role === "DEPARTMENT_HEAD" && user.orgUnitId) {
        where.orgUnitId = user.orgUnitId;
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: userListSelect,
      });

      res.status(200).json(users.map(toAdminUser));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /users/:id — update name or email.
 */
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

      const parsed = updateUserSchema.safeParse(req.body ?? {});
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

      const updateData: Prisma.UserUpdateInput = {};
      if (parsed.data.fullName) updateData.fullName = parsed.data.fullName;

      if (parsed.data.email) {
        const normalized = normalizeEmail(parsed.data.email);
        const clashing = await prisma.user.findFirst({
          where: {
            id: { not: id },
            email: { equals: normalized, mode: "insensitive" },
          },
        });
        if (clashing) {
          res.status(409).json({ error: "Email is already in use by another account" });
          return;
        }
        updateData.email = normalized;
      }

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        select: userListSelect,
      });

      res.status(200).json(toAdminUser(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/:id/promote — change an account's role. Bumps tokenVersion.
 */
usersRouter.post(
  "/:id/promote",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "User ID is required" });
        return;
      }
      const targetRole = req.body?.role as UserRole | undefined;

      if (!targetRole || !["SYSTEM_ADMIN", "ACCOUNT_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"].includes(targetRole)) {
        res.status(400).json({ error: "Valid target role is required" });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      if (existing.role === targetRole) {
        res.status(409).json({ error: "Account already holds this role" });
        return;
      }

      // Check PO and Auditor mutual exclusion
      assertOfficerAuditorExclusion(existing.role, targetRole);

      const updated = await prisma.user.update({
        where: { id },
        data: {
          role: targetRole,
          tokenVersion: { increment: 1 },
        },
        select: userListSelect,
      });

      res.status(200).json(toAdminUser(updated));
    } catch (err: any) {
      if (err.message && err.message.includes("Property Officer and Auditor")) {
        res.status(409).json({ error: err.message });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /users/approvals — registration approvals queue.
 * - Department Head sees verified (PENDING_APPROVAL) staff requests in own department.
 * - Account Admin sees fallback queue only: vacant head or pending > 5 days.
 * - System Admin strictly excluded (403).
 */
usersRouter.get(
  "/approvals",
  authenticate,
  requireAnyCapability("ACCOUNT_APPROVE", "ACCOUNT_APPROVE_ANY", "ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reviewer = req.user!;

      // System Admin has no part in registration approvals
      if (reviewer.role === "SYSTEM_ADMIN") {
        res.status(403).json({ error: "System Admin has no part in registration approvals" });
        return;
      }

      if (reviewer.role === "DEPARTMENT_HEAD") {
        if (!reviewer.orgUnitId) {
          res.status(403).json({ error: "You are not assigned to a department" });
          return;
        }

        const pending = await prisma.user.findMany({
          where: {
            accountStatus: "PENDING_APPROVAL",
            orgUnitId: reviewer.orgUnitId,
            role: "STAFF",
          },
          orderBy: { createdAt: "asc" },
          select: userListSelect,
        });

        res.status(200).json(pending.map(toAdminUser));
        return;
      }

      if (reviewer.role === "ACCOUNT_ADMIN") {
        // Fallback trigger: department has no active head, OR pending > 5 days
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

        const pending = await prisma.user.findMany({
          where: {
            accountStatus: "PENDING_APPROVAL",
            role: "STAFF",
            OR: [
              { orgUnitId: null },
              { orgUnitRef: { headId: null } },
              { orgUnitRef: { head: { accountStatus: { not: "ACTIVE" } } } },
              { createdAt: { lte: fiveDaysAgo } },
            ],
          },
          orderBy: { createdAt: "asc" },
          select: userListSelect,
        });

        res.status(200).json(pending.map(toAdminUser));
        return;
      }

      res.status(403).json({ error: "Insufficient permissions" });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/:id/approve — approve a pending staff registration.
 */
usersRouter.post(
  "/:id/approve",
  authenticate,
  requireAnyCapability("ACCOUNT_APPROVE", "ACCOUNT_APPROVE_ANY", "ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const reviewer = req.user!;

      // System Admin has no part in registration approvals
      if (reviewer.role === "SYSTEM_ADMIN") {
        res.status(403).json({ error: "System Admin has no part in registration approvals" });
        return;
      }

      // No self-approval (hide existence with 404 per test expectations)
      if (reviewer.id === id) {
        res.status(404).json({ error: "You cannot approve your own account request" });
        return;
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        include: { orgUnitRef: { select: { id: true, name: true, headId: true, head: { select: { accountStatus: true } } } } },
      });

      if (!existing) {
        res.status(404).json({ error: ERROR_APPROVE_NOT_FOUND });
        return;
      }

      if (existing.accountStatus !== "PENDING_APPROVAL") {
        res.status(404).json({ error: "Account is not awaiting approval" });
        return;
      }

      let fallbackReason: string | null = null;

      if (reviewer.role === "DEPARTMENT_HEAD") {
        if (!reviewer.orgUnitId || existing.orgUnitId !== reviewer.orgUnitId) {
          res.status(404).json({ error: "Not authorized to approve this request" });
          return;
        }
      } else if (reviewer.role === "ACCOUNT_ADMIN") {
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const unit = existing.orgUnitRef;
        const isVacant = !unit || !unit.headId || unit.head?.accountStatus !== "ACTIVE";
        const isStale = existing.createdAt <= fiveDaysAgo;

        if (!isVacant && !isStale) {
          res.status(404).json({
            error: "Request is waiting for department head approval and has not met fallback criteria",
          });
          return;
        }
        fallbackReason = isVacant ? "head unavailable" : "pending > 5 days (fallback approval)";
      }

      const assignedRole = (req.body?.role as UserRole | undefined) ?? "STAFF";

      const approved = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            accountStatus: "ACTIVE",
            reviewedById: reviewer.id,
            reviewedAt: new Date(),
            reviewNote: fallbackReason,
            role: assignedRole,
            tokenVersion: { increment: 1 },
          },
          select: userListSelect,
        });

        if (tx.adminActionLog) {
          await tx.adminActionLog.create({
            data: {
              actorId: reviewer.id,
              action: "ACCOUNT_APPROVED",
              targetUserId: existing.id,
              unitId: existing.orgUnitId ?? null,
              before: { accountStatus: existing.accountStatus, role: existing.role },
              after: { accountStatus: "ACTIVE", role: assignedRole, fallbackReason },
            },
          });
        }

        return updated;
      });

      // Send decision email
      const rendered = renderEmailTemplate("decision", {
        status: "ACTIVE",
        name: approved.fullName,
        role: approved.role,
        department: existing.orgUnitRef?.name || "CNCS",
      });

      sendEmail({
        to: approved.email,
        subject: rendered.subject,
        body: rendered.body,
        html: rendered.html,
        template: "decision",
      }).catch((err) => console.error("Failed to send approval email:", err));

      res.status(200).json(toAdminUser(approved));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/:id/reject — decline a registration request.
 */
usersRouter.post(
  "/:id/reject",
  authenticate,
  requireAnyCapability("ACCOUNT_APPROVE", "ACCOUNT_APPROVE_ANY", "ACCOUNT_APPROVE_OWN_UNIT"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const reviewer = req.user!;
      if (reviewer.role === "SYSTEM_ADMIN") {
        res.status(403).json({ error: "System Admin has no part in registration decisions" });
        return;
      }

      if (reviewer.id === id) {
        res.status(404).json({ error: "You cannot reject your own account request" });
        return;
      }

      const parsed = rejectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: ERROR_REJECTION_REASON });
        return;
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        include: { orgUnitRef: { select: { id: true, name: true, headId: true, head: { select: { accountStatus: true } } } } },
      });

      if (!existing) {
        res.status(404).json({ error: ERROR_APPROVE_NOT_FOUND });
        return;
      }

      if (existing.accountStatus !== "PENDING_APPROVAL") {
        res.status(404).json({ error: "Account is not awaiting approval" });
        return;
      }

      if (reviewer.role === "DEPARTMENT_HEAD") {
        if (!reviewer.orgUnitId || existing.orgUnitId !== reviewer.orgUnitId) {
          res.status(404).json({ error: "Not authorized to reject this request" });
          return;
        }
      }

      const rejected = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            accountStatus: "REJECTED",
            reviewedById: reviewer.id,
            reviewedAt: new Date(),
            reviewNote: parsed.data.reason,
          },
          select: userListSelect,
        });

        if (tx.adminActionLog) {
          await tx.adminActionLog.create({
            data: {
              actorId: reviewer.id,
              action: "ACCOUNT_REJECTED",
              targetUserId: existing.id,
              unitId: existing.orgUnitId ?? null,
              before: { accountStatus: existing.accountStatus },
              after: { accountStatus: "REJECTED", reason: parsed.data.reason },
            },
          });
        }

        return updated;
      });

      // Send rejection email
      const rendered = renderEmailTemplate("decision", {
        status: "REJECTED",
        name: rejected.fullName,
        reason: parsed.data.reason,
        department: existing.orgUnitRef?.name || "CNCS",
      });

      sendEmail({
        to: rejected.email,
        subject: rendered.subject,
        body: rendered.body,
        html: rendered.html,
        template: "decision",
      }).catch((err) => console.error("Failed to send rejection email:", err));

      res.status(200).json(toAdminUser(rejected));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/invite — create a privileged account by invitation.
 * - Account Admin invites Heads, Property Officer, Auditors, other Account Admins.
 * - System Admin seeds first Account Admin only.
 */
const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(INVITABLE_ROLES, {
    message: "A privileged invite is for a department head, property officer, auditor or account admin",
  }),
  unitId: z.string().trim().min(1).nullish(),
  authorizedBy: z.string().trim().min(1, ERROR_INVITE_AUTHORIZED_BY).max(200),
  authorizationRef: z.string().trim().min(1, ERROR_INVITE_AUTHORIZATION_REF).max(200),
  authorizationNote: z.string().trim().max(500).nullish(),
});

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

      // System Admin can only seed Account Admin
      if (actor.role === "SYSTEM_ADMIN" && role !== "ACCOUNT_ADMIN") {
        res.status(403).json({ error: "System Admin can only invite an Account Admin" });
        return;
      }

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

      const liveInvite = account?.emailTokens.length ? { role: account.role } : null;
      const lapsedInviteUserId =
        account && !liveInvite && account.accountStatus === "PENDING_EMAIL_VERIFICATION"
          ? account.id
          : null;
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
        }
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
        lapsedInviteUserId
      );

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
        userId: invite.userId,
        role: invite.role,
        inviteUrl: invite.inviteUrl,
        expiresAt: invite.expiresAt,
        email: delivery,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/:id/deactivate — deactivate an account.
 * Replaces hard delete.
 * - Department Head deactivates own unit staff.
 * - Account Admin deactivates Heads and Auditors.
 * - System Admin deactivates Account Admins.
 * Moves held items to department in REVERTED_UNVERIFIED.
 * Kills sessions by bumping tokenVersion.
 */
usersRouter.post(
  "/:id/deactivate",
  authenticate,
  requireAnyCapability("ACCOUNT_DEACTIVATE", "ACCOUNT_DEACTIVATE_OWN_UNIT", "ACCOUNT_DEACTIVATE_PRIVILEGED"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const actor = req.user!;
      if (actor.id === id) {
        res.status(400).json({ error: "You cannot deactivate your own account" });
        return;
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, accountStatus: true, orgUnitId: true, fullName: true, email: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      if (existing.accountStatus === "DEACTIVATED") {
        res.status(409).json({ error: "Account is already deactivated" });
        return;
      }

      // Check permission via central allow() function
      const canDeactivate = allow(actor, "ACCOUNT_DEACTIVATE", {
        targetUserId: existing.id,
        targetUserRole: existing.role,
        targetUserUnitId: existing.orgUnitId,
      });

      if (!canDeactivate) {
        res.status(403).json({ error: "Insufficient permissions to deactivate this account" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        // If department head deactivated, vacate unit headId
        if (existing.role === "DEPARTMENT_HEAD" && existing.orgUnitId) {
          await tx.orgUnit.updateMany({
            where: { id: existing.orgUnitId, headId: existing.id },
            data: { headId: null },
          });
        }

        // Revert items held by this user to DEPARTMENT in REVERTED_UNVERIFIED
        const heldItems = await tx.item.findMany({
          where: { holderId: existing.id, holderType: "STAFF" },
          select: { id: true },
        });

        for (const item of heldItems) {
          await tx.item.update({
            where: { id: item.id },
            data: {
              status: "REVERTED_UNVERIFIED",
              holderType: "DEPARTMENT",
              holderId: existing.orgUnitId ?? null,
            },
          });

          await tx.custodyEvent.create({
            data: {
              itemId: item.id,
              eventType: "HOLDER_DEACTIVATED",
              fromHolderType: "STAFF",
              fromHolderId: existing.id,
              toHolderType: "DEPARTMENT",
              toHolderId: existing.orgUnitId ?? null,
              actingUserId: actor.id,
              reason: "Holder deactivated",
            },
          });
        }

        // Deactivate user and bump tokenVersion
        await tx.user.update({
          where: { id },
          data: {
            accountStatus: "DEACTIVATED",
            tokenVersion: { increment: 1 },
          },
        });

        if (tx.adminActionLog) {
          await tx.adminActionLog.create({
            data: {
              actorId: actor.id,
              action: "ACCOUNT_DEACTIVATED",
              targetUserId: existing.id,
              unitId: existing.orgUnitId ?? null,
              before: { accountStatus: existing.accountStatus, role: existing.role },
              after: { accountStatus: "DEACTIVATED" },
            },
          });
        }
      });

      res.status(200).json({ id, deactivated: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/:id/send-reset-link — send a password reset link to an active account.
 * Account Admin initiates link, never sets a password directly.
 */
usersRouter.post(
  "/:id/send-reset-link",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "User ID is required" });
        return;
      }
      const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, fullName: true, accountStatus: true },
      });

      if (!target) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      if (target.accountStatus !== "ACTIVE") {
        res.status(400).json({ error: "Password reset links can only be sent to active accounts" });
        return;
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

      await prisma.emailToken.create({
        data: {
          userId: target.id,
          type: "RESET",
          tokenHash,
          expiresAt,
        },
      });

      const rendered = renderEmailTemplate("reset", {
        name: target.fullName,
        token: rawToken,
      });

      sendEmail({
        to: target.email,
        subject: rendered.subject,
        body: rendered.body,
        html: rendered.html,
        template: "reset",
      }).catch((err) => console.error("Failed to queue reset link email:", err));

      res.status(200).json({ message: "Password reset link sent to user email" });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/:id/designations — grant a designation (Section 2.3).
 * Account Admin only.
 */
usersRouter.post(
  "/:id/designations",
  authenticate,
  requireCapability("DESIGNATION_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "User ID is required" });
        return;
      }
      const parsed = designationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid designation payload" });
        return;
      }

      const { designation, orgUnitId, expiresAt } = parsed.data;

      // Section 2.1: Designations can NEVER grant PROPERTY_OFFICER or AUDITOR
      if (designation === "PROPERTY_OFFICER" || designation === "AUDITOR") {
        res.status(400).json({ error: "Designations cannot grant Property Officer or Auditor roles" });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const record = await prisma.$transaction(async (tx) => {
        const created = await tx.designation.create({
          data: {
            userId: id,
            designation,
            orgUnitId: orgUnitId ?? null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            grantedById: req.user!.id,
          },
        });

        // Bumps tokenVersion so user gets refreshed permissions
        await tx.user.update({
          where: { id },
          data: { tokenVersion: { increment: 1 } },
        });

        if (tx.adminActionLog) {
          await tx.adminActionLog.create({
            data: {
              actorId: req.user!.id,
              action: "DESIGNATION_GRANTED",
              targetUserId: id,
              unitId: orgUnitId ?? null,
              after: { designation, orgUnitId, expiresAt },
            },
          });
        }

        return created;
      });

      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /users/:id/designations/:designationId/revoke — revoke a designation.
 * Account Admin only.
 */
usersRouter.post(
  "/:id/designations/:designationId/revoke",
  authenticate,
  requireCapability("DESIGNATION_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const designationId = Array.isArray(req.params.designationId) ? req.params.designationId[0] : req.params.designationId;
      if (!id || !designationId) {
        res.status(400).json({ error: "User ID and designation ID are required" });
        return;
      }

      const record = await prisma.designation.findUnique({
        where: { id: designationId },
      });

      if (!record || record.userId !== id) {
        res.status(404).json({ error: "Designation not found" });
        return;
      }

      if (record.revokedAt) {
        res.status(409).json({ error: "Designation is already revoked" });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const rev = await tx.designation.update({
          where: { id: designationId },
          data: { revokedAt: new Date() },
        });

        await tx.user.update({
          where: { id },
          data: { tokenVersion: { increment: 1 } },
        });

        if (tx.adminActionLog) {
          await tx.adminActionLog.create({
            data: {
              actorId: req.user!.id,
              action: "DESIGNATION_REVOKED",
              targetUserId: id,
              unitId: record.orgUnitId,
              after: { designation: record.designation, revokedAt: new Date() },
            },
          });
        }

        return rev;
      });

      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /users/:id/designations — list designations for a user.
 */
usersRouter.get(
  "/:id/designations",
  authenticate,
  requireCapability("USER_READ"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "User ID is required" });
        return;
      }
      const designations = await prisma.designation.findMany({
        where: { userId: id },
        orderBy: { grantedAt: "desc" },
      });
      res.status(200).json(designations);
    } catch (err) {
      next(err);
    }
  }
);
