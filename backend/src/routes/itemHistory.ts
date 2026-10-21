import {
  Router,
  type NextFunction,
  type Response,
  type Router as ExpressRouter,
} from "express";
import { z } from "zod";
import { httpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { hasCapability } from "../services/permissions.js";
import { authenticate, requireCapability, type AuthenticatedRequest, type UserRole } from "../middleware/auth.js";
import { validateQuery, validatedQuery } from "../middleware/validate.js";
import { allItemsWhere } from "../services/itemVisibility.js";
import { ERROR_ITEM_NOT_FOUND } from "../services/requestWorkflow.js";
import { itemInScope } from "../services/itemScope.js";

/**
 * Item edit history (SRS F2.3, F6.3).
 *
 * Staff/Admin only. SRS 3.4 gives the item's owner no special access here: the
 * history is an audit trail, and "who changed the cost, when" is management
 * information rather than something an owner needs about their own desk.
 *
 * Disposed items are included on purpose — `allItemsWhere()` is what makes that
 * deliberate rather than an omitted filter. F7.2 keeps disposed rows in the
 * table precisely so their history stays readable after disposal.
 *
 * Rows written by one approval decision share an exact `editedAt` (equal to that
 * request's `decidedAt`). That timestamp is the correlation key — ItemEditLog has
 * no `requestId` column and Phase 2 adds no migration — so grouping the response
 * by `editedAt` reconstructs one decision, cascaded accessories included.
 */

export const itemHistoryRouter: ExpressRouter = Router();

const historyQuerySchema = z.object({
  field: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type HistoryQuery = z.infer<typeof historyQuerySchema>;

/**
 * GET /api/v1/items/:id/history?field=&limit=&offset=
 */
itemHistoryRouter.get(
  "/:id/history",
  authenticate,
  // The history of an item belongs to whoever may see the item. It used to
  // require ITEM_READ_ALL — a college-wide capability — so the person who
  // *holds* the item was told "Insufficient permissions" about their own
  // laptop's history, at the bottom of their own item's page. The scope check
  // below decides it, per item.
  validateQuery(historyQuerySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw httpError(401, "Not authenticated");
      }
      const query = validatedQuery<HistoryQuery>(req);
      const itemId = req.params.id;
      if (typeof itemId !== "string") {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const item = await prisma.item.findFirst({
        where: allItemsWhere({ id: itemId }),
        select: { id: true, tagId: true, name: true, status: true, orgUnitId: true, holderType: true, holderId: true, ownerId: true },
      });
      if (!item) {
        return res.status(404).json({ error: ERROR_ITEM_NOT_FOUND });
      }

      // Scope check: whoever may see the item may see its history.
      //
      // The holder of an item always may — it is *their* laptop and *their*
      // record of it. A Department Head may see their own department's items,
      // the items they personally hold, and the cross-department items they
      // found through the catalogue; they may NOT see items held by another
      // department. The college-wide readers (a Property Officer, an Auditor)
      // see everything.
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const isOwnItem =
        item.ownerId === user.id || (item.holderType === "STAFF" && item.holderId === user.id);
      const canViewEverywhere = hasCapability(user.role, "ITEM_READ_ALL");

      if (!canViewEverywhere) {
        // A **staff** member reads the history of the items they hold. Their
        // own laptop's record is theirs; a colleague's is not, and the
        // department's holdings are the head's business, not every member's.
        if (user.role === "STAFF") {
          if (!isOwnItem) {
            return res.status(404).json({ error: ERROR_ITEM_NOT_FOUND });
          }
        } else {
          const isInDept = Boolean(user.orgUnitId) && item.orgUnitId === user.orgUnitId;
          const isDeptHeld = item.holderType === "DEPARTMENT" && item.holderId === user.orgUnitId;
          const isCrossDept =
            Boolean(user.orgUnitId) &&
            item.orgUnitId !== user.orgUnitId &&
            item.holderType !== "DEPARTMENT";

          const canView = isOwnItem || isInDept || isDeptHeld || isCrossDept;
          if (!canView) {
            // The same answer as "it does not exist" — the history of an item
            // you may not see should not be discoverable.
            return res.status(404).json({ error: ERROR_ITEM_NOT_FOUND });
          }
        }
      }

      const where = {
        itemId: item.id,
        ...(query.field ? { fieldChanged: query.field } : {}),
      };

      const [entries, total] = await Promise.all([
        prisma.itemEditLog.findMany({
          where,
          select: {
            id: true,
            fieldChanged: true,
            oldValue: true,
            newValue: true,
            editedAt: true,
            editedBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ editedAt: "desc" }, { fieldChanged: "asc" }],
          take: query.limit,
          skip: query.offset,
        }),
        prisma.itemEditLog.count({ where }),
      ]);

      res.status(200).json({
        item,
        entries,
        total,
        limit: query.limit,
        offset: query.offset,
      });
    } catch (err) {
      next(err);
    }
  },
);
