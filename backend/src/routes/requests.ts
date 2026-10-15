import {
  Router,
  type NextFunction,
  type Response,
  type Router as ExpressRouter,
} from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
  type UserRole,
} from "../middleware/auth.js";
import { hasCapability } from "../services/permissions.js";
import { ITEM_LOCATION_SELECT, withRowItemNames } from "../utils/itemLocation.js";
import { validateBody, validateQuery, validatedBody, validatedQuery } from "../middleware/validate.js";
import { httpError } from "../lib/httpError.js";
import { sendNotificationEmail, type EmailDeliveryResult } from "../services/email.js";
import {
  emailSubjectFor,
  MAX_REJECTION_REASON_LENGTH,
  notifyReviewersOfNewRequest,
  parseNotificationMessage,
  renderRequestSubmitted,
  type DecisionValue,
} from "../services/notifications.js";
import {
  applyDecision,
  returnLoan,
  ERROR_DANGLING_OWNER,
  ERROR_ITEM_DISPOSED,
  ERROR_ITEM_HAS_PENDING,
  ERROR_ITEM_NOT_FOUND,
  ERROR_REQUEST_NOT_FOUND,
} from "../services/requestWorkflow.js";

/**
 * Transfer and disposal requests (SRS F6, F7).
 *
 * ── Handler style note ────────────────────────────────────────────────────
 * routes/tags.ts writes its own 500 in each `catch`. These handlers `next(err)`
 * instead, because the business rules live inside `prisma.$transaction` and can
 * only abort it by throwing: an HttpError carrying 403/404/409 has to survive
 * out to middleware/errorHandler.ts to become the right status. errorHandler
 * logs the method and URL, so nothing is lost by not logging here.
 *
 * ── Route order ──────────────────────────────────────────────────────────
 * `GET /pending-count` MUST be declared before `GET /:id`. Express 5 matches in
 * declaration order, so the reverse order silently turns the count endpoint into
 * a lookup for a request whose id is the string "pending-count".
 */

export const requestsRouter: ExpressRouter = Router();

/**
 * Neon cold starts routinely exceed Prisma's 2 s default `maxWait`, and the
 * approval transaction does 4 reads + 4 writes. Generous but bounded.
 */
const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const REQUEST_TYPES = ["TRANSFER", "DISPOSAL"] as const;
const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

/**
 * A transfer names at least one thing to change; a disposal names none. The
 * refusal is a `superRefine` rather than two schemas so the 400 body keeps the
 * same `{ error, details }` shape as every other validation failure.
 */
const createRequestSchema = z
  .object({
    type: z.enum(REQUEST_TYPES),
    itemId: z.string().trim().min(1, "itemId is required"),
    reason: z
      .string()
      .trim()
      .min(10, "reason must be at least 10 characters")
      .max(1000, "reason must be at most 1000 characters"),
    newLocationBuilding: z.string().trim().min(1).optional(),
    newLocationFloor: z.string().trim().min(1).optional(),
    newLocationRoom: z.string().trim().min(1).optional(),
    newOwnerId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const namesLocation = Boolean(
      value.newLocationBuilding ?? value.newLocationFloor ?? value.newLocationRoom,
    );
    const namesOwner = Boolean(value.newOwnerId);

    if (value.type === "TRANSFER" && !namesLocation && !namesOwner) {
      ctx.addIssue({
        code: "custom",
        message: "A transfer request must change the location or the owner",
        path: ["newLocationRoom"],
      });
    }
    if (value.type === "DISPOSAL" && (namesLocation || namesOwner)) {
      ctx.addIssue({
        code: "custom",
        message: "A disposal request must not include transfer fields",
        path: ["type"],
      });
    }
  });

type CreateRequestBody = z.infer<typeof createRequestSchema>;

/**
 * GET /api/v1/requests?window=&type=&status=&mine=&limit=&offset=
 * Staff/Admin — time-windowed, typed request list.
 *
 * The window parameter controls the time window:
 * - "this-week": requests created this week (Mon-Sun)
 * - "this-month": requests created this month
 * - "last-30-days": last 30 days
 * - "custom": requires fromDate and toDate query params
 * Default: "this-week"
 *
 * The totals endpoint returns aggregated counts by status and type.
 */
const listQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.enum(REQUEST_TYPES).optional(),
  mine: z.enum(["true", "false"]).optional(),
  window: z.enum(["this-week", "this-month", "last-30-days", "custom"]).default("this-week"),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

