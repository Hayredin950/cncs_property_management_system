import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireCapability, type AuthenticatedRequest } from "../middleware/auth.js";

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
 * `GET /departments/invitable` — the units a privileged invite may name (T6).
 *
 * Deliberately **not** `GET /departments`, which lists the units open to
 * *self-registration* (`acceptsSelfReg`). That is the opposite question: an invite
 * is most needed exactly where a unit has no working head — Physics in the seed
 * data — and a headless unit is not one people register themselves into. Building
 * the picker from the public list would have hidden the units it exists for.
 *
 * `ACCOUNT_INVITE` rather than public: this is a list of the college's units with
 * which ones have a working head, which is account-administration data and belongs
 * to the role that administers accounts.
 *
 * `hasActiveHead` is returned rather than left for the client to work out, because
 * the server refuses an invite into a unit that already has one
 * (`ERROR_INVITE_UNIT_HEADED`) — the picker marking those units is how an
 * administrator learns that before submitting rather than after.
 *
 * Declared before `/:id/roster` for the ordinary reason: Express matches in
 * order, and a literal path must not be shadowed by a parameterised one.
 */
departmentsRouter.get(
  "/invitable",
  authenticate,
  requireCapability("ACCOUNT_INVITE"),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const units = await prisma.orgUnit.findMany({
        where: { type: "DEPARTMENT", isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          head: { select: { accountStatus: true } },
        },
        orderBy: { name: "asc" },
      });

      res.status(200).json(
        units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          code: unit.code,
          /** A head whose account is not ACTIVE decides nothing, so the unit is vacant. */
          hasActiveHead: unit.head?.accountStatus === "ACTIVE",
        })),
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

