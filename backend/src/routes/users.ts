import argon2 from "argon2";
import { Router, type NextFunction, type Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
  type UserRole,
} from "../middleware/auth.js";
import { normalizeEmail } from "../utils/email.js";
import {
  assertCanReview,
  ERROR_APPROVE_NOT_FOUND,
  ERROR_REJECTION_REASON,
  type AccountStatusValue,
} from "../services/accountApproval.js";

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
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    itemCount: user._count.ownedItems,
    /** The queue reads these; so does the accounts list, to show who is not yet active. */
    accountStatus: user.accountStatus,
    reviewedAt: user.reviewedAt,
    reviewNote: user.reviewNote,
  };
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
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      let where: Prisma.UserWhereInput = { accountStatus: "PENDING_APPROVAL" };

      // DEPARTMENT_HEAD only sees staff requests in their department
      if (user.role === "DEPARTMENT_HEAD") {
        where = {
          ...where,
          role: "STAFF",
          departmentId: user.departmentId ?? null,
        };
      }
      // ACCOUNT_ADMIN sees everything (no additional filter)

      const pending = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "asc" },
        select: userListSelect,
      });

      res.status(200).json(pending.map(toAdminUser));
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
 * Authorization rules (spec 3.1.4):
 * - ACCOUNT_ADMIN can approve privileged roles (DEPARTMENT_HEAD, PROPERTY_OFFICER,
 *   AUDITOR, ACCOUNT_ADMIN) and staff
 * - DEPARTMENT_HEAD can only approve STAFF in their department
 * - SYSTEM_ADMIN cannot approve (technical role only)
 *
 * Changing the role also bumps `tokenVersion`, the same way `promote` does.
 */
usersRouter.post(
  "/:id/approve",
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
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

      // No self-approval
      assertCanReview({
        targetId: existing.id,
        targetStatus: existing.accountStatus,
        reviewerId: req.user!.id,
      });

      const reviewer = req.user!;
      const hasExplicitRole = parsed.data.role !== undefined;
      const requestedRole = parsed.data.role ?? existing.role;

      // Authorization: validate the reviewer can assign this role
      if (reviewer.role === "SYSTEM_ADMIN") {
        // SYSTEM_ADMIN (merged with ACCOUNT_ADMIN per 12 Oct decision) can approve any role except SYSTEM_ADMIN
        if (requestedRole === "SYSTEM_ADMIN") {
          res.status(403).json({ error: "Cannot create SYSTEM_ADMIN accounts" });
          return;
        }
      } else if (reviewer.role === "DEPARTMENT_HEAD") {
        // DEPARTMENT_HEAD can only approve STAFF in their department
        if (requestedRole !== "STAFF") {
          res.status(403).json({ error: "Department heads can only approve staff accounts" });
          return;
        }
        if (!reviewer.departmentId || existing.departmentId !== reviewer.departmentId) {
          res.status(403).json({ error: "This account is not in your department" });
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

      const approved = await prisma.user.update({
        where: { id },
        data: updateData,
        select: userListSelect,
      });

      res.status(200).json(toAdminUser(approved));
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
  requireCapability("ACCOUNT_MANAGE"),
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

      // Same authorization as approve: DEPARTMENT_HEAD can only reject staff in their dept
      if (reviewer.role === "SYSTEM_ADMIN") {
        // SYSTEM_ADMIN can reject any account
      } else if (reviewer.role === "DEPARTMENT_HEAD") {
        if (existing.role !== "STAFF") {
          res.status(403).json({ error: "Department heads can only reject staff accounts" });
          return;
        }
        if (!reviewer.departmentId || existing.departmentId !== reviewer.departmentId) {
          res.status(403).json({ error: "This account is not in your department" });
          return;
        }
      }

      assertCanReview({
        targetId: existing.id,
        targetStatus: existing.accountStatus,
        reviewerId: req.user!.id,
      });

      const rejected = await prisma.user.update({
        where: { id },
        data: {
          accountStatus: "REJECTED",
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          reviewNote: parsed.data.reason,
        },
        select: userListSelect,
      });

      res.status(200).json(toAdminUser(rejected));
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.get(
  "/",
  authenticate,
  requireCapability("USER_READ"),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: userListSelect,
      });

      res.status(200).json(users.map(toAdminUser));
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

      res.status(200).json(toAdminUser(updated));
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

      if (existing.role === parsed.data.role) {
        res.status(409).json({ error: `This account is already ${parsed.data.role}` });
        return;
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { role: parsed.data.role, tokenVersion: { increment: 1 } },
        select: userListSelect,
      });

      res.status(200).json(toAdminUser(updated));
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
