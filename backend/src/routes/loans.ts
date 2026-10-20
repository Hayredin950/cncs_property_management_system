import { Router, type NextFunction, type Response, type Router as ExpressRouter } from "express";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

export const loansRouter: ExpressRouter = Router();

/**
 * GET /loans/overdue
 * Returns count of overdue loans for dashboard widget.
 *
 * The comment has always said "Property Officer only" while the route checked
 * nothing beyond being signed in — so a staff member, an auditor and even the
 * system administrator could read the college's overdue-loan count. The
 * capability check the comment describes is now the check the route performs.
 */
loansRouter.get(
  "/overdue",
  authenticate,
  requireCapability("LOAN_APPROVE"),
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
