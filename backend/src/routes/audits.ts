import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateQuery, validatedQuery } from "../middleware/validate.js";
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
      const scopeFilter = scopeItemFilter(session.scopeType, session.scopeValue);
      if (!scopeFilter.supported) {
        res.status(400).json({
          error: `Unsupported scopeType for audit completion: ${session.scopeType}`,
        });
        return;
      }

      // A null scopeValue is an explicitly empty scope, not an invalid filter.
      const inScopeItems =
        scopeFilter.where === null
          ? []
          : await prisma.item.findMany({
              where: scopeFilter.where,
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

/**
 * The item columns a scope narrows to. `DEPARTMENT` and `BUILDING` are the two
 * the app offers and can be completed; anything else is reported as unsupported
 * by the caller rather than guessed at.
 *
 * Both match **case-insensitively**. The scope value the UI sends comes from a
 * fixed list, but `Item.department`/`Item.building` are free text, so an item
 * filed as "computer science" would otherwise be invisible to a "Computer
 * Science" audit and counted MISSING — a false report, which is worse than a
 * missing feature. Insensitive matching closes exactly that hole.
 */
function scopeItemFilter(
  scopeType: string,
  scopeValue: string | null,
): { supported: boolean; where: Record<string, unknown> | null } {
  if (scopeType === "DEPARTMENT") {
    return {
      supported: true,
      where:
        scopeValue === null
          ? null
          : { department: { equals: scopeValue, mode: "insensitive" }, status: "ACTIVE" },
    };
  }
  if (scopeType === "BUILDING") {
    return {
      supported: true,
      where:
        scopeValue === null
          ? null
          : { building: { equals: scopeValue, mode: "insensitive" }, status: "ACTIVE" },
    };
  }
  return { supported: false, where: null };
}

const listQuerySchema = z.object({
  mine: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * `GET /api/v1/audits` — the sessions this viewer may see, newest first.
 *
 * This is the other half of gap G1. `GET /audits/:id` made a *known* session
 * readable, but nothing ever told anyone the id: the running scan list lived in
 * one tab's `sessionStorage`, and a finished audit existed only in the response
 * that finished it. The rows were being written to the database the whole time,
 * and were nonetheless invisible from the app — which is how "it doesn't get
 * persisted" reads from the outside, and it is a fair description of the
 * experience even though the storage was never the problem.
 *
 * Scope mirrors `GET /requests`: Staff see the audits they ran, an Admin sees
 * every audit. `mine=true` narrows an Admin's own view and can never widen
 * anyone's, because it is applied after the scope rather than instead of it.
 *
 * The counts are derived from the stored result rows, so a session still in
 * progress reports what it actually has — FOUND rows — and says so with
 * `completed: false` instead of implying the unscanned items were classified.
 */
auditsRouter.get(
  "/",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  validateQuery(listQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = validatedQuery<ListQuery>(req);

      const where = {
        ...(user.role === "ADMIN" ? {} : { runById: user.id }),
        ...(query.mine === "true" ? { runById: user.id } : {}),
      };

      const [sessions, total] = await Promise.all([
        prisma.auditSession.findMany({
          where,
          select: {
            id: true,
            scopeType: true,
            scopeValue: true,
            runById: true,
            startedAt: true,
            completedAt: true,
            runBy: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { startedAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
        prisma.auditSession.count({ where }),
      ]);

      /**
       * One grouped count for the whole page rather than a query per row. Keyed by
       * session *and* result, so a session with no rows at all simply has no entry
       * and the lookup below falls through to zero.
       */
      const grouped = sessions.length
        ? await prisma.auditItemResultRow.groupBy({
            by: ["auditSessionId", "result"],
            where: { auditSessionId: { in: sessions.map((session) => session.id) } },
            _count: { _all: true },
          })
        : [];

      const countFor = (sessionId: string, result: string) =>
        grouped.find((row) => row.auditSessionId === sessionId && row.result === result)?._count._all ??
        0;

      res.status(200).json({
        audits: sessions.map((session) => ({
          ...session,
          completed: session.completedAt !== null,
          counts: {
            found: countFor(session.id, "FOUND"),
            missing: countFor(session.id, "MISSING"),
            locationMismatch: countFor(session.id, "LOCATION_MISMATCH"),
          },
        })),
        total,
        limit: query.limit,
        offset: query.offset,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * `GET /api/v1/audits/:id` — read a session back, completed or not.
 *
 * Closes gap G1: before this, a completed audit existed only in the response
 * that completed it, so reloading `/audit/:id/report` lost the summary for
 * good. The counts are derived from the stored result rows (not recomputed),
 * and the per-item rows are included with just enough item detail for the
 * report to be useful without a second request.
 */
auditsRouter.get(
  "/:id",
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

      const rows = await prisma.auditItemResultRow.findMany({
        where: { auditSessionId: id },
        select: {
          itemId: true,
          result: true,
          scannedAt: true,
          item: {
            select: {
              tagId: true,
              name: true,
              department: true,
              building: true,
              floor: true,
              room: true,
            },
          },
        },
      });

      const byResult = (result: string) =>
        rows.filter((row) => row.result === result).map((row) => row.itemId);

      res.status(200).json({
        id: session.id,
        scopeType: session.scopeType,
        scopeValue: session.scopeValue,
        runById: session.runById,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        completed: session.completedAt !== null,
        counts: {
          found: rows.filter((row) => row.result === "FOUND").length,
          missing: rows.filter((row) => row.result === "MISSING").length,
          locationMismatch: rows.filter((row) => row.result === "LOCATION_MISMATCH").length,
        },
        found: byResult("FOUND"),
        missing: byResult("MISSING"),
        locationMismatch: byResult("LOCATION_MISMATCH"),
        rows,
      });
    } catch (err) {
      next(err);
    }
  },
);
