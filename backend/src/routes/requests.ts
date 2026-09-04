import {
  Router,
  type NextFunction,
  type Response,
  type Router as ExpressRouter,
} from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
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

const listQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.enum(REQUEST_TYPES).optional(),
  mine: z.enum(["true", "false"]).optional(),
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
      department: true,
      building: true,
      floor: true,
      room: true,
      parentItemId: true,
    },
  },
  reviewedBy: { select: { id: true, fullName: true, email: true } },
} as const;

/**
 * SRS 3.4 — staff see their own requests only; an admin reviews everything.
 * Applied as part of the `where` (not as a post-fetch check) so a staff lookup
 * of someone else's request is a 404, never a 403 that confirms it exists.
 */
function scopeToViewer(user: { id: string; role: "ADMIN" | "STAFF" }): { requestedById?: string } {
  return user.role === "ADMIN" ? {} : { requestedById: user.id };
}

/** Every handler below has already run `authenticate`, so this is a wiring guard. */
function requireUser(req: AuthenticatedRequest): { id: string; role: "ADMIN" | "STAFF" } {
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
  requireRole(["ADMIN", "STAFF"]),
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
        request: outcome.created,
        notifiedReviewerCount: outcome.recipients.length,
        emailStatus,
      });

    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/requests?status=&type=&mine=&limit=&offset=
 * Staff/Admin — the review queue for an admin, "my requests" for everyone else.
 */
requestsRouter.get(
  "/",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  validateQuery(listQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const query = validatedQuery<ListQuery>(req);

      const where = {
        ...scopeToViewer(user),
        // An admin can ask for just their own; nobody can widen past the scope,
        // because `mine=true` only ever narrows.
        ...(query.mine === "true" ? { requestedById: user.id } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      };

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
 * GET /api/v1/requests/pending-count
 * Staff/Admin — the badge count. Declared BEFORE `/:id` (see the header note).
 */
requestsRouter.get(
  "/pending-count",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
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
 * GET /api/v1/requests/:id
 * Staff/Admin. A staff member reading someone else's request gets 404, not 403:
 * the scope is part of the `where`, so the response cannot confirm that an id it
 * is not allowed to see exists (D4).
 */
requestsRouter.get(
  "/:id",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
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

      res.status(200).json({ request });
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
 * `requireRole(["ADMIN"])` has already checked the JWT's role, and
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
  requireRole(["ADMIN"]),
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
  requireRole(["ADMIN"]),
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




