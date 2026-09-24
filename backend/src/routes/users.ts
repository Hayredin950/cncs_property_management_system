import argon2 from "argon2";
import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

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

/** The account fields an administrator sees. Never the password hash. */
const userListSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  createdAt: true,
  _count: { select: { ownedItems: true } },
} as const;

function toAdminUser(user: {
  id: string;
  fullName: string;
  email: string;
  role: "ADMIN" | "STAFF";
  createdAt: Date;
  _count: { ownedItems: number };
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    itemCount: user._count.ownedItems,
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
 */
usersRouter.get(
  "/",
  authenticate,
  requireRole(["ADMIN"]),
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
  requireRole(["ADMIN"]),
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

      const { fullName, email } = parsed.data;

      // Changing an email to one already in use is a 409, not a 500 from the
      // unique constraint — checked here so the message can name the conflict.
      if (email && email !== existing.email) {
        const clash = await prisma.user.findUnique({ where: { email } });
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

/** `POST /users/:id/promote` — STAFF → ADMIN. There is no demote. */
usersRouter.post(
  "/:id/promote",
  authenticate,
  requireRole(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Account ID is required" });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      if (existing.role === "ADMIN") {
        res.status(409).json({ error: "This account is already an administrator" });
        return;
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { role: "ADMIN" },
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
  requireRole(["ADMIN"]),
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
  requireRole(["ADMIN"]),
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
