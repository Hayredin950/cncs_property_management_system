import {
  Router,
  type NextFunction,
  type Response,
  type Router as ExpressRouter,
} from "express";
import { z } from "zod";
import { httpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateQuery, validatedQuery } from "../middleware/validate.js";
import { parseNotificationMessage } from "../services/notifications.js";

/**
 * In-app notification inbox (SRS F8.1, F8.2).
 *
 * `authenticate` only, no `requireRole`: a notification belongs to a person, not
 * to a role, and every query below is scoped to `req.user.id`. There is no
 * "read someone else's inbox" capability for anyone, admin included.
 */

export const notificationsRouter: ExpressRouter = Router();

const listQuerySchema = z.object({
  unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

type ListQuery = z.infer<typeof listQuerySchema>;

/** Every handler below has already run `authenticate`, so this is a wiring guard. */
function requireUser(req: AuthenticatedRequest): { id: string } {
  if (!req.user) {
    throw httpError(401, "Not authenticated");
  }
  return req.user;
}

/**
 * GET /api/v1/notifications?unread=true&limit=&offset=
 *
 * The stored `[CODE] text` form is split apart here (D3) — the API never leaks
 * the prefix, and `code` is what the frontend branches on for icon and colour.
 */
notificationsRouter.get(
  "/",
  authenticate,
  validateQuery(listQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const query = validatedQuery<ListQuery>(req);

      // `userId` is pinned last so no query parameter can ever widen the scope.
      const where = {
        ...(query.unread === "true" ? { isRead: false } : {}),
        userId: user.id,
      };

      const [rows, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          select: {
            id: true,
            message: true,
            relatedRequestId: true,
            isRead: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
        prisma.notification.count({ where: { userId: user.id, isRead: false } }),
      ]);

      const notifications = rows.map((row) => {
        const { code, message } = parseNotificationMessage(row.message);
        return {
          id: row.id,
          code,
          message,
          relatedRequestId: row.relatedRequestId,
          isRead: row.isRead,
          createdAt: row.createdAt,
        };
      });

      res.status(200).json({
        notifications,
        unreadCount,
        limit: query.limit,
        offset: query.offset,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/notifications/read-all
 *
 * Declared before `/:id/read` for the same reason `/requests/pending-count` is
 * declared before `/requests/:id`: they are different shapes, but the literal
 * path has to win the match if the router is ever given a single-segment `:id`
 * route by mistake.
 *
 * `isRead: false` in the `where` is not just an optimisation — it makes
 * `updated.count` mean "rows this call actually changed", so a caller can tell
 * "nothing was unread" from "there is nothing here", which a blind `updateMany`
 * over the whole inbox cannot.
 */
notificationsRouter.post(
  "/read-all",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);

      const updated = await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });

      res.status(200).json({ updated: updated.count });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/notifications/:id/read
 *
 * `updateMany` with `userId` in the `where`, not `update({ where: { id } })`.
 * The plain form is an IDOR: any logged-in user could mark any other user's
 * notification read by guessing an id. `count === 0` covers both "no such
 * notification" and "not yours" with the same 404, which is what stops the
 * response from confirming that an id it may not touch exists.
 */
notificationsRouter.post(
  "/:id/read",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const notificationId = req.params.id;
      if (typeof notificationId !== "string") {
        return res.status(400).json({ error: "Invalid notification ID" });
      }

      const updated = await prisma.notification.updateMany({
        where: { id: notificationId, userId: user.id },
        data: { isRead: true },
      });
      if (updated.count === 0) {
        return res.status(404).json({ error: "Notification not found" });
      }

      res.status(200).json({ id: notificationId, isRead: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/notifications/:id
 *
 * Dismissing one message is a hard delete, and that is a deliberate exception to
 * "records are never destroyed" (F7.2): a notification is not a record of the
 * item's life — it is a *copy* of an event whose original is the request, the
 * edit log row or the audit result. Deleting it loses nothing the register would
 * have kept, which is also why `ItemEditLog` needs no matching delete.
 *
 * `deleteMany` with `userId` in the `where`, never `delete({ where: { id } })`:
 * the plain form is the same IDOR `/:id/read` above avoids — any signed-in user
 * could delete any id they guessed. `count === 0` answers 404 for "not yours"
 * and "does not exist" alike, so the response never confirms an id exists.
 */
notificationsRouter.delete(
  "/:id",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const notificationId = req.params.id;
      if (typeof notificationId !== "string") {
        return res.status(400).json({ error: "Invalid notification ID" });
      }

      const deleted = await prisma.notification.deleteMany({
        where: { id: notificationId, userId: user.id },
      });
      if (deleted.count === 0) {
        return res.status(404).json({ error: "Notification not found" });
      }

      res.status(200).json({ id: notificationId, deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/notifications
 *
 * Empty the caller's inbox. `userId` is the *only* clause — no query parameter
 * reaches this `where`, so there is no shape of request that clears somebody
 * else's list. It is not an error to clear an already-empty inbox: `deleted` is
 * simply 0, which keeps the call idempotent for a caller retrying a timeout.
 */
notificationsRouter.delete(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);

      const deleted = await prisma.notification.deleteMany({ where: { userId: user.id } });

      res.status(200).json({ deleted: deleted.count });
    } catch (err) {
      next(err);
    }
  },
);
