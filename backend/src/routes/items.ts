import crypto from "crypto";
import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { httpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import {
  ALLOWED_PHOTO_TYPES,
  PHOTO_FIELD_NAME,
  acceptPhotoUpload,
} from "../middleware/photoUpload.js";
import { buildEditLogRows, writeEditLogRows } from "../services/itemEditLog.js";
import {
  PhotoUploadError,
  readPhotoUploadConfig,
  uploadItemPhoto,
} from "../services/photoStorage.js";
import { activeItemsWhere, DISPOSED_PUBLIC_MESSAGE } from "../services/itemVisibility.js";
import { isPrivilegedViewer, sanitizeItem } from "../utils/filterItemFields.js";
import { isPhotoSource } from "../utils/photoSource.js";

export const itemsRouter: Router = Router();

const ConditionEnum = z.enum(["NEW", "GOOD", "FAIR", "DAMAGED", "BEYOND_REPAIR"]);

/**
 * The multipart rules (`PHOTO_MAX_BYTES`, the MIME list, `acceptPhotoUpload`)
 * live in `middleware/photoUpload.ts` because `POST /uploads/photo` accepts the
 * same files from a different route — see the note there.
 */

const createItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  categoryId: z.string().uuid("Valid categoryId is required"),
  department: z.string().trim().min(1, "Department is required"),
  building: z.string().trim().min(1, "Building is required"),
  floor: z.string().trim().min(1, "Floor is required"),
  room: z.string().trim().min(1, "Room is required"),
  ownerId: z.string().uuid("Valid ownerId (User) is required"),
  purchaseCost: z.number().positive("Purchase cost must be a positive number"),
  currentValue: z.number().positive().optional().nullable(),
  condition: ConditionEnum,
  brand: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().optional().nullable(),
  /**
   * `isPhotoSource`, not `z.string().url()`: an absolute URL *or* a
   * site-relative path. The stricter check looked right and broke a real case —
   * the seeded demo rows carry `/photos/desk.jpg`, so editing any of them (the
   * edit form resubmits the value it loaded) failed validation with "Invalid
   * URL" and the save could never succeed. See `utils/photoSource.ts`.
   */
  photoUrl: z.string().trim().refine(isPhotoSource, {
    message: "Photo must be a full https:// URL or a path beginning with /",
  }).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const updateItemSchema = createItemSchema.partial();

/**
 * `parentItemId` is deliberately absent from both schemas above.
 *
 * The column has exactly one write path — `POST /items/:id/accessories` and
 * `DELETE /items/:id/accessories/:accessoryId` — because that path enforces the
 * three bundle rules (no self-parenting, no cycles, max depth 2; decision D6 in
 * docs/phase-2.md). Accepting it here as a plain uuid would give the same column
 * a second, unguarded writer, and the cheapest consequence is the expensive one:
 * a three-deep chain A → B → C makes the approval cascade — one
 * `updateMany({ where: { parentItemId } })`, single level by design — move B and
 * silently leave C behind, claiming a room it isn't in. That is the exact lie
 * SRS F7.2 exists to prevent.
 *
 * Rejected loudly rather than stripped silently, so a caller who sends it learns
 * where the field actually lives instead of watching it vanish.
 */
function rejectedBundleField(body: unknown): boolean {
  return typeof body === "object" && body !== null && "parentItemId" in body;
}

const BUNDLE_FIELD_ERROR =
  "parentItemId cannot be set here — use POST /items/:id/accessories to link an accessory";

function generateTagId(): string {
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CNCS-${randomHex}`;
}

/**
 * 4 random bytes is 4.3 billion tags, which sounds like plenty and isn't: by the
 * birthday bound a registry of 10,000 items has roughly a 1-in-100 chance that
 * two of them draw the same tag. `tagId` is `@unique`, so that draw is a P2002 —
 * an error the caller can do nothing about, on a value they never supplied.
 *
 * Retried rather than pre-checked with a `findUnique`: a check-then-create is
 * itself a race, and the unique index is the only authority that isn't guessing.
 * Narrowed to `tagId` so a collision on some other unique column still surfaces.
 */
const TAG_ID_ATTEMPTS = 5;

function isTagIdCollision(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  return Array.isArray(target) ? target.includes("tagId") : String(target ?? "").includes("tagId");
}

async function createItemWithUniqueTag(data: Omit<Prisma.ItemUncheckedCreateInput, "tagId">) {
  for (let attempt = 1; attempt <= TAG_ID_ATTEMPTS; attempt++) {
    try {
      return await prisma.item.create({
        data: { ...data, tagId: generateTagId() },
        include: { category: true },
      });
    } catch (err) {
      if (attempt === TAG_ID_ATTEMPTS || !isTagIdCollision(err)) throw err;
    }
  }
  /* Unreachable — the last attempt rethrows. Here so the control flow reads honestly. */
  throw httpError(500, "Could not allocate a unique tag id");
}

/**
 * Strips keys with `undefined` values so Prisma satisfies `exactOptionalPropertyTypes`
 */
function cleanDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
}

itemsRouter.get(
  "/",
  optionalAuthenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;

      const { search, categoryId, department } = req.query;

      const filters: Prisma.ItemWhereInput = {};

      if (typeof search === "string" && search.trim().length > 0) {
        filters.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { tagId: { contains: search, mode: "insensitive" } },
        ];
      }

      if (typeof categoryId === "string") {
        filters.categoryId = categoryId;
      }

      if (typeof department === "string") {
        filters.department = { contains: department, mode: "insensitive" };
      }

      /**
       * SRS F7.2 — disposal is a status change, not a delete, so the default
       * listing must exclude DISPOSED. `activeItemsWhere` spreads the caller's
       * filters first and pins `status: "ACTIVE"` last, so a query string can
       * never widen the result set; Phase 3's disposal report uses
       * `allItemsWhere()` instead, which makes "disposed included on purpose"
       * greppable.
       */
      const where = activeItemsWhere(filters);

      const [items, total] = await Promise.all([
        prisma.item.findMany({
          where,
          skip,
          take: limit,
          orderBy: { registeredAt: "desc" },
          include: {
            category: true,
            owner: {
              select: { id: true, fullName: true, email: true },
            },
          },
        }),
        prisma.item.count({ where }),
      ]);

      const sanitizedItems = items.map((item) =>
        sanitizeItem(item as unknown as Record<string, unknown>, req.user),
      );

      res.status(200).json({
        data: sanitizedItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

itemsRouter.get(
  "/:tagId",
  optionalAuthenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tagId = Array.isArray(req.params.tagId) ? req.params.tagId[0] : req.params.tagId;
      if (!tagId) {
        res.status(400).json({ error: "Tag ID is required" });
        return;
      }

      const item = await prisma.item.findUnique({
        where: { tagId },
        include: {
          category: true,
          accessories: true,
          owner: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      /**
       * SRS F7.3 — "Disposed items are not scannable/viewable by the public (tag
       * lookup for a disposed item shows 'this item is no longer in service',
       * nothing else)." Hence 410 with only that sentence: no tagId, no name, no
       * disposal reason. "Nothing else" is the operative phrase.
       *
       * Gated on the viewer, though, because F7.2 says a disposed item "remains
       * queryable in reports/history" and the SRS 3.4 visibility table gives
       * Staff/Admin every field. An admin scanning a disposed tag needs the
       * record, not an error — the restriction is on the public, not on the row.
       */
      if (item.status === "DISPOSED" && !isPrivilegedViewer(req.user)) {
        res.status(410).json({ error: DISPOSED_PUBLIC_MESSAGE });
        return;
      }

      const sanitized = sanitizeItem(item as unknown as Record<string, unknown>, req.user);
      res.status(200).json(sanitized);
    } catch (err) {
      next(err);
    }
  },
);

itemsRouter.post(
  "/",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (rejectedBundleField(req.body)) {
        res.status(400).json({ error: BUNDLE_FIELD_ERROR });
        return;
      }

      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const cleaned = cleanDefined(parsed.data);

      const newItem = await createItemWithUniqueTag({
        ...(cleaned as Omit<Prisma.ItemUncheckedCreateInput, "tagId">),
        purchaseCost: parsed.data.purchaseCost,
        currentValue: parsed.data.currentValue ?? null,
      });

      res.status(201).json(newItem);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/items/:id/photo — Staff/Admin. Uploads an item's photograph.
 *
 * `multipart/form-data` with the image in a field named `photo`. Staff/Admin
 * only, matching every other write to an item: the photo is a field of the
 * record, not a public contribution.
 */
itemsRouter.post(
  "/:id/photo",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  acceptPhotoUpload,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }

      // Configuration first: a deployment without Cloudinary keys should say so
      // before it has consumed and discarded the caller's upload.
      if (!readPhotoUploadConfig()) {
        res.status(503).json({ error: "Photo uploads are not configured on this server" });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          error: `Attach the image in a form field named \`${PHOTO_FIELD_NAME}\``,
        });
        return;
      }

      if (!ALLOWED_PHOTO_TYPES.has(req.file.mimetype)) {
        res.status(415).json({
          error: `Photo must be a JPEG, PNG, WebP or GIF image (received ${req.file.mimetype})`,
        });
        return;
      }

      const existingItem = await prisma.item.findUnique({ where: { id } });
      if (!existingItem) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      // Same rule as PUT /items/:id: disposal is terminal, so a disposed row is
      // read-only (SRS F7.2). 409 rather than 404 — the item exists.
      if (existingItem.status === "DISPOSED") {
        res.status(409).json({ error: "Item is already disposed" });
        return;
      }

      const photoUrl = await uploadItemPhoto(req.file.buffer, existingItem.tagId);

      // One transaction, so the row and its history entry cannot disagree about
      // what the photo is — the same guarantee every other item write makes.
      const updatedItem = await prisma.$transaction(async (tx) => {
        const updated = await tx.item.update({ where: { id }, data: { photoUrl } });

        const editLogRows = buildEditLogRows({
          itemId: id,
          editedById: req.user!.id,
          editedAt: new Date(),
          before: { photoUrl: existingItem.photoUrl },
          after: { photoUrl },
          labels: { photoUrl: "Photo" },
        });
        await writeEditLogRows(tx, editLogRows);

        return updated;
      });

      res.status(200).json(updatedItem);
    } catch (err) {
      // An upload failure is upstream, not a bug in the request: 502 says "the
      // thing we depend on did not answer", which is what an operator needs to
      // see to check the Cloudinary account rather than the item.
      if (err instanceof PhotoUploadError) {
        next(httpError(502, "The photo could not be uploaded"));
        return;
      }
      next(err);
    }
  },
);