type ListQuery = z.infer<typeof listQuerySchema>;

const rejectSchema = z.object({
  // The `error` argument matters: without it a body that omits the field entirely
  // gets zod's own "Invalid input: expected string, received undefined", which is
  // a type report rather than something a reviewer's screen can show.
  rejectionReason: z
    .string({ error: "rejectionReason is required" })
    .trim()
    .min(3, "rejectionReason is required")
    .max(MAX_REJECTION_REASON_LENGTH, `rejectionReason must be at most ${MAX_REJECTION_REASON_LENGTH} characters`),
});

type RejectBody = z.infer<typeof rejectSchema>;

/**
 * Explicit selects, never `include`. `requestedBy` is narrowed to three columns
 * so `passwordHash` cannot reach a response even if someone later adds an
 * `include: { requestedBy: true }` elsewhere by habit.
 */
const REQUEST_LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  reason: true,
  rejectionReason: true,
  createdAt: true,
  decidedAt: true,
  newLocationBuilding: true,
  newLocationFloor: true,
  newLocationRoom: true,
  newOwnerId: true,
  requestedById: true,
  reviewedById: true,
  item: { select: { id: true, tagId: true, name: true, status: true } },
  requestedBy: { select: { id: true, fullName: true, email: true } },
} as const;

const REQUEST_DETAIL_SELECT = {
  ...REQUEST_LIST_SELECT,
  item: {
    select: {
      id: true,
      tagId: true,
      name: true,
      status: true,
      /*
       * `department` and `building` are the item's OrgUnit and Building, not
       * free-text columns: both columns were dropped when those tables landed,
       * and selecting them here is what made this route answer every detail
       * read — and every create — with a 500. Prisma only reports an unknown
       * select key at runtime, so `tsc` never saw it
       * (`utils/itemLocation.ts` has the full account).
       */
      ...ITEM_LOCATION_SELECT,
      floor: true,
      room: true,
      parentItemId: true,
    },
  },
  reviewedBy: { select: { id: true, fullName: true, email: true } },
} as const;

/*
 * `item.department` and `item.building` reach the clients as names under those
 * same keys (`withRowItemNames`), because the item's OrgUnit and Building are
 * relations and their free-text columns are gone — see `utils/itemLocation.ts`,
 * which is also where the shared select lives so this pair cannot drift from the
 * one the report exports send.
 */

/**
 * SRS 3.4 — staff see their own requests only; a reviewer sees the ones they may
 * decide. Applied as part of the `where` (not as a post-fetch check) so a staff
 * lookup of someone else's request is a 404, never a 403 that confirms it exists.
 *
 * SYSTEM_ADMIN matches nothing at all (design doc §10.3). It holds no
 * `REQUEST_READ_ALL`, so the rule used to hand it "requests you filed" — and the
 * live API showed why that is still a leak: the first row was a transfer the admin
 * account itself had filed, complete with the item's tag id, name and room from
 * `REQUEST_LIST_SELECT`. Account administration is not asset business, so the
 * answer is an empty queue expressed as a filter that matches nothing, not a
 * missing clause that would fall back to every row.
 */
function scopeToViewer(user: { id: string; role: UserRole }): Prisma.RequestWhereInput {
  if (user.role === "SYSTEM_ADMIN") return { id: { in: [] } };
  return hasCapability(user.role, "REQUEST_READ_ALL") ? {} : { requestedById: user.id };
}

/** Every handler below has already run `authenticate`, so this is a wiring guard. */
function requireUser(req: AuthenticatedRequest): { id: string; role: UserRole } {
  if (!req.user) {
    throw httpError(401, "Not authenticated");
  }
  return req.user;
}

/**
 * Best-effort email fan-out, always AFTER the transaction commits — see the
 * warning in services/email.ts about holding a pooled Neon connection.
 *
 * The stored message keeps its `[CODE]` prefix; the email (like the API) gets the
 * parsed form, and the code picks the subject line.
 */
async function emailEveryone(
  recipients: Array<{ email: string }>,
  rawMessage: string,
): Promise<EmailDeliveryResult> {
  const { code, message } = parseNotificationMessage(rawMessage);
  const subject = emailSubjectFor(code);
  try {
    const results = await Promise.all(
      recipients.map((recipient) =>
        sendNotificationEmail({ to: recipient.email, subject, body: message }),
      ),
    );
    if (results.includes("failed")) return "failed";
    if (results.includes("sent")) return "sent";
    return "skipped";
  } catch (err) {
    // Unreachable in practice (sendNotificationEmail swallows its own errors),
    // but a committed decision must never be reported as a failure.
    console.error("Notification email fan-out failed:", err);
    return "failed";
  }
}

