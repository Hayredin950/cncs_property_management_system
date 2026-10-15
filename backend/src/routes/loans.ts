import { Router, type NextFunction, type Response, type Router as ExpressRouter } from "express";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

export const loansRouter: ExpressRouter = Router();

/**
 * GET /loans/overdue
 * Returns count of overdue loans for dashboard widget.
 * Property Officer only.
 */
loansRouter.get(
  "/overdue",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const now = new Date();

      const count = await prisma.request.count({
        where: {
          type: "LOAN",
          status: "APPROVED",
          loanDueDate: { lt: now },
          loanReturnedAt: null,
        },
      });

      res.status(200).json({ count });
    } catch (err) {
      next(err);
    }
  }
);
