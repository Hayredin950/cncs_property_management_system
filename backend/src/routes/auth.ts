import argon2 from "argon2";
import { Router, type Response, type Router as ExpressRouter } from "express";
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

export default router;
