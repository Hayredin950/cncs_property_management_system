import { Router, type NextFunction, type Response, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateQuery, validatedQuery } from "../middleware/validate.js";

export const systemConfigRouter: ExpressRouter = Router();

/**
 * GET /system/status — build and runtime facts (SYSTEM_ADMIN only).
 *
 * Note the mount: this router is mounted at `/system` (`app.ts:116`), not
 * `/admin/system`. The widget used to call the latter and got a 404 that the
 * hook quietly turned into "Unknown" for all three fields — the silent-zero
 * failure mode §13 forbids. `frontend/src/api/system.ts` now calls this path
 * through `apiClient`.
 */
systemConfigRouter.get(
  "/status",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = {
        environment: process.env.NODE_ENV ?? "development",
        version: process.env.APP_VERSION ?? "unknown",
        uptime: Math.floor(process.uptime()),
        lastDeploy: process.env.DEPLOY_TIME ?? "unknown",
        database: "connected",
      };

      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /system/events?limit= — recent account-level events (SYSTEM_ADMIN only).
 *
 * §10.4: this endpoint must never carry asset or audit activity. It used to
 * answer with `auditSession` rows relabelled `type: "AUDIT"` — each session's
 * scope, its operator and whether it completed — which handed the one role the
 * rules say sees zero asset data a running history of the college's audits.
 *
 * The source is now `AdminActionLog` (schema.prisma:243), the append-only
 * account log §0.4 requires, so every row is account-level *by construction* and
 * there is no asset-shaped filter left to get wrong. It is also the honest
 * answer to "what has this role been doing": nothing writes it yet — the account
 * flows (T5–T7) are what will — and an empty list is the true state until then,
 * not a placeholder.
 *
 * The response is a bare array, not `{ data }`: the only caller is
 * `frontend/src/api/system.ts`, and an envelope that one route in the codebase
 * uses is what made the consuming widget treat the object as a list.
 */

/**
 * `catch(10)` before `.default(10)`, and the clamp below, keep the behaviour the
 * route already had: `?limit=abc` and `?limit=999` mean "what you asked for,
 * within reason" rather than a 400 on a widget refresh. The caller is a
 * dashboard tile, and refusing to draw it over a stray query string would be a
 * worse failure than showing ten rows.
 */
const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().catch(10).default(10),
});
type EventsQuery = z.infer<typeof eventsQuerySchema>;

/**
 * `action` is stored as a slug (`ACCOUNT_APPROVED`). Sent as `type` unchanged —
 * greppable and stable — with a sentence carrying the person it happened to, so
 * a reader gets "who" without the widget having to join two fields itself.
 */
function describeAction(action: string, targetName: string | null): string {
  const readable = action.replaceAll("_", " ").toLowerCase();
  return targetName ? `${readable} — ${targetName}` : readable;
}

systemConfigRouter.get(
  "/events",
  authenticate,
  requireCapability("SYSTEM_CONFIG"),
  validateQuery(eventsQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = validatedQuery<EventsQuery>(req);
      const limit = Math.min(50, Math.max(1, query.limit));

      const events = await prisma.adminActionLog.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          createdAt: true,
          targetUser: { select: { fullName: true } },
        },
      });

      res.status(200).json(
        events.map((event) => ({
          id: event.id,
          type: event.action,
          message: describeAction(event.action, event.targetUser?.fullName ?? null),
          timestamp: event.createdAt,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);
