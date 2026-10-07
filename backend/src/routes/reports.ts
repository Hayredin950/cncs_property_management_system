import { Router, type NextFunction, type Response, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { httpError } from "../lib/httpError.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateQuery, validatedQuery, type ValidatedRequest } from "../middleware/validate.js";
import { collapseAuditRows } from "../services/auditCompletion.js";
import { allItemsWhere } from "../services/itemVisibility.js";
import { toCsv, type CsvValue } from "../utils/csv.js";
import { toPdfTable } from "../utils/pdf.js";

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
 * Both `format=csv` and `format=pdf` are supported, CSV by default. The three-
 * phase plan marks PDF a stretch/cut-first item, and it is now built on top of
 * the same headers/rows the CSV path already produces (`utils/pdf.ts`), so the
 * two formats cannot drift apart. `?format=` anything else is a 400, not a
 * silent fallback to JSON — a report endpoint that quietly returns JSON when a
 * client typos the query string is a worse failure mode than a clear rejection.
 */

export const reportsRouter: ExpressRouter = Router();

const FORMAT = z.enum(["csv", "pdf"]).default("csv");

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
type AuditReportQuery = z.infer<typeof auditReportQuerySchema>;

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

/**
 * Human column labels, shared by every report. The CSV deliberately keeps the
 * machine keys — an importer that matches on `purchaseCost` must not have to
 * guess at capitalisation or word breaks — while the PDF prints these, so a
 * printed page says `Purchase cost` instead of `PURCHASECOST`. One map rather
 * than one per report: the three reports share most of their columns, and a
 * second copy is how two exports drift into disagreeing about the same field.
 */
const COLUMN_LABELS: Record<string, string> = {
  tagId: "Tag ID",
  name: "Name",
  category: "Category",
  department: "Department",
  building: "Building",
  floor: "Floor",
  room: "Room",
  ownerName: "Owner",
  ownerEmail: "Owner email",
  condition: "Condition",
  purchaseCost: "Purchase cost",
  currentValue: "Current value",
  brand: "Brand",
  model: "Model",
  serialNumber: "Serial number",
  status: "Status",
  disposalReason: "Disposal reason",
  disposedAt: "Disposed at",
  registeredAt: "Registered at",
  lastAuditedAt: "Last audited",
  auditSessionId: "Audit session",
  scopeType: "Scope type",
  scopeValue: "Scope value",
  runByName: "Run by",
  startedAt: "Started at",
  completedAt: "Completed at",
  itemName: "Item",
  result: "Result",
  scannedAt: "Scanned at",
  requestedByName: "Requested by",
  requestedByEmail: "Requester email",
  reviewedByName: "Reviewed by",
  reviewedByEmail: "Reviewer email",
  decidedAt: "Decided at",
};

function sendCsv(res: Response, filename: string, csv: string): void {
  res
    .status(200)
    .type("text/csv")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .send(csv);
}

/**
 * A `dateFrom`/`dateTo` pair as two metadata lines' worth of context. Dates are
 * cut to the day, matching how the query string was written — the export should
 * echo what was asked for, not the midnight/end-of-day instants the range
 * resolved to internally.
 */
function rangeLine(query: { dateFrom?: Date | undefined; dateTo?: Date | undefined }): string | null {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  if (query.dateFrom && query.dateTo) {
    return `Date range: ${day(query.dateFrom)} to ${day(query.dateTo)}`;
  }
  if (query.dateFrom) return `Date range: from ${day(query.dateFrom)}`;
  if (query.dateTo) return `Date range: up to ${day(query.dateTo)}`;
  return null;
}

/**
 * `Filters: department Computer Science | status ACTIVE`, or null when the
 * report was not narrowed at all. ASCII separator on purpose — `utils/pdf.ts`
 * folds typographic punctuation to ASCII before it reaches a Type1 font, so a
 * middle dot would print as something else.
 */
function filterLine(entries: Array<[string, string | undefined]>): string | null {
  const active = entries.filter(([, value]) => value !== undefined && value !== "");
  if (active.length === 0) return null;
  return `Filters: ${active.map(([key, value]) => `${key} ${value}`).join(" | ")}`;
}

/** Drops the empty entries of a metadata line list, so no report shows `Filters:` with nothing after it. */
function metaLines(count: number, ...lines: Array<string | null>): string[] {
  return [
    ...lines.filter((line): line is string => Boolean(line)),
    `${count} record${count === 1 ? "" : "s"}`,
  ];
}

/**
 * Same headers/rows as the CSV path, rendered as a table. Kept beside `sendCsv`
 * so a new report only has to build its rows once and pick a format at the end.
 * The PDF is the human-facing half of F10, so it gets the human column labels
 * and the scope/filter lines that a machine reading the CSV does not need.
 */
function sendPdf(
  res: Response,
  filename: string,
  title: string,
  headers: string[],
  rows: Array<Record<string, CsvValue>>,
  meta: string[],
): void {
  const pdf = toPdfTable({
    title,
    subtitle: `Generated ${new Date().toISOString()}`,
    headers,
    rows,
    columnLabels: COLUMN_LABELS,
    meta,
  });
  res
    .status(200)
    .type("application/pdf")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .send(pdf);
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

      if (query.format === "pdf") {
        sendPdf(
          res,
          `inventory-report-${todayStamp()}.pdf`,
          "CNCS Property - Inventory report",
          headers,
          rows,
          metaLines(
            rows.length,
            filterLine([
              ["department", query.department],
              ["categoryId", query.categoryId],
              ["status", query.status],
            ]),
            rangeLine(query),
          ),
        );
        return;
      }
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
      const query = validatedQuery<AuditReportQuery>(req);
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
        orderBy: [{ result: "asc" }, { item: { tagId: "asc" } }],
      });

      /*
        One row per item, not per scan: a sticker scanned twice persists two
        FOUND rows, and the export previously emitted both (D11). The collapse
        keeps the latest `scannedAt` and is the same helper `GET /audits/:id`
        uses, so the CSV and the on-screen breakdown cannot disagree.
      */
      const collapsedRows = collapseAuditRows(resultRows);

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
      const rows: Array<Record<string, CsvValue>> = collapsedRows.map((row) => ({
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

      if (query.format === "pdf") {
        sendPdf(
          res,
          `audit-report-${auditId}.pdf`,
          `CNCS Property - Audit report (${session.scopeType}${
            session.scopeValue ? `: ${session.scopeValue}` : ""
          })`,
          headers,
          rows,
          metaLines(
            rows.length,
            `Audit session: ${session.scopeType}${session.scopeValue ? ` - ${session.scopeValue}` : ""}`,
            `Run by: ${session.runBy.fullName}`,
          ),
        );
        return;
      }
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

      if (query.format === "pdf") {
        sendPdf(
          res,
          `disposals-report-${todayStamp()}.pdf`,
          "CNCS Property - Disposals report",
          headers,
          rows,
          metaLines(rows.length, filterLine([["department", query.department]]), rangeLine(query)),
        );
        return;
      }
      sendCsv(res, `disposals-report-${todayStamp()}.csv`, toCsv(headers, rows));
    } catch (err) {
      next(err);
    }
  },
);