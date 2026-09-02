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

const router: ExpressRouter = Router();

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
    const effectiveEmail = (email ?? emailOrId ?? id)!;
    const effectiveId = id;

    try {
      const orConditions: Array<{ email?: string; id?: string }> = [
        { email: effectiveEmail },
        { id: effectiveEmail },
      ];

      if (effectiveId && effectiveId !== effectiveEmail) {
        orConditions.push({ id: effectiveId });
        orConditions.push({ email: effectiveId });
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
            { email: effectiveIdentifier },
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

      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
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

export default router;

