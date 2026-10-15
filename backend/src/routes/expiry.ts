import { Router, type Response, type Router as ExpressRouter } from "express";
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
    } catch (err) {
      res.status(500).json({ error: "Failed to check expiries" });
    }
  }
);