/**
 * POST /api/v1/requests
 * Staff/Admin — file a transfer or disposal request (SRS F6.1, F7.1).
 *
 * There is deliberately no "you must own this item" gate: SRS §9 leaves item
 * custody informal, the reviewer is the control, and a staff member who spots a
 * broken projector in someone else's room should be able to report it. The
 * reviewer sees `requestedBy` on every request.
 */
requestsRouter.post(
  "/",
  authenticate,
  validateBody(createRequestSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const body = validatedBody<CreateRequestBody>(req);
      // Shared by Request.createdAt and every Notification.createdAt it fans out.
      const createdAt = new Date();

      const outcome = await prisma.$transaction(async (tx) => {
        const item = await tx.item.findUnique({
          where: { id: body.itemId },
          select: { id: true, tagId: true, name: true, status: true },
        });
        if (!item) {
          throw httpError(404, ERROR_ITEM_NOT_FOUND);
        }
        if (item.status === "DISPOSED") {
          throw httpError(409, ERROR_ITEM_DISPOSED);
        }

        // D5 — one PENDING request per item. Two pending transfers approved in
        // sequence silently double-move the item, and the second decision's
        // `oldValue` no longer describes what the first reviewer saw.
        const pending = await tx.request.findFirst({
          where: { itemId: item.id, status: "PENDING" },
          select: { id: true },
        });
        if (pending) {
          throw httpError(409, ERROR_ITEM_HAS_PENDING);
        }

        // `Request.newOwnerId` is a bare String with no foreign key, so a wrong id
        // would sit in the row until an approval tripped over it weeks later.
        if (body.newOwnerId) {
          const newOwner = await tx.user.findUnique({
            where: { id: body.newOwnerId },
            select: { id: true },
          });
          if (!newOwner) {
            throw httpError(400, ERROR_DANGLING_OWNER);
          }
        }

        // Read for the notification text: messages name people, never uuids (D3).
        const requester = await tx.user.findUnique({
          where: { id: user.id },
          select: { id: true, fullName: true, email: true },
        });
        if (!requester) {
          throw httpError(401, "Not authenticated");
        }

        const created = await tx.request.create({
          data: {
            type: body.type,
            status: "PENDING",
            reason: body.reason,
            itemId: item.id,
            requestedById: requester.id,
            createdAt,
            // Transfer targets only — a DISPOSAL that carried them was already
            // refused by the schema, so this branch never writes stale columns.
            ...(body.type === "TRANSFER"
              ? {
                  ...(body.newLocationBuilding
                    ? { newLocationBuilding: body.newLocationBuilding }
                    : {}),
                  ...(body.newLocationFloor ? { newLocationFloor: body.newLocationFloor } : {}),
                  ...(body.newLocationRoom ? { newLocationRoom: body.newLocationRoom } : {}),
                  ...(body.newOwnerId ? { newOwnerId: body.newOwnerId } : {}),
                }
              : {}),
          },
          select: REQUEST_DETAIL_SELECT,
        });

        // D2 — fan out to every eligible reviewer inside the same transaction, so
        // a request can never exist with nobody told about it.
        const recipients = await notifyReviewersOfNewRequest(tx, {
          requestId: created.id,
          requesterId: requester.id,
          requesterName: requester.fullName,
          requestType: body.type,
          itemTagId: item.tagId,
          itemName: item.name,
          createdAt,
        });

        return { created, recipients, item, requesterName: requester.fullName };
      }, TRANSACTION_OPTIONS);

      const emailStatus = await emailEveryone(
        outcome.recipients,
        renderRequestSubmitted({
          requesterName: outcome.requesterName,
          requestType: body.type,
          itemTagId: outcome.item.tagId,
          itemName: outcome.item.name,
        }),
      );

      res.status(201).json({
        request: withRowItemNames(outcome.created),
        notifiedReviewerCount: outcome.recipients.length,
        emailStatus,
      });

    } catch (err) {
      next(err);
    }
  },
);

