import {
  Router,
  type NextFunction,
  type Response,
  type Router as ExpressRouter,
} from "express";
import { z } from "zod";
import { httpError } from "../lib/httpError.js";
import type { DbClient } from "../lib/dbClient.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateBody, validatedBody } from "../middleware/validate.js";
import { buildEditLogRows, writeEditLogRows, type EditLogRow } from "../services/itemEditLog.js";
import { ERROR_ITEM_DISPOSED, ERROR_ITEM_NOT_FOUND } from "../services/requestWorkflow.js";

/**
 * Item bundles: accessories that belong to a parent item (SRS F2.2).
 *
 * ── Decision D6 ──────────────────────────────────────────────────────────
 * Max bundle depth is 2 — a parent with `parentItemId === null` and its direct
 * accessories, nothing deeper. SRS F2.2 describes a flat bundle and SDS 3.2 lists
 * `accessories` as one restricted field, not a tree. The practical payoff is that
 * "direct accessories" and "all accessories" are the same set, so the disposal
 * and transfer cascade in requestWorkflow.ts stays a single `updateMany` with no
 * recursion.
 *
 * No inline item creation: a new accessory needs a Tag ID, and the tagId
 * generator is part of the Items track, which does not exist yet. Register the
 * item first, then link it by id.
 *
 * Linking during a pending request is allowed — it is bundle metadata, not state
 * the approval contends with — but blocked if either item is DISPOSED.
 */

export const accessoriesRouter: ExpressRouter = Router();

const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

/** D6. Raising this is safe: the cycle guard below already walks the chain. */
const MAX_BUNDLE_DEPTH = 2;

export const ERROR_SELF_ACCESSORY = "An item cannot be its own accessory";
export const ERROR_ACCESSORY_CYCLE = "That link would create a cycle in the bundle";
export const ERROR_BUNDLE_TOO_DEEP = `A bundle may only be ${MAX_BUNDLE_DEPTH} levels deep`;
export const ERROR_ACCESSORY_NOT_LINKED = "That accessory is not linked to this item";

/**
 * `{ accessoryItemIds: [...] }` is the real shape; `{ accessoryItemId: "..." }`
 * is accepted and normalised to it, because linking one accessory is the common
 * case and a client shouldn't have to wrap it in an array.
 */
const linkAccessoriesSchema = z
  .object({
    accessoryItemIds: z.array(z.string().trim().min(1)).min(1).max(20).optional(),
    accessoryItemId: z.string().trim().min(1).optional(),
  })
  .transform((value) => ({
    accessoryItemIds: value.accessoryItemIds ?? (value.accessoryItemId ? [value.accessoryItemId] : []),
  }))
  .refine((value) => value.accessoryItemIds.length > 0, {
    message: "accessoryItemIds must contain at least one item id",
    path: ["accessoryItemIds"],
  })
  .refine((value) => value.accessoryItemIds.length <= 20, {
    message: "accessoryItemIds must contain at most 20 item ids",
    path: ["accessoryItemIds"],
  });

type LinkAccessoriesBody = z.infer<typeof linkAccessoriesSchema>;

/**
 * Walks the parent chain upwards, starting from the caller's already-loaded
 * `parentItemId`, capped so a pre-existing cycle in the data can't spin forever.
 * Costs zero queries in the common case, where the parent is already a root.
 *
 * Today the depth rule rejects most of what this would catch, but the cycle check
 * runs BEFORE that rule so the more accurate error wins: asking to make A an
 * accessory of its own accessory B is a cycle (409), not merely a too-deep bundle.
 */
async function ancestorIdsOf(client: DbClient, firstAncestorId: string | null): Promise<string[]> {
  const ancestors: string[] = [];
  let cursor = firstAncestorId;

  for (let hop = 0; hop < MAX_BUNDLE_DEPTH + 2 && cursor; hop += 1) {
    ancestors.push(cursor);
    const row: { parentItemId: string | null } | null = await client.item.findUnique({
      where: { id: cursor },
      select: { parentItemId: true },
    });
    cursor = row?.parentItemId ?? null;
  }

  return ancestors;
}

/**
 * POST /api/v1/items/:id/accessories
 * Staff/Admin — link one or more existing items to this item as accessories.
 * Re-parenting an accessory that already belongs to another bundle is allowed and
 * is logged as a `parentItemId` change like any other edit.
 */
