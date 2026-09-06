import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

export const auditsRouter: Router = Router();

const createAuditSchema = z.object({
  scopeType: z.string().trim().min(1, "scopeType is required"),
  scopeValue: z.string().trim().optional().nullable(),
});

/**
 * Scan requests never carry a `result`. The scanner is only asserting that an
 * item was physically found during the walkthrough — the server always
 * records that as FOUND. Whether an unscanned item counts as MISSING, or a
 * scanned item counts as LOCATION_MISMATCH, is calculated later by
 * POST /audits/:id/complete (Phase 3 Step 2), by comparing the audit's scope
 * against which items were and weren't scanned. Letting the client submit
 * MISSING or LOCATION_MISMATCH directly would let it decide the audit's
 * outcome before the audit is even complete.
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
  }
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

      // Verify AuditSession exists
      const session = await prisma.auditSession.findUnique({
        where: { id },
      });
      if (!session) {
        res.status(404).json({ error: "Audit session not found" });
        return;
      }

      // A completed audit is a closed record — its report should never
      // change after the fact. Reject further scans against it.
      if (session.completedAt !== null) {
        res.status(409).json({ error: "Audit session is already completed" });
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

      // A single write — no transaction needed now that the item update is
      // gone. lastAuditedAt is set by the completion endpoint instead.
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
  }
);
