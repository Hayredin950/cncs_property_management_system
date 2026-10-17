import argon2 from "argon2";
import crypto from "node:crypto";
import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import { isHttpError } from "../lib/httpError.js";
import { createRateLimiter, noRateLimit } from "../middleware/rateLimit.js";
import { normalizeEmail } from "../utils/email.js";
import { signInRefusal } from "../services/accountApproval.js";
import { acceptInvite, ERROR_INVITE_PASSWORD } from "../services/invites.js";

const router: ExpressRouter = Router();

/**
 * Login is the app's only unauthenticated write, so it is the only route worth
 * a limiter: without one, a script can guess a password as fast as the server
 * will hash. 10 attempts per IP per 15 minutes is generous for a human (a typo
 * or two) and useless as a brute-force budget. Disabled under test so a suite
 * that signs in repeatedly is not throttled; the limiter itself is unit-tested
 * directly.
 */
const loginLimiter =
  process.env.NODE_ENV === "test"
    ? noRateLimit
    : createRateLimiter({ windowMs: 15 * 60_000, max: 10, message: "Too many sign-in attempts. Try again in a few minutes." });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "At least 8 characters"),
});

const requestPasswordResetSchema = z.object({
  email: z.string().trim().min(1, "Email is required"),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Token is required"),
  newPassword: z.string().min(8, "At least 8 characters"),
});

const loginSchema = z
  .object({
    email: z.string().trim().min(1).optional(),
    id: z.string().trim().min(1).optional(),
    emailOrId: z.string().trim().min(1).optional(),
    identifier: z.string().trim().min(1).optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine(
    (data) =>
      Boolean(data.email || data.id || data.emailOrId || data.identifier),
    {
      message: "Email or ID is required",
      path: ["email"],
    }
  );

/**
 * Asking for an account (T4).
 *
 * The legacy flow this replaces — `POST /auth/register`, where an administrator
 * typed a password, read it out and picked the role on the spot — was removed on
 * 14 Oct, the same day privileged invitations landed (T6: `POST /users/invite` +
 * `POST /auth/accept-invite`). Leaving both would have left two answers to "who
 * approved this account", which is the duplication §5 of the design doc exists to
 * end.
 */
const accountRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  department: z.string().trim().min(1, "Department is required"),
});

/**
 * `POST /auth/account-requests` — ask for an account (spec 3.1.2).
 *
 * This is the door the supervisor's feedback asked for. Anyone may knock; nobody
 * gets in by knocking. The row is created `PENDING_APPROVAL`, which `POST /auth/login`
 * refuses, and a `SYSTEM_ADMIN` decides it from the queue (`GET /users/approvals`).
 *
 * Two deliberate properties:
 *
 *   - **The role is always `STAFF`.** A request carries no role field at all, so
 *     there is no payload that turns a request into a `SYSTEM_ADMIN` account. The
 *     real role is assigned by the approver, who knows who is asking.
 *   - **The person chooses their own password** (spec 3.3.7/12.5), which is what
 *     retires the admin-set-temporary-password flow: nothing here sets
 *     `mustChangePassword`, because there is no shared secret to replace.
 *
 * A duplicate address answers 409 with the same generic message the admin invite
 * uses — including when the existing row is itself waiting, which tells the person
 * to stop waiting twice without leaking any other account's state.
 */