itemsRouter.put(
  "/:id",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }

      if (rejectedBundleField(req.body)) {
        res.status(400).json({ error: BUNDLE_FIELD_ERROR });
        return;
      }

      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      const existingItem = await prisma.item.findUnique({
        where: { id },
        include: { category: true },
      });

      if (!existingItem) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      /**
       * SRS F7.2 — disposal is terminal, so a disposed row is read-only. Editing
       * one would let a caller quietly re-describe a record that reports and
       * history are expected to preserve as it was at disposal. 409 rather than
       * 404 because the item exists; the request conflicts with its state.
       *
       * `status`, `disposalReason` and `disposedAt` are absent from both schemas,
       * so this endpoint can never dispose or un-dispose an item either — that
       * transition belongs to the approval path alone.
       */
      if (existingItem.status === "DISPOSED") {
        res.status(409).json({ error: "Item is already disposed" });
        return;
      }

      const updates = cleanDefined(parsed.data);

      /**
       * `updateMany({ data: {} })` is not a well-formed UPDATE, and an empty diff
       * has nothing to log, so an empty body short-circuits to the current row.
       */
      if (Object.keys(updates).length === 0) {
        res.status(200).json(existingItem);
        return;
      }

      /**
       * Foreign keys are logged as "<display name> (<id>)" (decision D1), which
       * needs the names on both sides of the change — the old value's and the
       * new one's. Fetched only when the column is actually changing, so the
       * common edit (condition, notes, location) adds no queries.
       *
       * Re-verifying the new ids here also turns a dangling reference into a 400
       * instead of a Prisma P2003 surfacing as a 500.
       */
      const labels: Record<string, string> = {};

      if (typeof updates.ownerId === "string" && updates.ownerId !== existingItem.ownerId) {
        const owners = await prisma.user.findMany({
          where: { id: { in: [existingItem.ownerId, updates.ownerId] } },
          select: { id: true, fullName: true },
        });
        if (!owners.some((owner) => owner.id === updates.ownerId)) {
          res.status(400).json({ error: "ownerId does not match an existing user" });
          return;
        }
        for (const owner of owners) {
          labels[owner.id] = owner.fullName;
        }
      }

      if (
        typeof updates.categoryId === "string" &&
        updates.categoryId !== existingItem.categoryId
      ) {
        const categories = await prisma.category.findMany({
          where: { id: { in: [existingItem.categoryId, updates.categoryId] } },
          select: { id: true, name: true },
        });
        if (!categories.some((category) => category.id === updates.categoryId)) {
          res.status(400).json({ error: "categoryId does not match an existing category" });
          return;
        }
        for (const category of categories) {
          labels[category.id] = category.name;
        }
      }

      /**
       * SDS 3.2 / SRS F2.3 — "every change writes an ItemEditLog row". The diff
       * comes from `buildEditLogRows` rather than a loop here so that this route
       * and the approval cascade produce byte-identical rows for the same change:
       * one row per field, Decimals at two places, foreign keys expanded, no-ops
       * dropped, and `null` stored as SQL NULL rather than the string "null".
       * See the header of services/itemEditLog.ts.
       */
      const editLogRows = buildEditLogRows({
        itemId: id,
        editedById: req.user!.id,
        editedAt: new Date(),
        before: existingItem,
        after: updates,
        labels,
      });

      const updatedItem = await prisma.$transaction(
        async (tx) => {
          /**
           * Compare-and-swap on `status`, the same guard the approval transaction
           * uses. The check above can go stale: a DISPOSAL approval committing in
           * between would otherwise let this write land on a disposed row.
           * Throwing rolls the transaction back, so no log row survives either.
           */
          const applied = await tx.item.updateMany({
            where: { id, status: "ACTIVE" },
            data: updates as Prisma.ItemUncheckedUpdateInput,
          });
          if (applied.count === 0) {
            throw httpError(409, "Item is already disposed");
          }

          await writeEditLogRows(tx, editLogRows);

          return tx.item.findUnique({ where: { id }, include: { category: true } });
        },
        { maxWait: 5000, timeout: 15000 },
      );

      res.status(200).json(updatedItem);
    } catch (err) {
      next(err);
    }
  },
);
