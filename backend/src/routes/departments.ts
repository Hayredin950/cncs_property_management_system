import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireCapability, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateBody, validatedBody } from "../middleware/validate.js";

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

/**
 * GET /departments/:id/staff
 * Returns staff members for a department.
 * Department Head only (for their own department).
 */
departmentsRouter.get(
  "/:id/staff",
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

      // Department Head can only see their own department's staff
      if (req.user.role === "DEPARTMENT_HEAD" && req.user.orgUnitId !== id) {
        res.status(403).json({ error: "You can only view your own department's staff" });
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

      const staff = await prisma.user.findMany({
        where: {
          orgUnitId: id,
          role: { in: ["STAFF", "DEPARTMENT_HEAD"] },
          accountStatus: "ACTIVE",
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
        orderBy: { fullName: "asc" },
      });

      /**
       * How many items each person **holds**, counted by the holder model
       * (`holderType` + `holderId`), which is the truth about custody.
       *
       * It used to be Prisma's `_count.ownedItems` — the legacy `ownerId`
       * relation — and the client read a flat `itemCount` that the server never
       * sent, so every person on the roster showed "0 items". The number was
       * wrong twice over: the wrong field, and the wrong column behind it.
       */
      const held = await prisma.item.groupBy({
        by: ["holderId"],
        where: {
          holderType: "STAFF",
          holderId: { in: staff.map((member) => member.id) },
          status: { notIn: ["DISPOSED", "VOIDED"] },
        },
        _count: { _all: true },
      });
      const heldCount = new Map(held.map((row) => [row.holderId, row._count._all]));

      res.status(200).json({
        department: { id: department.id, name: department.name },
        staff: staff.map((member) => ({
          id: member.id,
          fullName: member.fullName,
          email: member.email,
          role: member.role,
          itemCount: heldCount.get(member.id) ?? 0,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /departments/admin — every unit, with what an administrator needs to see.
 *
 * The public list is the units that accept self-registration, and nothing else.
 * An administrator needs the whole set: the units that are **not** accepting
 * requests, the vacant ones, and the head who holds each.
 */
departmentsRouter.get(
  "/admin",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const units = await prisma.orgUnit.findMany({
        where: { type: { in: ["COLLEGE", "DEPARTMENT"] } },
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          isActive: true,
          acceptsSelfReg: true,
          parent: { select: { id: true, name: true } },
          head: { select: { id: true, fullName: true, email: true } },
          _count: { select: { users: true } },
        },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      });

      res.status(200).json(
        units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          code: unit.code,
          type: unit.type,
          isActive: unit.isActive,
          acceptsSelfReg: unit.acceptsSelfReg,
          college: unit.parent?.name ?? null,
          head: unit.head,
          staffCount: unit._count.users,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /departments — add a department.
 *
 * A college's departments are not a fixed list forever: a new programme means a
 * new department, and the register has to be able to hold it. The unit is
 * created under the college, accepting self-registration, and with **no head**
 * until one is appointed — a vacant head is a real state, and the approval
 * queue knows how to fall back to a system administrator for it.
 */
const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, "The department needs a name").max(120),
  code: z
    .string()
    .trim()
    .min(2, "The department needs a code")
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, "The code is letters, digits and dashes"),
  /** Whether staff of this department may ask for an account online. */
  acceptsSelfReg: z.boolean().default(true),
});

departmentsRouter.post(
  "/",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  validateBody(createDepartmentSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validatedBody<z.infer<typeof createDepartmentSchema>>(req);
      const name = body.name;
      const code = body.code.toUpperCase();

      const existing = await prisma.orgUnit.findFirst({
        where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { code }] },
        select: { id: true, name: true, code: true },
      });
      if (existing) {
        res.status(409).json({
          error: `A unit already uses that name or code (${existing.name}, ${existing.code}).`,
        });
        return;
      }

      const college = await prisma.orgUnit.findFirst({
        where: { type: "COLLEGE" },
        select: { id: true },
      });
      if (!college) {
        res.status(500).json({ error: "The college unit is missing — the seed must run first." });
        return;
      }

      const created = await prisma.orgUnit.create({
        data: {
          name,
          code,
          type: "DEPARTMENT",
          isActive: true,
          acceptsSelfReg: body.acceptsSelfReg,
          parentId: college.id,
        },
        select: { id: true, name: true, code: true, type: true, isActive: true, acceptsSelfReg: true },
      });

      res.status(201).json({
        department: {
          ...created,
          head: null,
          staffCount: 0,
          note: "The department has no head yet. A request from it waits for a system administrator until one is appointed.",
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