/*
 * A second `GET /` used to be declared here — identical to the one below except
 * that it ignored the `window` parameter. Express serves the first declaration
 * that matches, so it was the one answering and the time-windowing further down
 * the file (SRS 7, design doc §9) was dead code that no request could reach. Two
 * handlers for one route where only the second is correct is worse than either
 * alone: the query string looked supported and the tests for the surviving handler
 * still passed. Removed rather than reordered, so there is exactly one answer.
 */

/**
 * GET /api/v1/requests/pending-count
 * Staff/Admin — the badge count. Declared BEFORE `/:id` (see the header note).
 */
requestsRouter.get(
  "/pending-count",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const pendingCount = await prisma.request.count({
        where: { ...scopeToViewer(user), status: "PENDING" },
      });
      res.status(200).json({ pendingCount });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/requests/totals
 * Staff/Admin — aggregated totals by status and type for reports.
 * Returns aggregated counts by status and type, not individual requests.
 */
requestsRouter.get(
  "/totals",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const where = scopeToViewer(user);

      const [byStatus, byType, total] = await Promise.all([
        prisma.request.groupBy({
          by: ["status"],
          where,
          _count: { _all: true },
        }),
        prisma.request.groupBy({
          by: ["type"],
          where,
          _count: { _all: true },
        }),
        prisma.request.count({ where }),
      ]);

      res.status(200).json({
        byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
        byType: byType.map((row) => ({ type: row.type, count: row._count._all })),
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/requests?window=&type=&status=&mine=&limit=&offset=&fromDate=&toDate=
 * Staff/Admin — time-windowed, typed request list.
 *
 * The window parameter controls the time window:
 * - "this-week": requests created this week (Mon-Sun)
 * - "this-month": requests created this month
 * - "last-30-days": last 30 days
 * - "custom": requires fromDate and toDate query params
 * Default: "this-week"
 *
 * The totals endpoint returns aggregated counts by status and type.
 */
requestsRouter.get(
  "/",
  authenticate,
  validateQuery(listQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const query = validatedQuery<ListQuery>(req);

      const where: Prisma.RequestWhereInput = {
        ...scopeToViewer(user),
        ...(query.mine === "true" ? { requestedById: user.id } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      };

      // Time window filtering
      const now = new Date();
      let fromDate: Date | undefined;
      let toDate: Date | undefined;

      if (query.window === "custom") {
        fromDate = query.fromDate;
        toDate = query.toDate;
      } else if (query.window === "this-week") {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
        fromDate = new Date(now.setDate(diff));
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(fromDate);
        toDate.setDate(toDate.getDate() + 6);
        toDate.setHours(23, 59, 59, 999);
      } else if (query.window === "this-month") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (query.window === "last-30-days") {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        toDate = new Date(now);
      }

      // Built as its own filter and attached once: assigning into `where.createdAt`
      // twice would need a spread of a value the type does not promise is an object.
      if (fromDate || toDate) {
        const createdAtRange: Prisma.DateTimeFilter = {};
        if (fromDate) createdAtRange.gte = fromDate;
        if (toDate) createdAtRange.lte = toDate;
        where.createdAt = createdAtRange;
      }

      const [requests, total] = await Promise.all([
        prisma.request.findMany({
          where,
          select: REQUEST_LIST_SELECT,
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: query.limit,
          skip: query.offset,
        }),
        prisma.request.count({ where }),
      ]);

      res.status(200).json({ requests, total, limit: query.limit, offset: query.offset });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/requests/:id
 * Staff/Admin. A staff member reading someone else's request gets 404, not 403:
 * the scope is part of the `where`, so the response cannot confirm that an id it
 * is not allowed to see exists (D4).
 */
requestsRouter.get(
  "/:id",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const requestId = req.params.id;
      if (typeof requestId !== "string") {
        return res.status(400).json({ error: "Invalid request ID" });
      }

      const request = await prisma.request.findFirst({
        where: { id: requestId, ...scopeToViewer(user) },
        select: REQUEST_DETAIL_SELECT,
      });
      if (!request) {
        return res.status(404).json({ error: ERROR_REQUEST_NOT_FOUND });
      }

      res.status(200).json({ request: withRowItemNames(request) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Shared body of `POST /:id/approve` and `POST /:id/reject`. The whole decision
 * is one interactive transaction (services/requestWorkflow.ts documents the step
 * order); the email side-channel runs after it commits.
 *
 * `requireCapability("REQUEST_DECIDE")` has already checked the JWT's role, and
 * `applyDecision` re-reads the reviewer's row and checks it again — a token
 * issued before a demotion still claims ADMIN, so the database has the last word.
 */
async function decide(
  req: AuthenticatedRequest,
  res: Response,
  decision: DecisionValue,
  rejectionReason?: string,
): Promise<void> {
  const user = requireUser(req);
  const requestId = req.params.id;
  if (typeof requestId !== "string") {
    res.status(400).json({ error: "Invalid request ID" });
    return;
  }

  // One instant for Request.decidedAt, Item.disposedAt and every
  // ItemEditLog.editedAt this decision writes — created before the transaction
  // opens, never left to @default(now()).
  const decidedAt = new Date();

  const result = await prisma.$transaction(
    (tx) =>
      applyDecision(tx, {
        requestId,
        reviewerId: user.id,
        decision,
        decidedAt,
        ...(rejectionReason ? { rejectionReason } : {}),
      }),
    TRANSACTION_OPTIONS,
  );

  const emailStatus = await emailEveryone([result.requester], result.notificationMessage);

  res.status(200).json({
    request: {
      id: result.requestId,
      type: result.type,
      status: result.status,
      decidedAt: result.decidedAt,
      item: result.item,
      requestedBy: result.requester,
      reviewedBy: result.reviewer,
      ...(rejectionReason ? { rejectionReason } : {}),
    },
    itemChanges: result.itemChanges,
    cascadedItemIds: result.cascadedItemIds,
    editLogRowCount: result.editLogRowCount,
    notification: parseNotificationMessage(result.notificationMessage),
    emailStatus,
  });
}

/**
 * POST /api/v1/requests/:id/approve
 * Admin only — applies the change, cascades to accessories, writes the audit
 * trail and notifies the requester (SRS F6.2, F6.3, F7.2, F8.2).
 */
requestsRouter.post(
  "/:id/approve",
  authenticate,
  requireCapability("REQUEST_DECIDE"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await decide(req, res, "APPROVED");
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/reject
 * Admin only. Writes nothing to the item and no edit-log rows — the request row
 * and one notification, that is all (asserted in routes/requests.test.ts).
 */
requestsRouter.post(
  "/:id/reject",
  authenticate,
  requireCapability("REQUEST_DECIDE"),
  validateBody(rejectSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = validatedBody<RejectBody>(req);
      await decide(req, res, "REJECTED", body.rejectionReason);
    } catch (err) {
      next(err);
    }
  },
);

const returnLoanSchema = z.object({
  condition: z.string().trim().min(1, "Condition is required"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const withdrawSchema = z.object({
  reason: z.string().optional(),
});

/**
 * POST /api/v1/requests/:id/withdraw
 * Requester only, while status is PENDING, PENDING_STAGE1, or PENDING_STAGE2.
 * Workflow-completeness-spec.md §1.3
 */
requestsRouter.post(
  "/:id/withdraw",
  authenticate,
  validateBody(withdrawSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = validatedBody<{ reason?: string }>(req);
      
      const request = await prisma.request.findUnique({
        where: { id },
      });

      if (!request) {
        throw httpError(404, ERROR_REQUEST_NOT_FOUND);
      }

      if (request.requestedById !== req.user!.id) {
        throw httpError(403, "Only the original requester can withdraw this request");
      }

      const allowedStatuses = ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2"];
      if (!allowedStatuses.includes(request.status)) {
        throw httpError(400, "Can only withdraw requests that have not been approved");
      }

      const updated = await prisma.request.update({
        where: { id },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
          withdrawnById: req.user!.id,
          reason: body.reason || null,
        },
      });

      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/return
 * Borrower / releasing head / property officer — mark a loan as returned.
 * Updates item status to ACTIVE, records return condition and notes.
 */
requestsRouter.post(
  "/:id/return",
  authenticate,
  validateBody(returnLoanSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      if (!id) {
        res.status(400).json({ error: "Request ID is required" });
        return;
      }
      const body = validatedBody<{ condition: string; notes?: string | null }>(req);
      const result = await returnLoan(prisma, {
        requestId: id,
        returnerId: req.user!.id,
        condition: body.condition,
        notes: body.notes ?? null,
        decidedAt: new Date(),
      });
      res.status(200).json({ requestId: result.requestId, itemId: result.itemId });
    } catch (err) {
      next(err);
    }
  },
);




