import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

export const auditsRouter: Router = Router();

const createAuditSchema = z.object({
  scopeType: z.string().trim().min(1, "scopeType is required"),
  scopeValue: z.string().trim().optional().nullable(),
});

const createScanSchema = z.object({
  itemId: z.string().uuid("Valid itemId is required"),
  result: z.enum(["FOUND", "MISSING", "LOCATION_MISMATCH"]),
  scannedAt: z.coerce.date().optional(),
});

/**
 * POST /api/v1/audits
 * POST /audits
 *
 * Creates a new AuditSession with the specified scope.
 * Scoped to authenticated users with ADMIN or STAFF role.
 */
auditsRouter.post(
  "/",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const parsed = createAuditSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const { scopeType, scopeValue } = parsed.data;

      const auditSession = await prisma.auditSession.create({
        data: {
          scopeType,
          scopeValue: scopeValue ?? null,
          runById: req.user.id,
        },
        include: {
          runBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      res.status(201).json(auditSession);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/audits/:id/scan
 * POST /audits/:id/scan
 *
 * Records a scanned item result linked to an active AuditSession.
 */
auditsRouter.post(
  "/:id/scan",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Audit session ID is required" });
        return;
      }

      const parsed = createScanSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const { itemId, result, scannedAt } = parsed.data;

      // Verify AuditSession exists
      const session = await prisma.auditSession.findUnique({
        where: { id },
      });

      if (!session) {
        res.status(404).json({ error: "Audit session not found" });
        return;
      }

      // Verify Item exists
      const item = await prisma.item.findUnique({
        where: { id: itemId },
      });

      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const scanTimestamp = scannedAt ?? new Date();

      // Record scan result and update item's lastAuditedAt
      const [auditResultRow] = await prisma.$transaction([
        prisma.auditItemResultRow.create({
          data: {
            auditSessionId: id,
            itemId,
            result,
            scannedAt: scanTimestamp,
          },
          include: {
            item: true,
          },
        }),
        prisma.item.update({
          where: { id: itemId },
          data: {
            lastAuditedAt: scanTimestamp,
          },
        }),
      ]);

      res.status(201).json(auditResultRow);
    } catch (err) {
      next(err);
    }
  }
);
