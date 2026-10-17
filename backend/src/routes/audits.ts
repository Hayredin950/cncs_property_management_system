import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireCapability, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateQuery, validatedQuery } from "../middleware/validate.js";
import { collapseAuditRows, computeAuditResults } from "../services/auditCompletion.js";
import {
  ITEM_LOCATION_SELECT,
  buildingWhere,
  departmentWhere,
  withRowItemNames,
} from "../utils/itemLocation.js";

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
/**
 * POST /api/v1/audits
 * POST /audits
 *
 * Creates a new AuditSession with the specified scope.
 * Excludes LOST, DISPOSED, and VOIDED items.
 * Excludes items held or owned by AUDITORs and tracks excludedAuditorCount.
 * Freezes the in-scope items into AuditItemResultRow as PENDING.
 */
auditsRouter.post(
  "/",
  authenticate,
  requireCapability("AUDIT_RUN"),
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

      // Calculate scope items with exclusions:
      // 1. Exclude LOST, DISPOSED, VOIDED items
      // 2. Exclude items held or owned by an AUDITOR
      const scopeFilter = scopeItemFilter(scopeType, scopeValue ?? null);
      let inScopeItemIds: string[] = [];
      let excludedAuditorCount = 0;

      if (scopeFilter.supported && scopeFilter.where) {
        const candidateItems = await prisma.item.findMany({
          where: {
            ...scopeFilter.where,
            status: { notIn: ["LOST", "DISPOSED", "VOIDED"] },
            voidedAt: null,
          },
          include: {
            owner: { select: { id: true, role: true } },
          },
        });

        const auditorUsers = await prisma.user.findMany({
          where: { role: "AUDITOR" },
          select: { id: true },
        });
        const auditorUserIds = new Set(auditorUsers.map((u) => u.id));

        const isAuditorHeld = (item: { ownerId: string; owner?: { role: string }; holderType?: string | null; holderId?: string | null }) => {
          if (item.owner?.role === "AUDITOR") return true;
          if (auditorUserIds.has(item.ownerId)) return true;
          if (item.holderType === "STAFF" && item.holderId && auditorUserIds.has(item.holderId)) return true;
          return false;
        };

        const auditorHeld = candidateItems.filter(isAuditorHeld);
        const eligibleItems = candidateItems.filter((item) => !isAuditorHeld(item));
        excludedAuditorCount = auditorHeld.length;
        inScopeItemIds = eligibleItems.map((i) => i.id);
      }

      const auditSession = await prisma.auditSession.create({
        data: {
          scopeType,
          scopeValue: scopeValue ?? null,
          runById: req.user.id,
          status: "IN_PROGRESS",
          snapshotTotalCount: inScopeItemIds.length,
          excludedAuditorCount,
        },
        include: {
          runBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      // Pre-freeze the in-scope items as PENDING rows
      if (inScopeItemIds.length > 0) {
        await prisma.auditItemResultRow.createMany({
          data: inScopeItemIds.map((itemId) => ({
            auditSessionId: auditSession.id,
            itemId,
            result: "PENDING" as const,
            scannedAt: null,
          })),
        });
      }

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
 * If the item was in scope (pre-seeded PENDING), updates row to FOUND.
 * If the item was NOT in scope, creates row as LOCATION_MISMATCH.
 */
auditsRouter.post(
  "/:id/scan",
  authenticate,
  requireCapability("AUDIT_RUN"),
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

      if (session.completedAt !== null || (session.status && session.status !== "IN_PROGRESS")) {
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

      // Check if a row already exists for this item in this session
      const existingRow = await prisma.auditItemResultRow.findUnique({
        where: {
          auditSessionId_itemId: {
            auditSessionId: id,
            itemId,
          },
        },
      });

      let auditResultRow;
      if (existingRow) {
        auditResultRow = await prisma.auditItemResultRow.update({
          where: { id: existingRow.id },
          data: {
            result: "FOUND",
            scannedAt: scanTimestamp,
          },
          include: {
            item: true,
          },
        });
      } else {
        // If not in pre-seeded list, check if session has any rows (if 0 total in scope, count as FOUND)
        const hasScopeRows = session.snapshotTotalCount > 0;
        const resultType = hasScopeRows ? "LOCATION_MISMATCH" : "FOUND";

        auditResultRow = await prisma.auditItemResultRow.create({
          data: {
            auditSessionId: id,
            itemId,
            result: resultType as any,
            scannedAt: scanTimestamp,
          },
          include: {
            item: true,
          },
        });
      }

      res.status(201).json(auditResultRow);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/audits/:id/close-walk
 * POST /audits/:id/close-walk
 *
 * Concludes the physical walk phase.
 * Un-scanned items remaining as PENDING transition to NOT_LOCATED (never immediately MISSING).
 * Session status transitions to SORTING.
 */
auditsRouter.post(
  "/:id/close-walk",
  authenticate,
  requireCapability("AUDIT_RUN"),
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

      if (session.completedAt !== null || session.status === "COMPLETED" || session.status === "ACKNOWLEDGED") {
        res.status(409).json({ error: "Audit session is already completed" });
        return;
      }

      // Convert all remaining PENDING items to NOT_LOCATED
      await prisma.$transaction([
        prisma.auditItemResultRow.updateMany({
          where: {
            auditSessionId: id,
            result: "PENDING",
          },
          data: {
            result: "NOT_LOCATED",
          },
        }),
        prisma.auditSession.update({
          where: { id },
          data: {
            status: "SORTING",
          },
        }),
      ]);

      const [foundCount, notLocatedCount, mismatchCount] = await Promise.all([
        prisma.auditItemResultRow.count({ where: { auditSessionId: id, result: "FOUND" } }),
        prisma.auditItemResultRow.count({ where: { auditSessionId: id, result: "NOT_LOCATED" } }),
        prisma.auditItemResultRow.count({ where: { auditSessionId: id, result: "LOCATION_MISMATCH" } }),
      ]);

      res.status(200).json({
        message: "Walk completed. Ready for sorting phase.",
        status: "SORTING",
        counts: {
          found: foundCount,
          notLocated: notLocatedCount,
          locationMismatch: mismatchCount,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

const sortItemSchema = z.object({
  itemId: z.string().uuid("Valid itemId is required"),
  result: z.enum(["NOT_ACCESSIBLE", "CHECK_AGAIN", "MISSING"]),
  sortReason: z.string().trim().min(1, "Sort reason is required"),
  sortNote: z.string().trim().optional().nullable(),
  checkAgainDays: z.coerce.number().int().min(1).max(90).optional().nullable(),
});

/**
 * POST /api/v1/audits/:id/sort-item
 * POST /audits/:id/sort-item
 *
 * Categorizes an un-scanned / NOT_LOCATED item during the SORTING phase into:
 * - NOT_ACCESSIBLE (locked room, holder away)
 * - CHECK_AGAIN (retry in N days)
 * - MISSING (confirmed missing, leads to investigation)
 */
auditsRouter.post(
  "/:id/sort-item",
  authenticate,
  requireCapability("AUDIT_RUN"),
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

      if (session.status !== "SORTING" && session.status !== "IN_PROGRESS") {
        res.status(409).json({ error: `Cannot sort items when audit status is ${session.status}` });
        return;
      }

      const parsed = sortItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const { itemId, result, sortReason, sortNote, checkAgainDays } = parsed.data;

      const existingRow = await prisma.auditItemResultRow.findUnique({
        where: {
          auditSessionId_itemId: {
            auditSessionId: id,
            itemId,
          },
        },
      });

      if (!existingRow) {
        res.status(404).json({ error: "Audit result row not found for item" });
        return;
      }

      const updatedRow = await prisma.auditItemResultRow.update({
        where: { id: existingRow.id },
        data: {
          result,
          sortReason,
          sortNote: sortNote ?? null,
          checkAgainDays: result === "CHECK_AGAIN" ? (checkAgainDays ?? 7) : null,
        },
        include: {
          item: true,
        },
      });

      res.status(200).json(updatedRow);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/audits/:id/finalize
 * POST /audits/:id/finalize
 *
 * Finalizes the audit:
 * 1. Assigns a sequential reportNumber (AUD-YYYY-NNNN).
 * 2. Creates a permanent, immutable frozenReport snapshot.
 * 3. Updates Item.lastAuditedAt for FOUND items.
 * 4. Dispatches loss notifications to Property Officers if MISSING items exist.
 * 5. Transitions session status to COMPLETED.
 */
auditsRouter.post(
  "/:id/finalize",
  authenticate,
  requireCapability("AUDIT_RUN"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Audit session ID is required" });
        return;
      }

      const session = await prisma.auditSession.findUnique({
        where: { id },
        include: {
          runBy: { select: { id: true, fullName: true, email: true } },
        },
      });

      if (!session) {
        res.status(404).json({ error: "Audit session not found" });
        return;
      }

      if (session.completedAt !== null || session.status === "COMPLETED" || session.status === "ACKNOWLEDGED") {
        res.status(409).json({ error: "Audit session is already finalized" });
        return;
      }

      // Convert any leftover PENDING items to NOT_LOCATED
      await prisma.auditItemResultRow.updateMany({
        where: { auditSessionId: id, result: "PENDING" },
        data: { result: "NOT_LOCATED" },
      });

      // Generate sequential report number (AUD-YYYY-NNNN)
      const year = new Date().getFullYear();
      const lastSession = await prisma.auditSession.findFirst({
        where: { reportNumber: { startsWith: `AUD-${year}-` } },
        orderBy: { reportNumber: "desc" },
        select: { reportNumber: true },
      });

      let nextSeq = 1;
      if (lastSession?.reportNumber) {
        const parts = lastSession.reportNumber.split("-");
        const num = parseInt(parts[2] || "0", 10);
        if (!isNaN(num)) nextSeq = num + 1;
      }
      const reportNumber = `AUD-${year}-${String(nextSeq).padStart(4, "0")}`;

      // Fetch all rows with complete item context
      const allRows = await prisma.auditItemResultRow.findMany({
        where: { auditSessionId: id },
        include: {
          item: {
            select: {
              id: true,
              tagId: true,
              name: true,
              category: { select: { name: true } },
              orgUnitRef: { select: { name: true } },
              buildingRef: { select: { name: true } },
              floor: true,
              room: true,
              status: true,
              condition: true,
            },
          },
        },
      });

      const counts = {
        found: allRows.filter((r) => r.result === "FOUND").length,
        notAccessible: allRows.filter((r) => r.result === "NOT_ACCESSIBLE").length,
        checkAgain: allRows.filter((r) => r.result === "CHECK_AGAIN").length,
        missing: allRows.filter((r) => r.result === "MISSING").length,
        locationMismatch: allRows.filter((r) => r.result === "LOCATION_MISMATCH").length,
        notLocated: allRows.filter((r) => r.result === "NOT_LOCATED").length,
      };

      const completedAt = new Date();

      const frozenReport = {
        reportNumber,
        sessionId: session.id,
        scopeType: session.scopeType,
        scopeValue: session.scopeValue,
        startedAt: session.startedAt,
        completedAt,
        runBy: session.runBy,
        snapshotTotalCount: session.snapshotTotalCount,
        excludedAuditorCount: session.excludedAuditorCount,
        counts,
        items: allRows.map((r) => ({
          itemId: r.itemId,
          tagId: r.item.tagId,
          name: r.item.name,
          category: r.item.category?.name || "General",
          department: r.item.orgUnitRef?.name || null,
          building: r.item.buildingRef?.name || null,
          floor: r.item.floor,
          room: r.item.room,
          result: r.result,
          sortReason: r.sortReason,
          sortNote: r.sortNote,
          checkAgainDays: r.checkAgainDays,
          scannedAt: r.scannedAt,
        })),
      };

      const foundItemIds = allRows.filter((r) => r.result === "FOUND").map((r) => r.itemId);

      await prisma.$transaction([
        prisma.auditSession.update({
          where: { id },
          data: {
            status: "COMPLETED",
            completedAt,
            reportNumber,
            frozenReport: frozenReport as any,
          },
        }),
        ...(foundItemIds.length > 0
          ? [
              prisma.item.updateMany({
                where: { id: { in: foundItemIds } },
                data: { lastAuditedAt: completedAt },
              }),
            ]
          : []),
      ]);

      // If MISSING items exist, dispatch notification to Property Officers
      if (counts.missing > 0) {
        const propertyOfficers = await prisma.user.findMany({
          where: { role: "PROPERTY_OFFICER" },
          select: { id: true },
        });

        if (propertyOfficers.length > 0) {
          await prisma.notification.createMany({
            data: propertyOfficers.map((po) => ({
              userId: po.id,
              message: `Audit report ${reportNumber} finalized with ${counts.missing} missing item(s) requiring investigation.`,
              relatedRequestId: session.id,
            })),
          });
        }
      }

      res.status(200).json({
        id: session.id,
        status: "COMPLETED",
        reportNumber,
        completedAt,
        counts,
        frozenReport,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/audits/:id/acknowledge
 * POST /audits/:id/acknowledge
 *
 * Property Officer formal acknowledgement & sign-off on the completed audit report.
 */
auditsRouter.post(
  "/:id/acknowledge",
  authenticate,
  requireCapability("AUDIT_ACKNOWLEDGE"),
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

      const session = await prisma.auditSession.findUnique({
        where: { id },
        include: {
          runBy: { select: { id: true, fullName: true } },
        },
      });

      if (!session) {
        res.status(404).json({ error: "Audit session not found" });
        return;
      }

      if (session.status === "ACKNOWLEDGED") {
        res.status(409).json({ error: "Audit session has already been acknowledged" });
        return;
      }

      if (session.status !== "COMPLETED" && session.completedAt === null) {
        res.status(400).json({ error: "Audit session must be completed before acknowledgement" });
        return;
      }

      const acknowledgedAt = new Date();

      const updated = await prisma.auditSession.update({
        where: { id },
        data: {
          status: "ACKNOWLEDGED",
          acknowledgedAt,
          acknowledgedById: req.user.id,
        },
        include: {
          acknowledgedBy: { select: { id: true, fullName: true, email: true } },
        },
      });

      // Notify the auditor who ran this session
      const officerUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { fullName: true },
      });
      const officerName = officerUser?.fullName || "Property Officer";

      await prisma.notification.create({
        data: {
          userId: session.runById,
          message: `Property Officer ${officerName} acknowledged Audit report ${session.reportNumber || session.id}.`,
          relatedRequestId: session.id,
        },
      });

      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/audits/:id/complete
 * POST /audits/:id/complete
 *
 * Backward-compatible endpoint that closes walk, computes results, and marks completed.
 */
auditsRouter.post(
  "/:id/complete",
  authenticate,
  requireCapability("AUDIT_RUN"),
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

      // Grace window: default 7 days, configurable via query param
      const graceDays = req.query.graceDays ? parseInt(req.query.graceDays as string, 10) : 7;
      const graceEndsAt = new Date(completedAt.getTime() + graceDays * 24 * 60 * 60 * 1000);

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
          data: { completedAt, graceEndsAt, status: "COMPLETED" },
        }),
      ]);

      res.status(200).json({
        auditSessionId: id,
        completedAt,
        graceEndsAt,
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
 * fixed list, while the value it matches is a name an operator typed when the
 * item was registered, so an item filed as "computer science" would otherwise be
 * invisible to a "Computer Science" audit and counted MISSING — a false report,
 * which is worse than a missing feature. Insensitive matching closes exactly
 * that hole.
 *
 * The columns behind them are the item's OrgUnit and Building (`Item.orgUnitRef`
 * / `Item.buildingRef`); the free-text `department`/`building` columns these
 * filters used to name are gone, and matching on them was one of the ways an
 * audit could answer 500. Both helpers come from `utils/itemLocation.ts`, so the
 * audit's "what is in this department" and the inventory report's are the same
 * question asked once.
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
          : { ...departmentWhere(scopeValue, "insensitive"), status: "ACTIVE" },
    };
  }
  if (scopeType === "BUILDING") {
    return {
      supported: true,
      where:
        scopeValue === null ? null : { ...buildingWhere(scopeValue), status: "ACTIVE" },
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
  requireCapability("AUDIT_VIEW"),
  validateQuery(listQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = validatedQuery<ListQuery>(req);
      const dashboard = req.query.dashboard === "true";

      if (dashboard) {
        // Dashboard widget mode: return simplified list with counts
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 3));
        const sort = (req.query.sort as string) || "completedAt:desc";

        const [sortField, sortOrder] = sort.split(":");
        if (!sortField) {
          res.status(400).json({ error: "Invalid sort parameter" });
          return;
        }
        const orderBy: Record<string, "asc" | "desc"> = {};
        orderBy[sortField] = sortOrder === "desc" ? "desc" : "asc";

        const dashboardWhere = {
          ...(query.mine === "true" ? { runById: user.id } : {}),
          completedAt: { not: null },
        };

        const audits = await prisma.auditSession.findMany({
          where: dashboardWhere,
          take: limit,
          orderBy,
          include: {
            runBy: {
              select: { id: true, fullName: true, email: true },
            },
            results: {
              select: { result: true },
            },
          },
        });

        const enriched = audits.map((audit) => ({
          id: audit.id,
          scopeType: audit.scopeType,
          scopeValue: audit.scopeValue,
          startedAt: audit.startedAt,
          completedAt: audit.completedAt,
          runBy: audit.runBy,
          counts: {
            found: audit.results.filter((r) => r.result === "FOUND").length,
            missing: audit.results.filter((r) => r.result === "MISSING").length,
            locationMismatch: audit.results.filter((r) => r.result === "LOCATION_MISMATCH").length,
          },
        }));

        res.status(200).json(enriched);
        return;
      }

      const where = {
        // Anyone with AUDIT_VIEW (an auditor or the property officer acting on
        // findings) sees the college's audit history; `mine=true` narrows to
        // their own sessions and nothing widens it back.
        ...(query.mine === "true" ? { runById: user.id } : {}),
      };

      const [sessions, total] = await Promise.all([
        prisma.auditSession.findMany({
          where,
          select: {
            id: true,
            status: true,
            reportNumber: true,
            scopeType: true,
            scopeValue: true,
            snapshotTotalCount: true,
            excludedAuditorCount: true,
            runById: true,
            startedAt: true,
            completedAt: true,
            acknowledgedAt: true,
            acknowledgedBy: { select: { id: true, fullName: true, email: true } },
            runBy: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
          take: query.limit,
          skip: query.offset,
        }),
        prisma.auditSession.count({ where }),
      ]);

      /**
       * One grouped query for the whole page rather than a query per row, grouped
       * by `itemId` as well as `result` so a double-scanned item is counted once.
       */
      const grouped = sessions.length
        ? await prisma.auditItemResultRow.groupBy({
            by: ["auditSessionId", "itemId", "result"],
            where: { auditSessionId: { in: sessions.map((session) => session.id) } },
            _count: { _all: true },
          })
        : [];

      const countFor = (sessionId: string, result: string) =>
        grouped.filter((row) => row.auditSessionId === sessionId && row.result === result).length;

      res.status(200).json({
        audits: sessions.map((session) => ({
          ...session,
          completed: session.completedAt !== null,
          counts: {
            found: countFor(session.id, "FOUND"),
            missing: countFor(session.id, "MISSING"),
            locationMismatch: countFor(session.id, "LOCATION_MISMATCH"),
            notLocated: countFor(session.id, "NOT_LOCATED"),
            notAccessible: countFor(session.id, "NOT_ACCESSIBLE"),
            checkAgain: countFor(session.id, "CHECK_AGAIN"),
            pending: countFor(session.id, "PENDING"),
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
 * `GET /audits/active` — the session this auditor has open, for the dashboard
 * tile (`AUDIT_RUN`, so Auditor only).
 *
 * **Declared above `GET /:id` on purpose, and it has to stay there.** Express
 * matches in registration order, so with the param route first `/audits/active`
 * reached `/:id` with `id === "active"`, which looked up a session by that name
 * and 404'd — the tile was a permanent "no active audit" (14 Oct audit).
 * `audits.test.ts` exercises it through the real app, so the order is pinned.
 */
auditsRouter.get(
  "/active",
  authenticate,
  requireCapability("AUDIT_RUN"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const activeSession = await prisma.auditSession.findFirst({
        where: {
          runById: req.user.id,
          completedAt: null,
          status: { in: ["IN_PROGRESS", "SORTING"] },
        },
        include: {
          runBy: {
            select: { id: true, fullName: true, email: true },
          },
          results: {
            select: {
              result: true,
            },
          },
        },
        orderBy: { startedAt: "desc" },
      });

      if (!activeSession) {
        res.status(200).json({ active: false });
        return;
      }

      const scannedCount = activeSession.results.filter((r) => r.result === "FOUND").length;
      const totalInScope = await prisma.auditItemResultRow.count({
        where: { auditSessionId: activeSession.id },
      });

      res.status(200).json({
        active: true,
        session: {
          id: activeSession.id,
          status: activeSession.status,
          scopeType: activeSession.scopeType,
          scopeValue: activeSession.scopeValue,
          snapshotTotalCount: activeSession.snapshotTotalCount,
          excludedAuditorCount: activeSession.excludedAuditorCount,
          startedAt: activeSession.startedAt,
          runBy: activeSession.runBy,
        },
        progress: {
          scanned: scannedCount,
          total: totalInScope,
          remaining: totalInScope - scannedCount,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `GET /audits/findings?status=OPEN` — items marked MISSING inside their grace
 * window, for the "open findings" tile (`AUDIT_RUN`, so Auditor only). `status`
 * is required: anything else is a 400 rather than a silently different number.
 *
 * Declared above `GET /:id` for the same reason as `/active` — see the comment
 * there. Below it, `/:id` matched with `id === "findings"` and the count request
 * came back as "no such session".
 */
auditsRouter.get(
  "/findings",
  authenticate,
  requireCapability("AUDIT_RUN"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as string;

      if (status === "OPEN") {
        const count = await prisma.auditItemResultRow.count({
          where: {
            result: "MISSING",
            auditSession: {
              completedAt: { not: null },
              graceEndsAt: { gt: new Date() },
            },
          },
        });

        res.status(200).json({ count });
      } else {
        res.status(400).json({ error: "Invalid status parameter" });
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `GET /api/v1/audits/:id` — read a session back, completed or not.
 *
 * If the session is finalized and has a frozenReport snapshot, returns the
 * permanently frozen report to guarantee historical immutability.
 */
auditsRouter.get(
  "/:id",
  authenticate,
  requireCapability("AUDIT_VIEW"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Audit session ID is required" });
        return;
      }

      const session = await prisma.auditSession.findUnique({
        where: { id },
        include: {
          runBy: { select: { id: true, fullName: true, email: true } },
          acknowledgedBy: { select: { id: true, fullName: true, email: true } },
        },
      });

      if (!session) {
        res.status(404).json({ error: "Audit session not found" });
        return;
      }

      // If the session has an immutable frozen report, return it directly
      if (session.frozenReport && typeof session.frozenReport === "object") {
        const report = session.frozenReport as any;
        res.status(200).json({
          id: session.id,
          status: session.status,
          reportNumber: session.reportNumber,
          scopeType: session.scopeType,
          scopeValue: session.scopeValue,
          runById: session.runById,
          runBy: session.runBy,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          completed: session.completedAt !== null,
          snapshotTotalCount: session.snapshotTotalCount,
          excludedAuditorCount: session.excludedAuditorCount,
          acknowledgedAt: session.acknowledgedAt,
          acknowledgedById: session.acknowledgedById,
          acknowledgedBy: session.acknowledgedBy,
          frozenReport: session.frozenReport,
          counts: report.counts,
          found: report.items.filter((i: any) => i.result === "FOUND").map((i: any) => i.itemId),
          missing: report.items.filter((i: any) => i.result === "MISSING").map((i: any) => i.itemId),
          locationMismatch: report.items.filter((i: any) => i.result === "LOCATION_MISMATCH").map((i: any) => i.itemId),
          notLocated: report.items.filter((i: any) => i.result === "NOT_LOCATED").map((i: any) => i.itemId),
          notAccessible: report.items.filter((i: any) => i.result === "NOT_ACCESSIBLE").map((i: any) => i.itemId),
          checkAgain: report.items.filter((i: any) => i.result === "CHECK_AGAIN").map((i: any) => i.itemId),
          rows: report.items.map((i: any) => ({
            itemId: i.itemId,
            result: i.result,
            scannedAt: i.scannedAt,
            sortReason: i.sortReason,
            sortNote: i.sortNote,
            checkAgainDays: i.checkAgainDays,
            item: {
              tagId: i.tagId,
              name: i.name,
              category: i.category,
              department: i.department,
              building: i.building,
              floor: i.floor,
              room: i.room,
            },
          })),
        });
        return;
      }

      const rows = await prisma.auditItemResultRow.findMany({
        where: { auditSessionId: id },
        select: {
          itemId: true,
          result: true,
          scannedAt: true,
          sortReason: true,
          sortNote: true,
          checkAgainDays: true,
          item: {
            select: {
              tagId: true,
              name: true,
              ...ITEM_LOCATION_SELECT,
              floor: true,
              room: true,
            },
          },
        },
      });

      const collapsedRows = collapseAuditRows(rows);

      const byResult = (result: string) =>
        collapsedRows.filter((row) => row.result === result).map((row) => row.itemId);

      res.status(200).json({
        id: session.id,
        status: session.status,
        reportNumber: session.reportNumber,
        scopeType: session.scopeType,
        scopeValue: session.scopeValue,
        runById: session.runById,
        runBy: session.runBy,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        completed: session.completedAt !== null,
        snapshotTotalCount: session.snapshotTotalCount,
        excludedAuditorCount: session.excludedAuditorCount,
        acknowledgedAt: session.acknowledgedAt,
        acknowledgedById: session.acknowledgedById,
        acknowledgedBy: session.acknowledgedBy,
        counts: {
          found: collapsedRows.filter((row) => row.result === "FOUND").length,
          missing: collapsedRows.filter((row) => row.result === "MISSING").length,
          locationMismatch: collapsedRows.filter((row) => row.result === "LOCATION_MISMATCH").length,
          notLocated: collapsedRows.filter((row) => row.result === "NOT_LOCATED").length,
          notAccessible: collapsedRows.filter((row) => row.result === "NOT_ACCESSIBLE").length,
          checkAgain: collapsedRows.filter((row) => row.result === "CHECK_AGAIN").length,
          pending: collapsedRows.filter((row) => row.result === "PENDING").length,
        },
        found: byResult("FOUND"),
        missing: byResult("MISSING"),
        locationMismatch: byResult("LOCATION_MISMATCH"),
        notLocated: byResult("NOT_LOCATED"),
        notAccessible: byResult("NOT_ACCESSIBLE"),
        checkAgain: byResult("CHECK_AGAIN"),
        pending: byResult("PENDING"),
        rows: collapsedRows.map((row) => withRowItemNames(row)),
      });
    } catch (err) {
      next(err);
    }
  },
);




