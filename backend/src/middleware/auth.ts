import type { Request as ExpressRequest, NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { hasCapability, type Capability } from "../services/permissions.js";
import { canHoldSession } from "../services/accountApproval.js";

/** The five spec roles (2.1, as amended 12 Oct: ACCOUNT_ADMIN merged into SYSTEM_ADMIN). */
export type UserRole =
  | "SYSTEM_ADMIN"
  | "PROPERTY_OFFICER"
  | "DEPARTMENT_HEAD"
  | "STAFF"
  | "AUDITOR";

export interface AuthenticatedRequest extends ExpressRequest {
  user?:
    | {
        id: string;
        role: UserRole;
        /**
         * The account's org unit, when known. Taken from the database on the
         * `ver` path and from the token otherwise. Used by the item-scope checks
         * (a department head reads their own unit) — absent is treated as
         * "no unit", never as "every unit".
         */
        orgUnitId?: string | null;
        accountStatus?: string;
      }
    | undefined;
}

interface JwtPayload {
  id: string;
  role: UserRole;
  orgUnitId?: string | null;
  /**
   * `User.tokenVersion` at the moment the token was issued. Absent on tokens
   * minted before the column existed; see the note in `authenticate`.
   */
  ver?: number;
}

const INVALID_TOKEN = "Invalid or expired token";

/**
 * Verifies the JWT from the Authorization header ("Bearer <token>") and
 * attaches `{ id, role }` to `req.user`. Does NOT enforce a role — routes that
 * need one chain `requireRole()` after this.
 *
 * ### Revocation via `ver`
 *
 * A token is not just a signature. When the token carries a `ver` claim, this
 * compares it against the account's current `tokenVersion` and rejects the
 * token if they differ — so changing a password (or an admin resetting one)
 * kills every session that account had open, instead of leaving a stolen token
 * valid until it expires.
 *
 * The comparison reads the user row, which also means the **role is taken from
 * the database**, not the token: a session minted before a demotion no longer
 * keeps ADMIN from a stale claim.
 *
 * Tokens minted before `ver` existed have no claim. Those are accepted on the
 * old signature-only path so the rollout is non-breaking; they age out within
 * the token's 1-day lifetime. A caller cannot strip the claim to dodge the
 * check — that would invalidate the signature.
 *
 * ### Account status (spec 3.1.2)
 *
 * The same read checks `accountStatus` and refuses anything but `ACTIVE`. Sign-in
 * already refuses a pending, rejected or deactivated account, so this is the second
 * half of one rule rather than a duplicate: an account that was **active when the
 * token was issued** and was refused afterwards (rejected, deactivated) must not
 * keep working until that token expires. Same 401 "Invalid or expired token" as a
 * revoked `ver` — for a session that is already dead, the reason is not the
 * caller's business, and "your account was deactivated" on an API call would be a
 * stranger's screen telling them about someone else's account.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail loudly rather than silently trusting an unsigned token.
    res.status(401).json({ error: INVALID_TOKEN });
    return;
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, secret) as JwtPayload;
  } catch {
    res.status(401).json({ error: INVALID_TOKEN });
    return;
  }

  // A DB outage is a 500 (via errorHandler), not a 401 — only the token itself
  // is the caller's problem.
  try {
    if (typeof decoded.ver === "number") {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { role: true, tokenVersion: true, orgUnitId: true, accountStatus: true },
      });
      if (!user || user.tokenVersion !== decoded.ver) {
        res.status(401).json({ error: INVALID_TOKEN });
        return;
      }
      if (!canHoldSession(user.accountStatus)) {
        res.status(401).json({ error: INVALID_TOKEN });
        return;
      }
      req.user = { id: decoded.id, role: user.role, orgUnitId: user.orgUnitId, accountStatus: user.accountStatus ?? "ACTIVE" };
    } else {
      req.user = { id: decoded.id, role: decoded.role, orgUnitId: decoded.orgUnitId ?? null };
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Usage: router.post("/items", authenticate, requireCapability("ITEM_CREATE"), handler)
 * Must run AFTER authenticate() — relies on req.user already being set.
 *
 * Routes name the *capability* they need, never the roles: the matrix lives in
 * `services/permissions.ts`, so changing who may do something is one row there
 * rather than a hunt through every route.
 */
export function requireCapability(capability: Capability) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!hasCapability(req.user.role, capability)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/**
 * Optional authentication middleware.
 * If a valid JWT is present in the Authorization header, attaches the decoded
 * { id, role } to req.user. If no token is present, or if the token is
 * invalid/expired/revoked, it continues without setting req.user.
 *
 * Deliberately fail-open, including on a database error while checking `ver`:
 * these are public routes, and a blip must degrade to "guest", never to a 500
 * on the QR destination.
 */
export async function optionalAuthenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No token? No problem. Just continue as a guest.
    next();
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;
  req.user = undefined;
  if (!secret) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (typeof decoded.ver === "number") {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { role: true, tokenVersion: true, orgUnitId: true },
      });
      if (user && user.tokenVersion === decoded.ver) {
        req.user = { id: decoded.id, role: user.role, orgUnitId: user.orgUnitId };
      }
    } else {
      req.user = { id: decoded.id, role: decoded.role, orgUnitId: decoded.orgUnitId ?? null };
    }
  } catch {
    // Invalid, expired or revoked — treat the request as unauthenticated.
    req.user = undefined;
  }
  next();
}
