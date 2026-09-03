import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const categoriesRouter: Router = Router();

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required"),
});

categoriesRouter.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

categoriesRouter.post(
  "/",
  authenticate,
  requireRole(["ADMIN"]),
  async (req: Request, res: Response): Promise<void> => {
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

      res.status(201).json(newCategory);
    } catch {
      res.status(500).json({ error: "Failed to create category" });
    }
  }
);