router.post(
  ["/account-requests", "/auth/account-requests"],
  async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = accountRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Invalid request payload",
        details: parseResult.error.issues,
      });
    }

    const email = normalizeEmail(parseResult.data.email);

    try {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: "User with this email or ID already exists" });
      }

      const passwordHash = await argon2.hash(parseResult.data.password, {
        type: argon2.argon2id,
      });

      const requested = await prisma.user.create({
        data: {
          fullName: parseResult.data.fullName,
          email,
          passwordHash,
          role: "STAFF",
          accountStatus: "PENDING_APPROVAL",
          department: parseResult.data.department,
        },
        select: { id: true, fullName: true, email: true, accountStatus: true, createdAt: true },
      });

      // No token. There is nothing this request may do until it is approved —
      // returning one would be a session for an account the gate above refuses.
      return res.status(201).json({
        message: "Request submitted for approval",
        request: {
          id: requested.id,
          fullName: requested.fullName,
          email: requested.email,
          accountStatus: requested.accountStatus,
          requestedAt: requested.createdAt,
        },
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return res.status(409).json({ error: "User with this email or ID already exists" });
      }

      return res.status(500).json({ error: "Failed to submit the account request" });
    }
  }
);

/**
 * POST /auth/login
 * Public route to authenticate users.
 * Validates input, verifies argon2id hash, and issues a JWT with minimal payload (id, role).
 * Returns generic "Invalid credentials" error on nonexistent user or mismatched password.
 */
router.post(
  ["/login", "/auth/login"],
  loginLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    // Note on ordering below: the account-status gate runs *after* the password
    // check. Telling an unauthenticated caller that a given address has a pending
    // account would be an account-existence oracle, so a wrong password still
    // answers the same generic 401 it always did.

    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Invalid request payload",
        details: parseResult.error.issues,
      });
    }

    const { email, id, emailOrId, identifier, password } = parseResult.data;
    const effectiveIdentifier = (email ?? id ?? emailOrId ?? identifier)!;

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            /**
             * Case-insensitively, and that is the whole point of the change:
             * `admin@cncs.aau.edu.et` typed with a capital A is the same mailbox
             * and used to answer 401. The `id` arm stays exact — an id is an
             * identifier, and two ids differing only by case are two ids.
             */
            { email: { equals: effectiveIdentifier, mode: "insensitive" } },
            { id: effectiveIdentifier },
          ],
        },
      });

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isPasswordValid = await argon2.verify(user.passwordHash, password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // The supervisor's rule, from the other end: a request that nobody approved
      // cannot be signed into, and a rejected or deactivated account stays out.
      // 403 with the reason rather than 401 "Invalid credentials" — the password
      // was right, so telling the person it was wrong is the unhelpful answer.
      const refusal = signInRefusal(user.accountStatus);
      if (refusal) {
        return res.status(403).json({ error: refusal, accountStatus: user.accountStatus });
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error("JWT_SECRET is not set in environment variables");
      }

      // `ver` is what makes the session revocable: `authenticate` compares it
      // to the account's current `tokenVersion` and rejects a mismatch, so a
      // password change invalidates every token this account had.
      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
          orgUnitId: user.orgUnitId,
          ver: user.tokenVersion,
        },
        secret,
        {
          expiresIn: "1d",
        }
      );

      const safeUser = {
        id: user.id,
        name: user.fullName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        mustChangePassword: user.mustChangePassword,
      };

      return res.status(200).json({
        token,
        user: safeUser,
        ...safeUser,
      });
    } catch (error: unknown) {
      console.error(
        "Login error:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({
        error: "Internal server error",
      });
    }
  }
);

/**
 * GET /auth/me
 * Protected route to get the authenticated user's profile.
 * Reads decoded token off req.user, fetches record from database,
 * and returns safe user data excluding password hash.
 */
router.get(
  ["/me", "/auth/me"],
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          orgUnitId: true,
          orgUnitRef: { select: { id: true, name: true } },
          headedOrgUnit: { select: { id: true, name: true } },
          createdAt: true,
          mustChangePassword: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const department = user.headedOrgUnit?.name || user.orgUnitRef?.name || undefined;
      const departmentId = user.headedOrgUnit?.id || user.orgUnitId || undefined;

      const safeUser = {
        id: user.id,
        name: user.fullName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        department,
        departmentId,
        createdAt: user.createdAt,
        mustChangePassword: user.mustChangePassword,
      };

      return res.status(200).json({
        user: safeUser,
        ...safeUser,
      });
    } catch (error: unknown) {
      console.error(
        "Get current user error:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({
        error: "Internal server error",
      });
    }
  }
);

