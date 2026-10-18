import { Router, type Response, type Router as ExpressRouter } from "express";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { checkAllExpiries } from "../services/expiry.js";

export const expiryRouter: ExpressRouter = Router();

/**
 * POST /api/v1/expiry/check
 * Run all expiry checks (scheduled job or manual trigger)
 * Requires SYSTEM_ADMIN role
 */
expiryRouter.post(
  "/check",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const results = await checkAllExpiries();
      res.status(200).json({
        success: true,
        ...results,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(500).json({ error: "Failed to check expiries" });
    }
  }
);

/**
 * GET /api/v1/expiry/status
 * Get current expiry status without running checks
 * Requires SYSTEM_ADMIN role
 */
expiryRouter.get(
  "/status",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const now = new Date();
      const [
        pendingClaims,
        pendingApprovals,
        pendingReturnConfirmations,
        pendingHandoverVerifications,
      ] = await Promise.all([
        prisma.item.count({
          where: { status: "PENDING_CLAIM", claimDueAt: { lt: now } },
        }),
        prisma.request.count({
          where: {
            status: { in: ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2"] },
            createdAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.request.count({
          where: {
            status: "RETURN_PENDING_CONFIRMATION",
            loanReturnedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.item.count({
          where: {
            status: "REVERTED_UNVERIFIED",
            updatedAt: { lt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

      res.status(200).json({
        expiredClaims: pendingClaims,
        expiredApprovals: pendingApprovals,
        expiredReturnConfirmations: pendingReturnConfirmations,
        expiredHandoverVerifications: pendingHandoverVerifications,
        timestamp: now.toISOString(),
      });
    } catch {
      res.status(500).json({ error: "Failed to get expiry status" });
    }
  }
);
