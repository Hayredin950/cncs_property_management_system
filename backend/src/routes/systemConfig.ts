import { Router, type NextFunction, type Response, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { httpError } from "../lib/httpError.js";

export const systemConfigRouter: ExpressRouter = Router();

/**
 * GET /admin/system — System status (System Admin only).
 */

systemConfigRouter.get(
  "/status",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // System status endpoint - returns environment info, deploy info, uptime
      const status = {
        environment: process.env.NODE_ENV ?? "development",
        version: process.env.APP_VERSION ?? "unknown",
        uptime: Math.floor(process.uptime()),
        lastDeploy: process.env.DEPLOY_TIME ?? "unknown",
        database: "connected",
      };

      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /admin/system/events — Recent system events (System Admin only).
 */
systemConfigRouter.get(
  "/events",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

      // Fetch recent system events (audits, errors, migrations, etc.)
      // For now, we'll use audit sessions as a proxy for system events
      const events = await prisma.auditSession.findMany({
        take: limit,
        orderBy: { startedAt: "desc" },
        include: {
          runBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      const eventsMapped = events.map((session) => ({
        id: session.id,
        type: "AUDIT",
        message: `Audit ${session.scopeType} ${session.scopeValue ? `(${session.scopeValue})` : ""}`,
        status: session.completedAt ? "COMPLETED" : "IN_PROGRESS",
        timestamp: session.startedAt,
        completedAt: session.completedAt,
        runBy: session.runBy ? session.runBy.fullName : null,
      }));

      res.status(200).json({ data: eventsMapped });
    } catch (err) {
      next(err);
    }
  }
);


