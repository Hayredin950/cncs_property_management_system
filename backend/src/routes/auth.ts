import argon2 from "argon2";
import { Router, type Response, type Router as ExpressRouter } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { createRateLimiter, noRateLimit } from "../middleware/rateLimit.js";
import { normalizeEmail } from "../utils/email.js";

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
    role: z.enum(["ADMIN", "STAFF"], {
      message: "Role must be either ADMIN or STAFF",
    }),
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
 * Admin-only route to register a new user (ADMIN or STAFF).
 * Validates payload, verifies uniqueness, hashes password with argon2id,
 * and returns safe user data without exposing password hashes.
 */
router.post(
  ["/register", "/auth/register"],
  authenticate,
  requireRole(["ADMIN"]),
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
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      const safeUser = {
        id: newUser.id,
        name: newUser.fullName,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
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
        { id: updated.id, role: updated.role, ver: updated.tokenVersion },
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

