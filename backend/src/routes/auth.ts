import argon2 from "argon2";
import { Router, type Response, type Router as ExpressRouter } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { createRateLimiter, noRateLimit } from "../middleware/rateLimit.js";
import { normalizeEmail } from "../utils/email.js";
import { signInRefusal } from "../services/accountApproval.js";

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

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").optional(),
    fullName: z.string().trim().min(1, "Full name is required").optional(),
    email: z.string().trim().min(1, "Email is required").optional(),
    id: z.string().trim().min(1, "ID is required").optional(),
    emailOrId: z.string().trim().min(1, "Email or ID is required").optional(),
    password: z.string().min(1, "Password is required"),
    role: z.enum(
      ["SYSTEM_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"],
      { message: "Role must be one of the five system roles" },
    ),
  })
  .refine((data) => Boolean(data.name || data.fullName), {
    message: "Name is required",
    path: ["name"],
  })
  .refine((data) => Boolean(data.email || data.id || data.emailOrId), {
    message: "Email or ID is required",
    path: ["email"],
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
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
 * POST /auth/register
 * Admin-only route to register a new user (the five spec roles).
 * Validates payload, verifies uniqueness, hashes password with argon2id,
 * and returns safe user data without exposing password hashes.
 *
 * This is an **invite**, not a request: the administrator is the approver, so the
 * account is created `ACTIVE` and the decision is recorded (`reviewedById`) rather
 * than left looking unreviewed in the approval queue. People who were not invited
 * ask for an account through `POST /auth/account-requests` instead, and that one
 * lands `PENDING_APPROVAL` and cannot sign in until an administrator decides.
 *
 * The password here is an **initial, temporary** one an administrator typed and
 * passes on, so the account is created flagged `mustChangePassword`. Without
 * that flag the holder signs in with the shared secret and is never asked to
 * replace it — which is exactly the "forced change on first sign-in" the reset
 * flow already promises. The client routers redirect on the flag (`RequireAuth`
 * on the web, the go_router guard on mobile), so setting it here is what makes
 * a brand-new account behave like a reset one.
 */
router.post(
  ["/register", "/auth/register"],
  authenticate,
  requireCapability("ACCOUNT_MANAGE"),
  async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message ?? "Invalid request payload",
        details: parseResult.error.issues,
      });
    }

    const { name, fullName, email, id, emailOrId, password, role } = parseResult.data;
    const resolvedName = (name ?? fullName)!;
    const effectiveEmail = normalizeEmail((email ?? emailOrId ?? id)!);
    const effectiveId = id;

    try {
      /**
       * The email arms match without regard to case — see `utils/email.ts`.
       * Without that, registering `Admin@x` beside an existing `admin@x` passes
       * this check and creates the second account for one address. The `id` arms
       * stay exact: `STAFF-007` and `staff-007` are different ids, and the value
       * may not be an address at all.
       */
      const orConditions: Array<{
        email?: { equals: string; mode: "insensitive" };
        id?: string;
      }> = [
        { email: { equals: effectiveEmail, mode: "insensitive" } },
        { id: effectiveEmail },
      ];

      if (effectiveId && effectiveId !== effectiveEmail) {
        orConditions.push({ id: effectiveId });
        orConditions.push({ email: { equals: effectiveId, mode: "insensitive" } });
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: orConditions,
        },
      });

      if (existingUser) {
        return res.status(409).json({
          error: "User with this email or ID already exists",
        });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      const newUser = await prisma.user.create({
        data: {
          ...(effectiveId ? { id: effectiveId } : {}),
          fullName: resolvedName,
          email: effectiveEmail,
          passwordHash,
          role,
          mustChangePassword: true,
          // An invite is approved by its inviter: the account never sits in the
          // queue, and the record says who let it in (spec 3.1.2).
          accountStatus: "ACTIVE",
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          createdAt: true,
          mustChangePassword: true,
        },
      });

      const safeUser = {
        id: newUser.id,
        name: newUser.fullName,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
        mustChangePassword: newUser.mustChangePassword,
      };

      return res.status(201).json({
        message: "User registered successfully",
        user: safeUser,
        ...safeUser,
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return res.status(409).json({
          error: "User with this email or ID already exists",
        });
      }

      return res.status(500).json({
        error: "Failed to register user",
      });
    }
  }
);

const accountRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
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
          departmentId: user.departmentId,
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
          departmentId: true,
          createdAt: true,
          mustChangePassword: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

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

export default router;

