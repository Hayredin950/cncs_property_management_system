import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import { computeAuditResults } from "../services/auditCompletion.js";

export const auditsRouter: Router = Router();

const createAuditSchema = z.object({
  scopeType: z.string().trim().min(1, "scopeType is required"),
  scopeValue: z.string().trim().optional().nullable(),
});

/**
 * The scan endpoint should always record scanned items as FOUND.
 * The client should not submit MISSING or LOCATION_MISMATCH; those results should be determined when the audit is completed based on which items
 * were scanned and their locations.
 */

const createScanSchema = z.object({
  itemId: z.string().uuid("Valid itemId is required"),
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
  },
);

/**
 * POST /api/v1/audits/:id/scan
 * POST /audits/:id/scan
 *
 * Records that an item was physically scanned during an in-progress audit.
 * Always persists result: "FOUND" — the final classification (FOUND /
 * MISSING / LOCATION_MISMATCH) is computed by the completion endpoint, not
 * here. Does NOT touch Item.lastAuditedAt: that field is owned by audit
 * completion (Phase 3 Step 2), because an audit that is later abandoned
 * should never leave an item looking like it was audited.
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

      const { itemId, scannedAt } = parsed.data;

      const session = await prisma.auditSession.findUnique({
        where: { id },
      });
      if (!session) {
        res.status(404).json({ error: "Audit session not found" });
        return;
      }

      if (session.completedAt !== null) {
        res.status(409).json({ error: "Audit session is already completed" });
        return;
      }

      const item = await prisma.item.findUnique({
        where: { id: itemId },
      });
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const scanTimestamp = scannedAt ?? new Date();

      const auditResultRow = await prisma.auditItemResultRow.create({
        data: {
          auditSessionId: id,
          itemId,
          result: "FOUND",
          scannedAt: scanTimestamp,
        },
        include: {
          item: true,
        },
      });

      res.status(201).json(auditResultRow);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/audits/:id/complete
 * POST /audits/:id/complete
 *
 * Finalizes a department audit from its scans. LOCATION and any other scope
 * types remain unsupported here: scopeValue has no documented, parseable
 * location format, so guessing one would misclassify inventory.
 */
auditsRouter.post(
  "/:id/complete",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Audit session ID is required" });
        return;
      }

      const session = await prisma.auditSession.findUnique({ where: { id } });
      if (!session) {
        res.status(404).json({ error: "Audit session not found" });
        return;
      }
      if (session.completedAt !== null) {
        res.status(409).json({ error: "Audit session is already completed" });
        return;
      }
      if (session.scopeType !== "DEPARTMENT") {
        res.status(400).json({
          error: `Unsupported scopeType for audit completion: ${session.scopeType}`,
        });
        return;
      }

      // A non-null Item.department cannot equal a null scopeValue, so this is
      // an explicitly empty scope rather than an invalid Prisma filter.
      const inScopeItems =
        session.scopeValue === null
          ? []
          : await prisma.item.findMany({
              where: { department: session.scopeValue, status: "ACTIVE" },
              select: { id: true },
            });
      const scanRows = await prisma.auditItemResultRow.findMany({
        where: { auditSessionId: id },
        select: { itemId: true },
      });
      const scannedItemIds = [...new Set(scanRows.map((row) => row.itemId))];
      const results = computeAuditResults(
        inScopeItems.map((item) => item.id),
        scannedItemIds,
      );
      const completedAt = new Date();

      await prisma.$transaction([
        ...(results.locationMismatch.length > 0
          ? [
              prisma.auditItemResultRow.updateMany({
                where: { auditSessionId: id, itemId: { in: results.locationMismatch } },
                data: { result: "LOCATION_MISMATCH" },
              }),
            ]
          : []),
        ...(results.missing.length > 0
          ? [
              prisma.auditItemResultRow.createMany({
                data: results.missing.map((itemId) => ({
                  auditSessionId: id,
                  itemId,
                  result: "MISSING" as const,
                  scannedAt: null,
                })),
              }),
            ]
          : []),
        ...(results.found.length > 0
          ? [
              prisma.item.updateMany({
                where: { id: { in: results.found } },
                data: { lastAuditedAt: completedAt },
              }),
            ]
          : []),
        prisma.auditSession.updateMany({
          where: { id, completedAt: null },
          data: { completedAt },
        }),
      ]);

      res.status(200).json({
        auditSessionId: id,
        completedAt,
        counts: {
          found: results.found.length,
          missing: results.missing.length,
          locationMismatch: results.locationMismatch.length,
        },
        ...results,
      });
    } catch (err) {
      next(err);
    }
  },
);