accessoriesRouter.post(
  "/:id/accessories",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  validateBody(linkAccessoriesSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw httpError(401, "Not authenticated");
      }
      const editedById = req.user.id;
      const parentId = req.params.id;
      if (typeof parentId !== "string") {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const body = validatedBody<LinkAccessoriesBody>(req);
      // De-duplicated so a payload listing the same id twice writes one log row.
      const accessoryIds = [...new Set(body.accessoryItemIds)];
      const editedAt = new Date();

      const outcome = await prisma.$transaction(async (tx) => {
        const parent = await tx.item.findUnique({
          where: { id: parentId },
          select: { id: true, tagId: true, name: true, status: true, parentItemId: true },
        });
        if (!parent) {
          throw httpError(404, ERROR_ITEM_NOT_FOUND);
        }
        if (parent.status === "DISPOSED") {
          throw httpError(409, ERROR_ITEM_DISPOSED);
        }
        if (accessoryIds.includes(parent.id)) {
          throw httpError(400, ERROR_SELF_ACCESSORY);
        }

        const accessories = await tx.item.findMany({
          where: { id: { in: accessoryIds } },
          select: { id: true, tagId: true, status: true, parentItemId: true },
        });
        if (accessories.length !== accessoryIds.length) {
          const found = new Set(accessories.map((accessory) => accessory.id));
          throw httpError(
            404,
            ERROR_ITEM_NOT_FOUND,
            accessoryIds.filter((id) => !found.has(id)),
          );
        }
        const disposed = accessories.filter((accessory) => accessory.status === "DISPOSED");
        if (disposed.length > 0) {
          throw httpError(
            409,
            ERROR_ITEM_DISPOSED,
            disposed.map((accessory) => accessory.tagId),
          );
        }

        // Cycle first, depth second — see ancestorIdsOf().
        const ancestors = await ancestorIdsOf(tx, parent.parentItemId);
        if (ancestors.some((ancestorId) => accessoryIds.includes(ancestorId))) {
          throw httpError(409, ERROR_ACCESSORY_CYCLE);
        }
        if (parent.parentItemId !== null) {
          throw httpError(409, ERROR_BUNDLE_TOO_DEEP);
        }
        const grandchildren = await tx.item.count({
          where: { parentItemId: { in: accessoryIds } },
        });
        if (grandchildren > 0) {
          throw httpError(409, ERROR_BUNDLE_TOO_DEEP);
        }

        const moving = accessories.filter((accessory) => accessory.parentItemId !== parent.id);
        let editLogRowCount = 0;

        if (moving.length > 0) {
          await tx.item.updateMany({
            where: { id: { in: moving.map((accessory) => accessory.id) } },
            data: { parentItemId: parent.id },
          });

          // Item foreign keys are labelled with the tagId, so a history row reads
          // "CNCS-DEMO-0001 (uuid)" — the sticker on the box, not just a uuid.
          const labels: Record<string, string> = { [parent.id]: parent.tagId };
          const previousParentIds = [
            ...new Set(
              moving
                .map((accessory) => accessory.parentItemId)
                .filter((id): id is string => typeof id === "string"),
            ),
          ];
          // Skipped entirely unless something is being re-parented, which is rare.
          if (previousParentIds.length > 0) {
            const previousParents = await tx.item.findMany({
              where: { id: { in: previousParentIds } },
              select: { id: true, tagId: true },
            });
            for (const previous of previousParents) {
              labels[previous.id] = previous.tagId;
            }
          }

          let rows: EditLogRow[] = [];
          for (const accessory of moving) {
            rows = rows.concat(
              buildEditLogRows({
                itemId: accessory.id,
                editedById,
                editedAt,
                before: { parentItemId: accessory.parentItemId },
                after: { parentItemId: parent.id },
                labels,
              }),
            );
          }
          editLogRowCount = await writeEditLogRows(tx, rows);
        }

        return {
          item: { id: parent.id, tagId: parent.tagId, name: parent.name },
          linkedItemIds: moving.map((accessory) => accessory.id),
          alreadyLinkedItemIds: accessories
            .filter((accessory) => accessory.parentItemId === parent.id)
            .map((accessory) => accessory.id),
          editLogRowCount,
        };
      }, TRANSACTION_OPTIONS);

      res.status(200).json(outcome);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/items/:id/accessories/:accessoryId
 * Staff/Admin — detach an accessory from its parent. Sets `parentItemId = null`
 * and logs it; the accessory itself is untouched otherwise.
 *
 * Allowed even when either item is DISPOSED, unlike linking: unlinking is how a
 * mistaken bundle gets corrected, and refusing it would leave bad data frozen.
 */
accessoriesRouter.delete(
  "/:id/accessories/:accessoryId",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw httpError(401, "Not authenticated");
      }
      const editedById = req.user.id;
      const parentId = req.params.id;
      const accessoryId = req.params.accessoryId;
      if (typeof parentId !== "string" || typeof accessoryId !== "string") {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const editedAt = new Date();

      const outcome = await prisma.$transaction(async (tx) => {
        const parent = await tx.item.findUnique({
          where: { id: parentId },
          select: { id: true, tagId: true, name: true },
        });
        if (!parent) {
          throw httpError(404, ERROR_ITEM_NOT_FOUND);
        }

        // Scoped by parentItemId, so unlinking an accessory that belongs to a
        // different bundle is a 404 rather than a silent no-op.
        const unlinked = await tx.item.updateMany({
          where: { id: accessoryId, parentItemId: parent.id },
          data: { parentItemId: null },
        });
        if (unlinked.count === 0) {
          throw httpError(404, ERROR_ACCESSORY_NOT_LINKED);
        }

        const editLogRowCount = await writeEditLogRows(
          tx,
          buildEditLogRows({
            itemId: accessoryId,
            editedById,
            editedAt,
            before: { parentItemId: parent.id },
            after: { parentItemId: null },
            labels: { [parent.id]: parent.tagId },
          }),
        );

        return {
          item: { id: parent.id, tagId: parent.tagId, name: parent.name },
          unlinkedItemId: accessoryId,
          editLogRowCount,
        };
      }, TRANSACTION_OPTIONS);

      res.status(200).json(outcome);
    } catch (err) {
      next(err);
    }
  },
);