/**
 * POST /auth/change-password — a signed-in account changes its own password.
 *
 * Covers both cases with one endpoint: the ordinary "I want a new password",
 * and the forced change after an administrator reset (`mustChangePassword`).
 * The current password is always required — even in the forced case the holder
 * just used it to sign in, so asking for it again is no burden and closes the
 * window where someone walks up to an unlocked, already-signed-in screen.
 *
 * On success the account's `tokenVersion` is bumped, which revokes every session
 * it had open, and a fresh token (carrying the new version) is returned so the
 * caller stays signed in on this device alone. The claim that a password change
 * logs everyone else out is only true because of that bump.
 */
router.post(
  ["/change-password", "/auth/change-password"],
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = changePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Invalid request payload",
        details: parseResult.error.issues,
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { currentPassword, newPassword } = parseResult.data;

    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const currentIsValid = await argon2.verify(user.passwordHash, currentPassword);
      if (!currentIsValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      /**
       * A "change" to the password the account already has is not a change, and
       * the forced screen is where that stops being theoretical: an administrator
       * resets an account, the holder is asked to choose a new password, types the
       * temporary one back — and `mustChangePassword` clears while the credential
       * is exactly what the administrator set. The account then reads as reset and
       * is not.
       *
       * Checked against the password just verified rather than a password history,
       * which does not exist and is out of scope; this is the case that actually
       * happens, and it is the one the requirement cares about.
       */
      if (newPassword === currentPassword) {
        return res.status(400).json({
          error: "The new password has to differ from your current one",
        });
      }

      const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
      const tokenVersion = user.tokenVersion + 1;

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, tokenVersion },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          departmentId: true,
          createdAt: true,
          mustChangePassword: true,
          tokenVersion: true,
        },
      });

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error("JWT_SECRET is not set in environment variables");
      }
      const token = jwt.sign(
        {
          id: updated.id,
          role: updated.role,
          departmentId: updated.departmentId,
          ver: updated.tokenVersion,
        },
        secret,
        { expiresIn: "1d" },
      );

      const safeUser = {
        id: updated.id,
        name: updated.fullName,
        fullName: updated.fullName,
        email: updated.email,
        role: updated.role,
        createdAt: updated.createdAt,
        mustChangePassword: updated.mustChangePassword,
      };

      return res.status(200).json({ token, user: safeUser, ...safeUser });
    } catch (error: unknown) {
      console.error(
        "Change password error:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

const acceptInviteSchema = z.object({
  token: z.string().trim().min(1, "The invite link is missing its token"),
  password: z.string().min(8, ERROR_INVITE_PASSWORD),
  /**
   * Their own name, optional. The invitation names an email and a post, never a
   * person, so this is the one moment the system can learn it from the only
   * source that knows — without an administrator guessing on their behalf.
   */
  fullName: z.string().trim().min(2, "Enter your full name").max(120).optional(),
});

/**
 * `POST /auth/accept-invite` — the invitee sets their own password (T6).
 *
 * Public, because the whole point is that the person does not have an account yet:
 * the invitation exists precisely so that nobody — including the administrator who
 * issued it — ever knows this person's password. The account is created by
 * `POST /users/invite` with a hash of a random secret nobody holds, and this is
 * the only route that replaces it.
 *
 * The token is the credential, and it is a single-use, expiring, hashed-at-rest
 * secret (`services/invites.ts`), so this route needs no rate limiter of its own:
 * the lookup that happens before any hashing cannot be satisfied by guessing, and
 * a submission that fails it costs one indexed read. A valid token **is** enough
 * to spend an argon2 hash on, and it is spent exactly once — the consume-first
 * transaction is what makes "once" true even if two requests arrive together.
 *
 * On success the invitation is spent and the account is `ACTIVE`, so the response
 * carries a session — the same `{ token, user }` shape `POST /auth/login`
 * returns. Making the invitee sign in immediately after choosing a password would
 * be asking them to prove a credential they just set, on a device they are already
 * holding.
 */
router.post(
  ["/accept-invite", "/auth/accept-invite"],
  async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = acceptInviteSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Invalid request payload",
        details: parseResult.error.issues,
      });
    }

    try {
      const accepted = await acceptInvite(parseResult.data);

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error("JWT_SECRET is not set in environment variables");
      }

      const token = jwt.sign(
        {
          id: accepted.userId,
          role: accepted.role,
          ver: accepted.tokenVersion,
        },
        secret,
        { expiresIn: "1d" },
      );

      const safeUser = {
        id: accepted.userId,
        name: accepted.fullName,
        fullName: accepted.fullName,
        email: accepted.email,
        role: accepted.role,
        mustChangePassword: false,
      };

      return res.status(200).json({
        token,
        user: safeUser,
        ...safeUser,
        /** Non-null when accepting this invite made them the head of a unit. */
        headedUnitId: accepted.headedUnitId,
      });
    } catch (error: unknown) {
      /**
       * An expired, used or unrecognised link is a 400 with the reason — not the
       * 500 this used to be able to become. These three are the expected outcomes
       * of an invitation flow, and the person reading the screen has to be told
       * which one happened and what to do about it.
       */
      if (isHttpError(error)) {
        return res.status(error.status).json({
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }

      console.error("Accept invite error:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * §10.2: POST /auth/request-password-reset
 * Initiates password reset flow. Anti-enumeration: always returns same response.
 */
router.post(
  "/request-password-reset",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = requestPasswordResetSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const email = normalizeEmail(parsed.data.email);

      // Anti-enumeration: always return success, even if email doesn't exist
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, accountStatus: true },
      });

      if (user && user.accountStatus === "ACTIVE") {
        // Generate reset token (using emailToken table for single-use expiring tokens)
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.emailToken.create({
          data: {
            userId: user.id,
            type: "RESET",
            tokenHash,
            expiresAt,
          },
        });

        // In production, send email with token. For now, log it.
        console.log(`Password reset token for ${email}: ${token}`);
      }

      res.status(200).json({ message: "If the email exists, a reset link has been sent" });
    } catch (_err) {
      res.status(500).json({ error: "Failed to process request" });
    }
  }
);

