import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const categoriesRouter: Router = Router();

const categoryNameSchema = z.object({
  name: z.string().trim().min(1, "Category name is required"),
});

const createCategorySchema = categoryNameSchema;
const updateCategorySchema = categoryNameSchema;

/**
 * Every handler hands errors to the central `errorHandler`
 * (middleware/errorHandler.ts) instead of writing its own 500. The bare
 * `catch { res.status(500) }` they replaced dropped the error object on the
 * floor — a DB outage produced "Failed to fetch categories" and no stack trace
 * anywhere. It also turned the `name @unique` collision below into a 500; the
 * handler maps P2002 to 409.
 *
 * ### Why the list carries a count
 *
 * `itemCount` is the number of items filed under the category. The admin screen
 * shows it beside each name and links through to `GET /items?categoryId=…`, so an
 * administrator can see a category is populated *before* trying to delete it —
 * which the delete below then refuses.
 */
categoriesRouter.get(
  "/",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await prisma.category.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { items: true } } },
      });

      // Flattened rather than exposing Prisma's `_count` envelope: the response
      // shape is the API's, not the ORM's.
      res.status(200).json(
        categories.map((category) => ({
          id: category.id,
          name: category.name,
          itemCount: category._count.items,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

categoriesRouter.post(
  "/",
  authenticate,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createCategorySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const { name } = parsed.data;

      const existing = await prisma.category.findUnique({
        where: { name },
      });

      if (existing) {
        res.status(409).json({ error: "Category with this name already exists" });
        return;
      }

      const newCategory = await prisma.category.create({
        data: { name },
      });

      res.status(201).json({ ...newCategory, itemCount: 0 });
    } catch (err) {
      next(err);
    }
  }
);

/** `PUT /categories/:id` — ADMIN. Rename only; the relation is untouched. */
categoriesRouter.put(
  "/:id",
  authenticate,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Category ID is required" });
        return;
      }

      const parsed = updateCategorySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const { name } = parsed.data;

      const existing = await prisma.category.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      // A rename to the same name is a no-op, not a 409 — the admin screen sends
      // the whole record back, so resubmitting an untouched form must succeed.
      if (existing.name === name) {
        res.status(200).json({ id: existing.id, name: existing.name });
        return;
      }

      const clash = await prisma.category.findUnique({ where: { name } });
      if (clash) {
        res.status(409).json({ error: "Category with this name already exists" });
        return;
      }

      const updated = await prisma.category.update({
        where: { id },
        data: { name },
      });

      res.status(200).json({ id: updated.id, name: updated.name });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `DELETE /categories/:id` — ADMIN, and refused while the category is in use.
 *
 * The check is the point. `Item.categoryId` is a required foreign key, so a
 * populated category cannot be removed without destroying or orphaning its
 * items — and destroying items is exactly what F7.2 forbids. Answering 409 with
 * the count tells the administrator what stands in the way instead of surfacing
 * a raw constraint error or, worse, cascading.
 */
categoriesRouter.delete(
  "/:id",
  authenticate,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Category ID is required" });
        return;
      }

      const existing = await prisma.category.findUnique({
        where: { id },
        include: { _count: { select: { items: true } } },
      });

      if (!existing) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      if (existing._count.items > 0) {
        const count = existing._count.items;
        res.status(409).json({
          error: `Category is in use by ${count} item${count === 1 ? "" : "s"}. Reassign them to another category first.`,
        });
        return;
      }

      await prisma.category.delete({ where: { id } });

      res.status(200).json({ id, deleted: true });
    } catch (err) {
      next(err);
    }
  }
);
