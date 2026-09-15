import { Router, type NextFunction, type Response, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { httpError } from "../lib/httpError.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateQuery, validatedQuery, type ValidatedRequest } from "../middleware/validate.js";
import { allItemsWhere } from "../services/itemVisibility.js";
import { toCsv, type CsvValue } from "../utils/csv.js";

/**
 * Report exports (SRS F10). Staff/Admin only — these are internal
 * accountability documents, not the public item view, so
 * `utils/filterItemFields.ts` (SDS 3.2) does not apply here: that rule
 * governs what a *viewer* of an item may see, and every viewer of a report
 * is already Staff or Admin. Deliberately querying `allItemsWhere` (not
 * `activeItemsWhere`) for the inventory report — F7.2 keeps a disposed item
 * "queryable in reports/history", and hiding it here would be the one call
 * site `itemVisibility.ts` warns about.
 *
 * Only `format=csv` is supported. The three-phase plan marks PDF a
 * stretch/cut-first item; CSV is the one every exit criterion requires, so
 * that's the only format this file commits to. `?format=` anything else is
 * a 400, not a silent fallback to JSON — a report endpoint that quietly
 * returns JSON when a client typos the query string is a worse failure mode
 * than a clear rejection.
 */

export const reportsRouter: ExpressRouter = Router();

const FORMAT = z.enum(["csv"]).default("csv");

/**
 * `dateFrom`/`dateTo` are inclusive on both endpoints, and a range with
 * `dateFrom` after `dateTo` is rejected at validation time rather than
 * silently returning zero rows — the same "fail loud, not confusing" choice
 * `requests.ts`'s `createRequestSchema` makes with `superRefine`.
 *
 * Each query schema is written out directly rather than through a shared
 * generic helper. An earlier version built one with `z.object({ ...shape })`
 * behind a generic `<T extends z.ZodRawShape>`, and Zod v4's inferred types
 * are complex enough that TypeScript couldn't resolve `value.dateFrom` inside
 * the `superRefine` callback — `pnpm run build` failed even though the schema
 * worked correctly at runtime. Three extra lines of duplication here is
 * cheaper than a generic whose type doesn't actually check.
 */
const inventoryQuerySchema = z
  .object({
    department: z.string().trim().min(1).optional(),
    categoryId: z.string().trim().min(1).optional(),
    status: z.enum(["ACTIVE", "DISPOSED"]).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    format: FORMAT,
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: "custom",
        message: "dateFrom must be on or before dateTo",
        path: ["dateFrom"],
      });
    }
  });
type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

const disposalsQuerySchema = z
  .object({
    department: z.string().trim().min(1).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    format: FORMAT,
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: "custom",
        message: "dateFrom must be on or before dateTo",
        path: ["dateFrom"],
      });
    }
  });
type DisposalsQuery = z.infer<typeof disposalsQuerySchema>;

const auditReportQuerySchema = z.object({ format: FORMAT });

/**
 * Inclusive upper bound: a bare `dateTo` should include that whole day, not
 * stop at midnight. Uses `setUTCHours`, not `setHours` — `z.coerce.date()`
 * parses a bare date string ("2026-02-01") as UTC midnight, so finishing the
 * range in *local* time made the cutoff drift by the server's UTC offset.
 * That's the kind of bug that looks correct on one machine and silently
 * wrong on whichever timezone the real server happens to run in — caught by
 * `csv.test.ts`'s sibling in `reports.test.ts` failing in a UTC+3 dev
 * environment, which is exactly the failure mode this fixes.
 */
function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function sendCsv(res: Response, filename: string, csv: string): void {
  res
    .status(200)
    .type("text/csv")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .send(csv);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/v1/reports/inventory?department=&categoryId=&status=&dateFrom=&dateTo=&format=csv
 * Staff/Admin. One row per item, full record — see the file header on why
 * field filtering doesn't apply. `dateFrom`/`dateTo` filter on
 * `registeredAt`; omit `status` to get both ACTIVE and DISPOSED items.
 */
reportsRouter.get(
  "/inventory",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  validateQuery(inventoryQuerySchema),
  async (req: ValidatedRequest, res: Response, next: NextFunction) => {
    try {
      const query = validatedQuery<InventoryQuery>(req);

      const where = allItemsWhere({
        ...(query.department ? { department: query.department } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              registeredAt: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: endOfDay(query.dateTo) } : {}),
              },
            }
          : {}),
      });

      const items = await prisma.item.findMany({
        where,
        select: {
          tagId: true,
          name: true,
          category: { select: { name: true } },
          department: true,
          building: true,
          floor: true,
          room: true,
          owner: { select: { fullName: true, email: true } },
          condition: true,
          purchaseCost: true,
          currentValue: true,
          brand: true,
          model: true,
          serialNumber: true,
          status: true,
          disposalReason: true,
          disposedAt: true,
          registeredAt: true,
          lastAuditedAt: true,
        },
        orderBy: [{ department: "asc" }, { tagId: "asc" }],
      });

      const headers = [
        "tagId",
        "name",
        "category",
        "department",
        "building",
        "floor",
        "room",
        "ownerName",
        "ownerEmail",
        "condition",
        "purchaseCost",
        "currentValue",
        "brand",
        "model",
        "serialNumber",
        "status",
        "disposalReason",
        "disposedAt",
        "registeredAt",
        "lastAuditedAt",
      ];
      const rows: Array<Record<string, CsvValue>> = items.map((item) => ({
        tagId: item.tagId,
        name: item.name,
        category: item.category.name,
        department: item.department,
        building: item.building,
        floor: item.floor,
        room: item.room,
        ownerName: item.owner.fullName,
        ownerEmail: item.owner.email,
        condition: item.condition,
        purchaseCost: item.purchaseCost.toString(),
        currentValue: item.currentValue?.toString() ?? null,
        brand: item.brand,
        model: item.model,
        serialNumber: item.serialNumber,
        status: item.status,
        disposalReason: item.disposalReason,
        disposedAt: item.disposedAt,
        registeredAt: item.registeredAt,
        lastAuditedAt: item.lastAuditedAt,
      }));

      sendCsv(res, `inventory-report-${todayStamp()}.csv`, toCsv(headers, rows));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/audit/:auditId?format=csv
 * Staff/Admin. One row per recorded scan/classification for that session.
 * Works for an in-progress session too (only FOUND rows will exist yet) —
 * there's no requirement here that the session be completed, since a
 * reviewer mid-audit may still want to export what's been scanned so far.
 * Session metadata is denormalized onto every row rather than emitted as a
 * preamble, so the file stays one flat table a spreadsheet can import as-is.
 */
