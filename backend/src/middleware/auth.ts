import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";

export type UserRole = "ADMIN" | "STAFF";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
  };
}

interface JwtPayload {
  id: string;
  role: UserRole;
}

/**
 * Verifies the JWT from the Authorization header ("Bearer <token>") and
 * attaches the decoded { id, role } to req.user. Does NOT enforce a role —
 * routes that need a specific role should chain requireRole() after this.
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Fail loudly in dev/CI rather than silently trusting an unsigned token
      throw new Error("JWT_SECRET is not set in environment variables");
    }
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Usage: router.post("/items", authenticate, requireRole(["ADMIN", "STAFF"]), handler)
 * Must run AFTER authenticate() — relies on req.user already being set.
 */
export function requireRole(roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
