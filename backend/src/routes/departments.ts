import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";

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