/**
 * §10.2: POST /auth/reset-password
 * Completes password reset using the token. Bumps tokenVersion to kill old sessions.
 */
router.post(
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Token and new password are required" });
        return;
      }

      const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");

      const tokenRecord = await prisma.emailToken.findFirst({
        where: { tokenHash, type: "RESET" },
        select: {
          id: true,
          usedAt: true,
          expiresAt: true,
          userId: true,
        },
      });

      if (!tokenRecord) {
        res.status(400).json({ error: "Invalid or expired token" });
        return;
      }

      if (tokenRecord.usedAt) {
        res.status(400).json({ error: "Token has already been used" });
        return;
      }

      if (tokenRecord.expiresAt.getTime() <= Date.now()) {
        res.status(400).json({ error: "Token has expired" });
        return;
      }

      const passwordHash = await argon2.hash(parsed.data.newPassword, {
        type: argon2.argon2id,
      });

      await prisma.$transaction(async (tx) => {
        // Mark token as used
        await tx.emailToken.update({
          where: { id: tokenRecord.id },
          data: { usedAt: new Date() },
        });

        // Update password and bump tokenVersion
        await tx.user.update({
          where: { id: tokenRecord.userId },
          data: {
            passwordHash,
            tokenVersion: { increment: 1 },
            mustChangePassword: false,
          },
        });
      });

      res.status(200).json({ message: "Password reset successfully" });
    } catch (_err) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);

export default router;

