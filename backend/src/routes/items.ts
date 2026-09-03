import { Router, type Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireRole,
  optionalAuthenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { sanitizeItem } from "../utils/filterItemFields.js";

export const itemsRouter = Router();

const ConditionEnum = z.enum(["NEW", "GOOD", "FAIR", "DAMAGED", "BEYOND_REPAIR"]);

const createItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  categoryId: z.string().uuid("Valid categoryId is required"),
  department: z.string().trim().min(1, "Department is required"),
  building: z.string().trim().min(1, "Building is required"),
  floor: z.string().trim().min(1, "Floor is required"),
  room: z.string().trim().min(1, "Room is required"),
  ownerId: z.string().uuid("Valid ownerId (User) is required"),
  purchaseCost: z.number().positive("Purchase cost must be a positive number"),
  currentValue: z.number().positive().optional().nullable(),
  condition: ConditionEnum,
  brand: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  parentItemId: z.string().uuid().optional().nullable(),
});

const updateItemSchema = createItemSchema.partial();

function generateTagId(): string {
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CNCS-${randomHex}`;
}

itemsRouter.get(
  "/",
  optionalAuthenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;

      const { search, categoryId, department } = req.query;

      const where: Prisma.ItemWhereInput = {
        status: "ACTIVE",
      };

      if (typeof search === "string" && search.trim().length > 0) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { tagId: { contains: search, mode: "insensitive" } },
        ];
      }

      if (typeof categoryId === "string") {
        where.categoryId = categoryId;
      }

      if (typeof department === "string") {
        where.department = { contains: department, mode: "insensitive" };
      }

      const [items, total] = await Promise.all([
        prisma.item.findMany({
          where,
          skip,
          take: limit,
          orderBy: { registeredAt: "desc" },
          include: {
            category: true,
            owner: {
              select: { id: true, fullName: true, email: true },
            },
          },
        }),
        prisma.item.count({ where }),
      ]);

      const sanitizedItems = items.map((item) =>
        sanitizeItem(item as unknown as Record<string, unknown>, req.user)
      );

      res.status(200).json({
        data: sanitizedItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  }
);

itemsRouter.get(
  "/:tagId",
  optionalAuthenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { tagId } = req.params;

      const item = await prisma.item.findUnique({
        where: { tagId },
        include: {
          category: true,
          accessories: true,
          owner: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      if (item.status === "DISPOSED") {
        res.status(410).json({ error: "This item is no longer in service" });
        return;
      }

      const sanitized = sanitizeItem(item as unknown as Record<string, unknown>, req.user);
      res.status(200).json(sanitized);
    } catch {
      res.status(500).json({ error: "Failed to fetch item" });
    }
  }
);

itemsRouter.post(
  "/",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const itemData = parsed.data;
      const tagId = generateTagId();

      const newItem = await prisma.item.create({
        data: {
          ...itemData,
          tagId,
          purchaseCost: itemData.purchaseCost,
          currentValue: itemData.currentValue ?? null,
        },
        include: {
          category: true,
        },
      });

      res.status(201).json(newItem);
    } catch {
      res.status(500).json({ error: "Failed to create item" });
    }
  }
);

itemsRouter.put(
  "/:id",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }

      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const existingItem = await prisma.item.findUnique({
        where: { id },
      });

      if (!existingItem) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const updates = parsed.data;
      const editorId = req.user!.id;

      const editLogEntries: Array<{
        itemId: string;
        editedById: string;
        fieldChanged: string;
        oldValue: string | null;
        newValue: string | null;
      }> = [];

      const existingRecord = existingItem as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          const oldVal = existingRecord[key];
          if (String(oldVal) !== String(value)) {
            editLogEntries.push({
              itemId: id,
              editedById: editorId,
              fieldChanged: key,
              oldValue: oldVal !== null && oldVal !== undefined ? String(oldVal) : null,
              newValue: value !== null ? String(value) : null,
            });
          }
        }
      }

      const [updatedItem] = await prisma.$transaction([
        prisma.item.update({
          where: { id },
          data: updates,
        }),
        ...(editLogEntries.length > 0
          ? [
              prisma.itemEditLog.createMany({
                data: editLogEntries,
              }),
            ]
          : []),
      ]);

      res.status(200).json(updatedItem);
    } catch {
      res.status(500).json({ error: "Failed to update item" });
    }
  }
);