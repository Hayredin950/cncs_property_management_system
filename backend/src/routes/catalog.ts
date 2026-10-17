import { Router, type NextFunction, type Response } from "express";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

export const catalogRouter: Router = Router();

/**
 * §9.1: Staff catalog endpoint - restricted visibility tier
 * Shows: item name, category, general location (building only), current status
 * Hides: cost, custodian, exact room
 */
catalogRouter.get(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await prisma.item.findMany({
        where: { status: { notIn: ["DISPOSED", "VOIDED"] } },
        select: {
          id: true,
          name: true,
          tagId: true,
          category: { select: { id: true, name: true } },
          building: { select: { id: true, name: true } },
          status: true,
        },
        orderBy: { name: "asc" },
      });

      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * §9.1: Department Head cross-department catalog endpoint - restricted visibility tier
 * Shows: item name, category, general location (building only), current status
 * Hides: cost, custodian, exact room
 * This allows Department Heads to identify items in other departments for transfer requests
 */
catalogRouter.get(
  "/department",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Department Head only
      if (user.role !== "DEPARTMENT_HEAD") {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // Exclude user's own department items (they see those in the main items view)
      const whereClause: Prisma.ItemWhereInput = {
        status: { notIn: ["DISPOSED", "VOIDED"] },
      };
      if (user.orgUnitId) {
        whereClause.orgUnitId = { not: user.orgUnitId };
      }

      const items = await prisma.item.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          tagId: true,
          category: { select: { id: true, name: true } },
          building: { select: { id: true, name: true } },
          status: true,
          orgUnitId: true,
        },
        orderBy: { name: "asc" },
      });

      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  }
);