reportsRouter.get(
  "/audit/:auditId",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  validateQuery(auditReportQuerySchema),
  async (req: ValidatedRequest, res: Response, next: NextFunction) => {
    try {
      const auditId = req.params.auditId;
      if (typeof auditId !== "string") {
        throw httpError(400, "Audit session ID is required");
      }

      const session = await prisma.auditSession.findUnique({
        where: { id: auditId },
        select: {
          id: true,
          scopeType: true,
          scopeValue: true,
          startedAt: true,
          completedAt: true,
          runBy: { select: { fullName: true, email: true } },
        },
      });
      if (!session) {
        throw httpError(404, "Audit session not found");
      }

      const resultRows = await prisma.auditItemResultRow.findMany({
        where: { auditSessionId: auditId },
        select: {
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
        orderBy: [{ result: "asc" }, { item: { tagId: "asc" } }],
      });

      const headers = [
        "auditSessionId",
        "scopeType",
        "scopeValue",
        "runByName",
        "startedAt",
        "completedAt",
        "tagId",
        "itemName",
        "department",
        "building",
        "floor",
        "room",
        "result",
        "scannedAt",
      ];
      const rows: Array<Record<string, CsvValue>> = resultRows.map((row) => ({
        auditSessionId: session.id,
        scopeType: session.scopeType,
        scopeValue: session.scopeValue,
        runByName: session.runBy.fullName,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        tagId: row.item.tagId,
        itemName: row.item.name,
        department: row.item.department,
        building: row.item.building,
        floor: row.item.floor,
        room: row.item.room,
        result: row.result,
        scannedAt: row.scannedAt,
      }));

      sendCsv(res, `audit-report-${auditId}.csv`, toCsv(headers, rows));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/disposals?department=&dateFrom=&dateTo=&format=csv
 * Staff/Admin. One row per *decided* disposal — reads from `Request`
 * (`type: DISPOSAL`, `status: APPROVED`), not from `Item.status: DISPOSED`
 * directly, because the request row is the only place that also carries who
 * requested it, who approved it, and why. `dateFrom`/`dateTo` filter on
 * `decidedAt`.
 */
reportsRouter.get(
  "/disposals",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  validateQuery(disposalsQuerySchema),
  async (req: ValidatedRequest, res: Response, next: NextFunction) => {
    try {
      const query = validatedQuery<DisposalsQuery>(req);

      const requests = await prisma.request.findMany({
        where: {
          type: "DISPOSAL",
          status: "APPROVED",
          ...(query.department ? { item: { department: query.department } } : {}),
          ...(query.dateFrom || query.dateTo
            ? {
                decidedAt: {
                  ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                  ...(query.dateTo ? { lte: endOfDay(query.dateTo) } : {}),
                },
              }
            : {}),
        },
        select: {
          reason: true,
          decidedAt: true,
          requestedBy: { select: { fullName: true, email: true } },
          reviewedBy: { select: { fullName: true, email: true } },
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
        orderBy: { decidedAt: "desc" },
      });

      const headers = [
        "tagId",
        "itemName",
        "department",
        "building",
        "floor",
        "room",
        "disposalReason",
        "requestedByName",
        "requestedByEmail",
        "reviewedByName",
        "reviewedByEmail",
        "decidedAt",
      ];
      const rows: Array<Record<string, CsvValue>> = requests.map((r) => ({
        tagId: r.item.tagId,
        itemName: r.item.name,
        department: r.item.department,
        building: r.item.building,
        floor: r.item.floor,
        room: r.item.room,
        disposalReason: r.reason,
        requestedByName: r.requestedBy.fullName,
        requestedByEmail: r.requestedBy.email,
        // Present on every row: only an APPROVED request reaches this query,
        // and `applyDecision` always sets `reviewedById` before that status lands.
        reviewedByName: r.reviewedBy?.fullName ?? null,
        reviewedByEmail: r.reviewedBy?.email ?? null,
        decidedAt: r.decidedAt,
      }));

      sendCsv(res, `disposals-report-${todayStamp()}.csv`, toCsv(headers, rows));
    } catch (err) {
      next(err);
    }
  },
);