import { Router, type NextFunction, type Response, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { httpError } from "../lib/httpError.js";
import type { Prisma } from "../generated/prisma/client.js";

export const buildingsRouter: ExpressRouter = Router();

const buildingSchema = z.object({
  name: z.string().trim().min(1, "Building name is required"),
  code: z.string().trim().min(1, "Building code is required").max(10),
  description: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
});

const buildingUpdateSchema = buildingSchema.partial();

/**
 * GET /buildings — list buildings (Property Officer only).
 */
buildingsRouter.get(
  "/",
  authenticate,
  requireCapability("BUILDING_MANAGE"),
  async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;

      const { search } = req.query;

      const filters: Prisma.BuildingWhereInput = {};

      if (typeof req.query.search === "string" && req.query.search.trim().length > 0) {
        const search = req.query.search.trim();
        filters.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ];
      }

      const [buildings, total] = await Promise.all([
        prisma.building.findMany({
          where: filters,
          skip,
          take: limit,
          orderBy: { name: "asc" },
        }),
        prisma.building.count({ where: filters }),
      ]);

      res.status(200).json({
        data: buildings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /buildings/:id — get a single building.
 */
buildingsRouter.get(
  "/:id",
  authenticate,
  requireCapability("BUILDING_MANAGE"),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Building ID is required" });
        return;
      }

      const building = await prisma.building.findUnique({
        where: { id },
        include: {
          items: {
            where: { status: "ACTIVE" },
            select: { id: true, tagId: true, name: true },
          },
        },
      });

      if (!building) {
        res.status(404).json({ error: "Building not found" });
        return;
      }

      res.status(200).json(building);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /buildings — create a new building (Property Officer only).
 */
buildingsRouter.post(
  "/",
  authenticate,
  requireCapability("BUILDING_MANAGE"),
  async (req, res, next) => {
    try {
      const parsed = buildingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      // Remove undefined values for Prisma (exactOptionalPropertyTypes)
      const data: { name: string; code: string; description?: string | null; address?: string | null } = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined)
      ) as { name: string; code: string; description?: string | null; address?: string | null };

      const building = await prisma.building.create({ data });

      res.status(201).json(building);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        res.status(409).json({ error: "Building code already exists" });
        return;
      }
      next(err);
    }
  }
);

/**
 * PUT /buildings/:id — update a building.
 */
buildingsRouter.put(
  "/:id",
  authenticate,
  requireCapability("BUILDING_MANAGE"),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Building ID is required" });
        return;
      }

      const parsed = buildingUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const existing = await prisma.building.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Building not found" });
        return;
      }

      // Remove undefined values for Prisma (exactOptionalPropertyTypes)
      const data = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined)
      );

      const updated = await prisma.building.update({
        where: { id },
        data,
      });

      res.status(200).json(updated);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        res.status(409).json({ error: "Building code already exists" });
        return;
      }
      next(err);
    }
  }
);

/**
 * DELETE /buildings/:id — delete a building (only if no items).
 */
buildingsRouter.delete(
  "/:id",
  authenticate,
  requireCapability("BUILDING_MANAGE"),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Building ID is required" });
        return;
      }

      const building = await prisma.building.findUnique({
        where: { id },
        include: { _count: { select: { items: true } } },
      });

      if (!building) {
        res.status(404).json({ error: "Building not found" });
        return;
      }

      if (building._count.items > 0) {
        res.status(409).json({ error: "Cannot delete building with associated items" });
        return;
      }

      await prisma.building.delete({ where: { id } });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);


