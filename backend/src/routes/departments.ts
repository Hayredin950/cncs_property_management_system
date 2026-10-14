import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

export const departmentsRouter: Router = Router();

/**
 * GET /departments — Public list of departments accepting self-registration.
 *
 * Returns active OrgUnits with type DEPARTMENT and acceptsSelfReg = true.
 * No head names, no counts, no item data.
 */
departmentsRouter.get(
  "/",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departments = await prisma.orgUnit.findMany({
        where: {
          type: "DEPARTMENT",
          isActive: true,
          acceptsSelfReg: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
        orderBy: { name: "asc" },
      });

      res.status(200).json(
        departments.map((d) => ({ id: d.id, name: d.name, code: d.code })),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /departments/:id/roster
 * Returns staff count for a department's roster.
 * Department Head only (for their own department).
 */
departmentsRouter.get(
  "/:id/roster",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Department ID is required" });
        return;
      }

      // Department Head can only see their own department's roster
      if (req.user.role === "DEPARTMENT_HEAD" && req.user.orgUnitId !== id) {
        res.status(403).json({ error: "You can only view your own department's roster" });
        return;
      }

      const department = await prisma.orgUnit.findUnique({
        where: { id },
        select: { id: true, name: true },
      });

      if (!department) {
        res.status(404).json({ error: "Department not found" });
        return;
      }

      const staffCount = await prisma.user.count({
        where: {
          orgUnitId: id,
          role: { in: ["STAFF", "DEPARTMENT_HEAD"] },
          accountStatus: "ACTIVE",
        },
      });

      res.status(200).json({
        department: { id: department.id, name: department.name },
        staffCount,
      });
    } catch (err) {
      next(err);
    }
  },
);

