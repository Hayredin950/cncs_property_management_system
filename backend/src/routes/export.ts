import { Router, type Response, type Router as ExpressRouter } from "express";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const exportRouter: ExpressRouter = Router();

/**
 * §9.2: GET /export/holdings - personal holdings export (CSV)
 * Returns a simple, dated record of current holdings for the authenticated user
 */
exportRouter.get(
  "/holdings",
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const items = await prisma.item.findMany({
        where: {
          holderId: userId,
          holderType: "STAFF",
          status: { notIn: ["DISPOSED", "VOIDED"] },
        },
        include: {
          category: true,
          building: true,
        },
        orderBy: { name: "asc" },
      });

      // Generate CSV
      const headers = ["Tag ID", "Name", "Category", "Building", "Floor", "Room", "Condition", "Status", "Registered At"];
      const rows = items.map((item) => [
        item.tagId || "",
        item.name,
        item.category?.name || "",
        item.building?.name || "",
        item.floor || "",
        item.room || "",
        item.condition,
        item.status,
        String(item.registeredAt || ""),
      ]);

      const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="holdings-${new Date().toISOString().split("T")[0]}.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      res.status(500).json({ error: "Failed to generate holdings export" });
    }
  }
);
