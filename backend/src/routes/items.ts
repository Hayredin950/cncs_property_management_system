import crypto from "crypto";
import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { httpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  requireCapability,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody, validatedBody } from "../middleware/validate.js";
import {
  ALLOWED_PHOTO_TYPES,
  PHOTO_FIELD_NAME,
  acceptPhotoUpload,
} from "../middleware/photoUpload.js";
import { buildEditLogRows, writeEditLogRows } from "../services/itemEditLog.js";
import {
  buildCustodyEvent,
  COLLEGE_HOLDER,
  recordCustodyEvent,
  staffHolder,
  type HolderRef,
} from "../services/holder.js";
import {
  PhotoUploadError,
  readPhotoUploadConfig,
  uploadItemPhoto,
} from "../services/photoStorage.js";
import { activeItemsWhere, DISPOSED_PUBLIC_MESSAGE } from "../services/itemVisibility.js";
import { itemInScope, itemListScope } from "../services/itemScope.js";
import { ITEM_LOCATION_SELECT, withLocationNames } from "../utils/itemLocation.js";
import { isAuthenticatedViewer, sanitizeItem } from "../utils/filterItemFields.js";
import { capabilitiesFor } from "../services/permissions.js";
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
  orgUnitId: z.string().trim().min(1, "OrgUnit is required"),
  buildingId: z.string().trim().min(1, "Building is required"),
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

const updateItemSchema = createItemSchema.partial().extend({
  version: z.number().int().nonnegative("Version must be a non-negative integer").optional().default(0),
});

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

/**
 * The columns that say *where an item is* and *whose it is*, and whose only write
 * path for an existing item is an approved TRANSFER request (SRS F6, F7).
 *
 * All four are part of a transfer's payload — `Request.newLocationBuilding`,
 * `newLocationFloor`, `newLocationRoom`, `newOwnerId`, applied by
 * `buildTransferChanges` — which made this endpoint a second, unapproved writer of
 * exactly the fields the approval flow exists to govern. A Staff member could move
 * an item to another room and save it immediately; the edit log recorded the
 * change, but nobody approved it, so the register's answer to "where is it?" was
 * only as trustworthy as the last person to type in the form. Logging a bypass
 * does not turn it into an approval.
 *
 * `POST /items` still accepts all four — registering an item is not a transfer,
 * and there is no prior location for an approval to guard. The rule begins with
 * the row's existence.
 *
 * Enforced by comparing against the stored row, not by rejecting on presence: the
 * edit form resubmits the values it loaded, so only an actual change is a move.
 * Rejected loudly for the same reason `parentItemId` is — a caller who sends one
 * should learn where the field really lives, not watch it disappear.
 */
const TRANSFER_ONLY_FIELDS = ["buildingId", "floor", "room", "ownerId"] as const;

/**
 * Spec 4.7.1's identity and financial fields. A custodian (STAFF or a head) may
 * change condition and notes and nothing else — compared against the stored row,
 * so the edit form resubmitting an untouched field is not treated as a change.
 */
const IDENTITY_FIELDS = [
  "name",
  "categoryId",
  "brand",
  "model",
  "serialNumber",
  "purchaseCost",
  "currentValue",
  "photoUrl",
  "orgUnitId",
  "orgUnitId",
] as const;

const TRANSFER_ONLY_ERROR =
  "An item's location and custodian can only change through an approved transfer — file a TRANSFER request instead";

/** The transfer-only columns this body actually changes; empty means none. */
function attemptedTransferFields(
  updates: Partial<Record<string, unknown>>,
  existing: { buildingId: string | null; floor: string; room: string; ownerId: string },
): string[] {
  return TRANSFER_ONLY_FIELDS.filter(
    (field) => field in updates && updates[field] !== existing[field],
  );
}

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

/**
 * The order the register is listed in.
 *
 * "Newest first" is the default because that is the order a working register
 * wants (what arrived last). The alternatives are the ones people actually ask
 * for: by name, and the oldest first when someone is looking for something
 * that has been here a long time.
 */
function itemOrderBy(
  sort: unknown,
  order: unknown,
): Prisma.ItemOrderByWithRelationInput[] {
  const direction = order === "asc" ? "asc" : "desc";
  switch (sort) {
    case "name":
      return [{ name: direction }, { tagId: "asc" }];
    case "cost":
      return [{ purchaseCost: direction }, { tagId: "asc" }];
    case "status":
      return [{ status: direction }, { name: "asc" }];
    case "oldest":
      return [{ registeredAt: "asc" }, { tagId: "asc" }];
    default:
      return [{ registeredAt: direction }, { tagId: "asc" }];
  }
}

itemsRouter.get(
  "/",
  /**
   * `authenticate`, not `optionalAuthenticate`. The optional variant failed open:
   * a missing *or expired* token continued as a guest, and this handler answered a
   * guest with the whole register — every tag id, room and condition, no token
   * needed. Requiring authentication is what makes the scope filter below mean
   * something, and it fails closed on a stale token instead of degrading to
   * "everyone".
   */
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;

      const { search, categoryId, orgUnitId, mine, scope, holder, building } = req.query;

      const filters: Prisma.ItemWhereInput = {};
      const conditions: Prisma.ItemWhereInput[] = [];

      if (typeof search === "string" && search.trim().length > 0) {
        filters.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { tagId: { contains: search, mode: "insensitive" } },
        ];
      }

      if (typeof categoryId === "string") {
        filters.categoryId = categoryId;
      }

      if (typeof orgUnitId === "string") {
        filters.orgUnitId = orgUnitId;
      }

      /**
       * `?building=` — the items in one building.
       *
       * It matches the building's **name**, like the department filter matches
       * the unit's name, because the list of buildings is a Property Officer's
       * to manage (`BUILDING_MANAGE`) and the register is everybody's to read:
       * asking "what is in the Science Complex?" must not need an office's
       * permission to see the name of a building.
       */
      if (typeof building === "string" && building.length > 0) {
        filters.buildingRef = { is: { name: { equals: building, mode: "insensitive" } } };
      }

      /**
       * `mine=true` — the "My Items" view.
       *
       * A **narrowing**, never a permission. It is pushed as an `AND` term on top
       * of the role scope below, so it can only ever shrink what the caller may
       * already see; it cannot grant a row the scope withholds.
       *
       * It used to be assigned to `filters.OR`, which had two defects. It wiped
       * out the search `OR` above, so a search typed inside "My Items" was
       * silently ignored and the whole list came back — a wrong-result bug users
       * hit by doing the obvious thing. And it was the *only* filter for a Staff
       * caller, so "mine" meant "no scope clause", which is the wrong shape for a
       * visibility rule even when the result coincides. Composing fixes both.
       *
       * Only Staff and Department Head have a personal "mine": for them the
       * personally-held rows are the entire point of the view (a head's personal
       * items, not their whole department's). Other roles gain nothing — an
       * officer's general scope already includes their own, and the
       * SYSTEM_ADMIN's scope is empty by construction.
       */
      if (
        mine === "true" &&
        req.user &&
        (req.user.role === "STAFF" || req.user.role === "DEPARTMENT_HEAD")
      ) {
        conditions.push({
          OR: [
            { holderType: "STAFF", holderId: req.user.id },
            { ownerId: req.user.id },
          ],
        });
      }

      /**
       * Scan/listing visibility (spec 2.2 and Yanet's 11 Oct scan rule): a STAFF
       * member's world is the items they hold, a DEPARTMENT_HEAD's is their
       * orgUnitId, and property officers and auditors see the college. A
       * SYSTEM_ADMIN is an account role and sees no asset data at all, so its
       * scope is empty by construction rather than by forgetting a clause.
       *
       * Applied as an `AND` term so it composes with the search `OR` above rather
       * than replacing it.
       *
       * Scope parameter overrides (for Department Heads and Property Officers):
       * - "mine": items the user personally holds
       * - "department": items in the user's department (DEPARTMENT_HEAD only)
       * - "other": items in other departments (DEPARTMENT_HEAD only)
       * - "all": all campus items (PROPERTY_OFFICER/AUDITOR only)
       * If not provided, falls back to role-based default scope.
       */
      let roleScope: Prisma.ItemWhereInput | undefined;
      const scopeParam = typeof scope === "string" ? scope : undefined;

      if (scopeParam) {
        // Explicit scope parameter provided - validate and apply
        if (req.user?.role === "DEPARTMENT_HEAD") {
          switch (scopeParam) {
            case "mine":
              roleScope = { OR: [{ ownerId: req.user!.id }, { holderType: "STAFF", holderId: req.user!.id }] };
              break;
            case "department":
              if (req.user.orgUnitId) {
                roleScope = {
                  OR: [
                    { orgUnitId: req.user.orgUnitId },
                    { holderType: "DEPARTMENT", holderId: req.user.orgUnitId },
                    { ownerId: req.user!.id },
                  ],
                };
              } else {
                roleScope = { ownerId: req.user!.id };
              }
              break;
            case "other":
              if (req.user.orgUnitId) {
                roleScope = {
                  NOT: {
                    OR: [
                      { orgUnitId: req.user.orgUnitId },
                      { holderType: "DEPARTMENT", holderId: req.user.orgUnitId },
                    ],
                  },
                };
              }
              break;
            case "all":
              roleScope = undefined; // No restriction - see all
              break;
            default:
              // Invalid scope, fall back to role-based default
              roleScope = itemListScope(req.user);
          }
        } else if (req.user?.role === "PROPERTY_OFFICER" || req.user?.role === "AUDITOR") {
          // Property Officers and Auditors can use "all" scope explicitly
          if (scopeParam === "all") {
            roleScope = undefined;
          } else {
            roleScope = itemListScope(req.user);
          }
        } else if (req.user?.role === "STAFF") {
          // STAFF can use "all", "mine", "department" scopes
          switch (scopeParam) {
            case "mine":
              roleScope = { OR: [{ ownerId: req.user!.id }, { holderType: "STAFF", holderId: req.user!.id }] };
              break;
            case "department":
              if (req.user.orgUnitId) {
                roleScope = {
                  OR: [
                    { orgUnitId: req.user.orgUnitId },
                    { holderType: "DEPARTMENT", holderId: req.user.orgUnitId },
                    { ownerId: req.user!.id },
                  ],
                };
              } else {
                roleScope = { ownerId: req.user!.id };
              }
              break;
            case "all":
              roleScope = undefined; // No restriction - see all
              break;
            case "other":
              // The departments that are not the viewer's own — the answer to
              // "what does the rest of the college have?" when you are looking
              // for something to request.
              if (req.user.orgUnitId) {
                roleScope = {
                  AND: [
                    { NOT: { orgUnitId: req.user.orgUnitId } },
                    { NOT: { holderType: "DEPARTMENT", holderId: req.user.orgUnitId } },
                    { NOT: { ownerId: req.user!.id } },
                    { NOT: { holderType: "STAFF", holderId: req.user!.id } },
                  ],
                };
              } else {
                // No unit of their own: everything that is not theirs.
                roleScope = {
                  AND: [
                    { NOT: { ownerId: req.user!.id } },
                    { NOT: { holderType: "STAFF", holderId: req.user!.id } },
                  ],
                };
              }
              break;
            default:
              // Invalid scope, fall back to role-based default
              roleScope = itemListScope(req.user);
          }
        } else {
          // Other roles ignore scope parameter, use role-based default
          roleScope = itemListScope(req.user);
        }
      } else {
        // No explicit scope parameter - use role-based default
        roleScope = itemListScope(req.user);
      }

      if (roleScope) {
        conditions.push(roleScope);
      }

      /**
       * `?holder=<userId>` — the items one person holds.
       *
       * It exists because the roster says "5 items" and the next question is
       * always "which five?". It is **narrowing**, never widening: it is ANDed
       * with the scope, so it can only ever return a subset of what the caller
       * could already list.
       *
       * And it is only honoured for the roles that may look at other people's
       * holdings at all — a property officer, a department head, and the
       * system administrator. For anyone else it is ignored, because a staff
       * member's list of another person's items is not theirs to read.
       */
      const holderId = typeof holder === "string" && holder.length > 0 ? holder : null;
      if (holderId) {
        const mayListOtherHoldings =
          req.user?.role === "PROPERTY_OFFICER" ||
          req.user?.role === "DEPARTMENT_HEAD" ||
          req.user?.role === "SYSTEM_ADMIN";
        if (mayListOtherHoldings) {
          conditions.push({ OR: [{ holderType: "STAFF", holderId }, { ownerId: holderId }] });
        }
      }

      if (conditions.length > 0) {
        filters.AND = conditions;
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
          orderBy: itemOrderBy(req.query.sort, req.query.order),
          include: {
            category: true,
            owner: {
              select: { id: true, fullName: true, email: true },
            },
            // The department and the building of each item. Without them the
            // card could not say where the thing is: the list showed a name
            // and a tag id, and the "department" the card renders was
            // undefined — so the register looked like a list of things with
            // no idea where any of them were.
            ...ITEM_LOCATION_SELECT,
          },
        }),
        prisma.item.count({ where }),
      ]);

      const sanitizedItems = items.map((item) =>
        sanitizeItem(
          withLocationNames(item as unknown as Parameters<typeof withLocationNames>[0]) as unknown as Record<
            string,
            unknown
          >,
          req.user,
        ),
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

/**
 * `GET /items/recent?limit=5` — the last few registered items, for the Property
 * Officer's dashboard tile (`ITEM_READ_ALL`, so Officer/Admin only).
 *
 * **Declared above `GET /:tagId` on purpose, and it has to stay there.** Express
 * matches in registration order, so a literal path sitting below a single-segment
 * param route is unreachable: `/items/recent` matched `/:tagId` with
 * `tagId === "recent"`, the lookup below found no such tag, and the tile was told
 * the item did not exist — which it renders as "no items registered yet"
 * (14 Oct audit). `items.test.ts` pins the order through the real app, so moving
 * this back down fails the suite rather than quietly emptying a dashboard.
 */
itemsRouter.get(
  "/recent",
  authenticate,
  requireCapability("ITEM_READ_ALL"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 5));

      // Scoped like every other item read. The tile asks "what was registered
      // recently?" — for a Property Officer that is the college, and for a
      // Department Head it is their own department. It used to answer for the
      // whole college to anyone holding `ITEM_READ_ALL`, which handed a head
      // the names and tag ids of items registered in other departments — the
      // one item read in the app that did not go through the scope rules.
      const scope = itemListScope(req.user);
      const items = await prisma.item.findMany({
        where: { status: "ACTIVE", ...(scope ?? {}) },
        take: limit,
        orderBy: { registeredAt: "desc" },
        select: {
          id: true,
          name: true,
          tagId: true,
          registeredAt: true,
        },
      });

      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * `GET /items/held-by-me?summary=true` — how many active items this account holds
 * (as `holderId` or as `ownerId`), for its dashboard tile. Any signed-in role: the
 * question it answers is "mine", which needs no capability.
 *
 * Declared above `GET /:tagId` for the same reason as `/recent` — see the comment
 * there. Below it, `/:tagId` matched with `tagId === "held-by-me"` and answered
 * 404, so the tile counted zero whatever the register held.
 */
itemsRouter.get(
  "/held-by-me",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const summary = req.query.summary === "true";

      // Build where clause based on role
      // For Department Heads, include department-held items
      // For Staff, include staff-held items
      // Both roles also check ownerId
      const orConditions: Prisma.ItemWhereInput[] = [
        { ownerId: req.user.id },
      ];

      if (req.user.role === "STAFF") {
        orConditions.push({ holderType: "STAFF", holderId: req.user.id });
      } else if (req.user.role === "DEPARTMENT_HEAD" && req.user.orgUnitId) {
        orConditions.push({ holderType: "DEPARTMENT", holderId: req.user.orgUnitId });
      }

      const where: Prisma.ItemWhereInput = {
        OR: orConditions,
        status: "ACTIVE",
      };

      if (summary) {
        const count = await prisma.item.count({ where });
        res.status(200).json({ count });
      } else {
        const items = await prisma.item.findMany({
          where,
          select: {
            id: true,
            name: true,
            tagId: true,
            status: true,
            category: { select: { name: true } },
          },
          orderBy: { registeredAt: "desc" },
        });
        res.status(200).json(items);
      }
    } catch (err) {
      next(err);
    }
  }
);

/** Matches a v4-ish uuid. Used to tell `GET /items/:id` from `GET /items/:tagId`. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /items/:tagId` — the QR destination — **and** `GET /items/:id`.
 *
 * Both are single-segment paths, so they would be the same Express route if
 * declared separately and order alone would decide the winner. Rather than add
 * a collision, the one handler accepts either key and picks by shape: a uuid is
 * an `id`, everything else is a `tagId`. That closes the "no `GET /items/:id`"
 * gap (the staff page had to carry `?tag=` around) without a second route.
 *
 * Authentication is required: anonymous visitors must sign in first. The QR
 * code's `from` parameter carries the original tag/id so the post-login redirect
 * lands back on the item (spec Tier 1 #3: public item routes removed).
 */
itemsRouter.get(
  "/:tagId",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tagId = Array.isArray(req.params.tagId) ? req.params.tagId[0] : req.params.tagId;
      if (!tagId) {
        res.status(400).json({ error: "Tag ID is required" });
        return;
      }

      const item = await prisma.item.findUnique({
        where: UUID_PATTERN.test(tagId) ? { id: tagId } : { tagId },
        include: {
          category: true,
          buildingRef: true,
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
       * The scope check the listing has always had and this route did not (14 Oct
       * audit, §10.2). Without it a STAFF member's list was correctly empty while
       * `GET /items/<someone else's id>` answered 200 — the list was never the
       * boundary, the row is.
       *
       * Answered as 404, not 403: a 403 would confirm that the tag exists and turn
       * this route into an oracle for guessing tag ids (ground rule 3).
       *
       * Exception: Department Heads may view items from other departments (for
       * transfer identification per catalog spec §9.1), but the response will
       * contain only restricted fields (name, category, building, status).
       */
      // A Department Head **and** a staff member may open an item from another
      // department: the register is the college's, and "what does the rest of
      // the college have?" is the question a person asks when they need to
      // request an item. The response is field-filtered either way (the
      // restricted tier for a staff member, the operational detail for a head),
      // so opening it reveals no more than the browse list already does.
      //
      // Department-held items of **other** departments are excluded: a
      // department's own pool is not a catalogue.
      const isCrossDeptView =
        (req.user?.role === "DEPARTMENT_HEAD" || req.user?.role === "STAFF") &&
        item.orgUnitId !== req.user.orgUnitId &&
        item.holderType !== "DEPARTMENT";

      if (!itemInScope(req.user, item as unknown as Parameters<typeof itemInScope>[1]) && !isCrossDeptView) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      /**
       * SRS F7.3 — "Disposed items are not scannable/viewable by the public (tag
       * lookup for a disposed item shows 'this item is no longer in service',
       * nothing else)." Hence 410 with only that sentence: no tagId, no name, no
       * disposal reason. "Nothing else" is the operative phrase.
       *
       * ── Open question this gate now raises ────────────────────────────────
       * The gate's audience was "the public", and this route requires a token as of
       * §10.1, so `isAuthenticatedViewer` is true for every caller that reaches it
       * and the 410 is currently unreachable. It is left in place rather than
       * deleted because F7.3 is still the spec: what needs deciding is *who* should
       * be told "no longer in service" now that no anonymous viewer can reach this
       * route at all — a staff member looking up their own disposed item should get
       * the record, per F7.2. Flagged for the next phase rather than guessed at here.
       */
      if (item.status === "DISPOSED" && !isAuthenticatedViewer(req.user)) {
        res.status(410).json({ error: DISPOSED_PUBLIC_MESSAGE });
        return;
      }

      // For cross-department views by Department Heads, return only restricted fields per §9.1
      if (isCrossDeptView) {
        const restrictedItem = {
          id: item.id,
          tagId: item.tagId,
          name: item.name,
          category: item.category,
          buildingRef: item.buildingRef ? { id: item.buildingRef.id, name: item.buildingRef.name } : null,
          status: item.status,
          orgUnitId: item.orgUnitId,
        };
        res.status(200).json(restrictedItem);
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
  requireCapability("ITEM_CREATE"),
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
      // The holder pair comes from the same `ownerId` the form sent, never from a
      // second input: one custodian cannot be two different parties, and a client
      // that posted only one of them would otherwise desync the two columns.
      const custodian = staffHolder(parsed.data.ownerId);

      const newItem = await createItemWithUniqueTag({
        ...(cleaned as Omit<Prisma.ItemUncheckedCreateInput, "tagId">),
        holderType: custodian.holderType,
        holderId: custodian.holderId,
        // The first custody event, nested so it is written by the same statement
        // as the item itself: a row whose history starts nowhere is exactly the
        // gap the CustodyEvent table exists to close, and a separate insert could
        // be lost to a crash between the two.
        custodyEvents: {
          create: buildCustodyEvent({
            eventType: "CREATED",
            from: COLLEGE_HOLDER,
            to: custodian,
            actingUserId: req.user!.id,
          }),
        },
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
  requireCapability("ITEM_EDIT_IDENTITY"),
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
  requireCapability("ITEM_EDIT_CUSTODY"),
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

      const { version, ...updates } = cleanDefined(parsed.data);

      /**
       * Optimistic locking: the client must send the version it read.
       * If the version doesn't match, another edit has intervened.
       */
      if (version !== undefined && version !== existingItem.version) {
        res.status(409).json({
          error: "Item was modified by another user. Please reload and try again.",
          currentVersion: existingItem.version,
        });
        return;
      }

      /**
       * Field-level rule from spec 4.7: a custodian edits condition and notes; the
       * identity and financial fields belong to the Property Officer. Enforced
       * server-side because the client form is not a control — a staff member who
       * sends `purchaseCost` should be refused, not quietly ignored.
       */
      if (!capabilitiesFor(req.user!.role).includes("ITEM_EDIT_IDENTITY")) {
        const disallowed = IDENTITY_FIELDS.filter(
          (field) =>
            field in updates &&
            String(updates[field as keyof typeof updates]) !==
              String(existingItem[field as keyof typeof existingItem]),
        );
        if (disallowed.length > 0) {
          res.status(403).json({
            error:
              "A custodian may only edit an item's condition and notes; identity and financial fields belong to the Property Officer",
            fields: disallowed,
          });
          return;
        }
      }

      /**
       * A move or a reassignment is a TRANSFER, and the approval path is its only
       * writer — see `TRANSFER_ONLY_FIELDS`. Checked before any write, so a body
       * that mixes a legitimate edit with a location change is refused whole
       * rather than half-applied.
       */
      const transferFields = attemptedTransferFields(updates, existingItem);
      if (transferFields.length > 0) {
        res.status(400).json({ error: TRANSFER_ONLY_ERROR, fields: transferFields });
        return;
      }

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
       * common edit adds no queries.
       *
       * Re-verifying the new id here also turns a dangling reference into a 400
       * instead of a Prisma P2003 surfacing as a 500.
       *
       * `ownerId` needs no equivalent: a change to it is refused above as a
       * transfer, and the approval path builds its own labels
       * (services/requestWorkflow.ts). `categoryId` is the only foreign key this
       * endpoint may still change.
       */
      const labels: Record<string, string> = {};

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
            where: { id, status: "ACTIVE", version: existingItem.version },
            data: {
              ...updates,
              version: { increment: 1 },
            } as Prisma.ItemUncheckedUpdateInput,
          });
          if (applied.count === 0) {
            throw httpError(409, "Item is already disposed or was modified");
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

/**
 * POST /api/v1/items/:id/reverse-disposal
 * Property Officer only - reverses a disposal (workflow-completeness-spec.md §4.3).
 * Returns item to IN_STORE (ACTIVE with COLLEGE holder), does not restore previous custody.
 */
itemsRouter.post(
  "/:id/reverse-disposal",
  authenticate,
  requireCapability("DISPOSAL_REVERSE"),
  validateBody(z.object({ reason: z.string().min(3, "Reason is required").max(500) })),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }
      const body = validatedBody<{ reason: string }>(req);

      const item = await prisma.item.findUnique({
        where: { id },
      });

      if (!item) {
        throw httpError(404, "Item not found");
      }

      if (item.status !== "DISPOSED") {
        throw httpError(400, "Item is not disposed");
      }

      await prisma.$transaction(async (tx) => {
        // Reverse disposal: return to ACTIVE, COLLEGE pool
        await tx.item.update({
          where: { id },
          data: {
            status: "ACTIVE",
            holderType: "COLLEGE",
            holderId: null,
            disposalReason: null,
            disposedAt: null,
          },
        });

        // Record custody event explaining the correction
        await recordCustodyEvent(tx, {
          itemId: id,
          from: { holderType: item.holderType ?? null, holderId: item.holderId ?? null },
          to: { holderType: "COLLEGE", holderId: null },
          eventType: "REVERTED",
          actingUserId: req.user!.id,
          reason: body.reason,
        });
      });

      res.status(200).json({ message: "Disposal reversed successfully" });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/items/:id/void
 * Property Officer only - voids an item permanently.
 * Items marked VOIDED are never deleted, only hidden.
 */
itemsRouter.post(
  "/:id/void",
  authenticate,
  requireCapability("ITEM_EDIT_CUSTODY"),
  validateBody(z.object({ reason: z.string().min(1, "Reason is required") })),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }
      const body = validatedBody<{ reason: string }>(req);

      const item = await prisma.item.findUnique({
        where: { id },
      });

      if (!item) {
        throw httpError(404, "Item not found");
      }

      if (item.status === "VOIDED") {
        throw httpError(400, "Item is already voided");
      }

      await prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id },
          data: {
            status: "VOIDED",
            voidReason: body.reason,
            voidedAt: new Date(),
            voidedById: req.user!.id,
          },
        });

        // Record custody event explaining the void
        await recordCustodyEvent(tx, {
          itemId: id,
          from: { holderType: item.holderType ?? null, holderId: item.holderId ?? null },
          to: { holderType: null, holderId: null },
          eventType: "VOIDED",
          actingUserId: req.user!.id,
          reason: body.reason,
        });
      });

      res.status(200).json({ message: "Item voided successfully" });
    } catch (err) {
      next(err);
    }
  },
);

const claimSchema = z.object({
  // For orgUnitId head claiming on behalf of orgUnitId, omit or send null
  // The route determines the claimant from the authenticated user's role
});

/**
 * POST /items/:id/claim — claim a PENDING_CLAIM item.
 *
 * The authenticated user must be the current holder (STAFF) or the orgUnitId
 * head of the item's orgUnitId. On success, status becomes ACTIVE and
 * claimedAt is set. A CLAIMED custody event is recorded.
 */
itemsRouter.post(
  "/:id/claim",
  authenticate,
  requireCapability("ITEM_CLAIM"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }

      const parsed = claimSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

const item = await prisma.item.findUnique({
      where: { id },
      select: {
        status: true,
        holderType: true,
        holderId: true,
        claimDueAt: true,
        orgUnitId: true,
      },
    });

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (item.status !== "PENDING_CLAIM") {
      res.status(409).json({ error: "Item is not pending claim" });
      return;
    }

    if (item.claimDueAt && new Date(item.claimDueAt) < new Date()) {
      res.status(409).json({ error: "Claim period has expired" });
      return;
    }

    // Determine the claimant based on role
    let claimant: { holderType: "STAFF" | "DEPARTMENT"; holderId: string };
    const current: HolderRef = {
      holderType: item.holderType as "STAFF" | "DEPARTMENT" | "COLLEGE" | null,
      holderId: item.holderId,
    };

    if (req.user!.role === "STAFF") {
      if (current.holderType !== "STAFF" || current.holderId !== req.user!.id) {
        res.status(403).json({ error: "You are not the assigned holder of this item" });
        return;
      }
      claimant = { holderType: "STAFF", holderId: req.user!.id };
    } else if (req.user!.role === "DEPARTMENT_HEAD") {
      if (!req.user!.orgUnitId || item.orgUnitId !== req.user!.orgUnitId) {
        res.status(403).json({ error: "This item is not in your orgUnitId" });
        return;
      }
      if (current.holderType !== "STAFF" && current.holderType !== "DEPARTMENT") {
        res.status(409).json({ error: "Item cannot be claimed by this orgUnitId" });
        return;
      }
      claimant = { holderType: "DEPARTMENT", holderId: req.user!.orgUnitId };
    } else {
      res.status(403).json({ error: "Only the assigned holder or orgUnitId head may claim" });
      return;
    }

      const updatedItem = await prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id },
          data: {
            status: "ACTIVE",
            claimedAt: new Date(),
            claimDueAt: null,
            holderType: claimant.holderType,
            holderId: claimant.holderId,
          },
        });

        await recordCustodyEvent(tx, {
          itemId: id,
          from: current,
          to: { holderType: claimant.holderType, holderId: claimant.holderId },
          eventType: "CLAIMED",
          actingUserId: req.user!.id,
          reason:
            claimant.holderType === "DEPARTMENT"
              ? "Department head claimed on behalf of orgUnitId"
              : null,
        });

        return tx.item.findUnique({ where: { id }, include: { category: true } });
      }, { maxWait: 5000, timeout: 15000 });

      res.status(200).json(updatedItem);
    } catch (err) {
      next(err);
    }
  }
);

const refuseClaimSchema = z.object({
  reason: z.enum(["NEVER_RECEIVED", "WRONG_ITEM", "CONDITION_MISMATCH", "OTHER"]),
  otherReason: z.string().trim().min(3).max(500).optional(),
});

const claimWithCorrectionSchema = z.object({
  actualCondition: z.enum(["NEW", "GOOD", "FAIR", "DAMAGED", "BEYOND_REPAIR"]),
  note: z.string().trim().min(3).max(500),
});

/**
 * POST /items/:id/refuse-claim — refuse a PENDING_CLAIM item.
 *
 * The item reverts to the COLLEGE pool, status stays PENDING_CLAIM.
 * A CLAIM_REFUSED custody event is recorded.
 */
itemsRouter.post(
  "/:id/refuse-claim",
  authenticate,
  requireCapability("ITEM_CLAIM"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }

      const parsed = refuseClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.issues,
        });
        return;
      }

      // If OTHER is selected, otherReason is required
      if (parsed.data.reason === "OTHER" && !parsed.data.otherReason) {
        res.status(400).json({ error: "otherReason is required when reason is OTHER" });
        return;
      }

      const item = await prisma.item.findUnique({
      where: { id },
      select: {
        status: true,
        holderType: true,
        holderId: true,
        claimDueAt: true,
        orgUnitId: true,
      },
    });

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (item.status !== "PENDING_CLAIM") {
      res.status(409).json({ error: "Item is not pending claim" });
      return;
    }

    // Same authorization as claim
    const current: HolderRef = {
      holderType: item.holderType as "STAFF" | "DEPARTMENT" | "COLLEGE" | null,
      holderId: item.holderId,
    };

    if (req.user!.role === "STAFF") {
      if (current.holderType !== "STAFF" || current.holderId !== req.user!.id) {
        res.status(403).json({ error: "You are not the assigned holder of this item" });
        return;
      }
    } else if (req.user!.role === "DEPARTMENT_HEAD") {
      if (!req.user!.orgUnitId || item.orgUnitId !== req.user!.orgUnitId) {
        res.status(403).json({ error: "This item is not in your orgUnitId" });
        return;
      }
      if (current.holderType !== "STAFF" && current.holderType !== "DEPARTMENT") {
        res.status(409).json({ error: "Item cannot be refused by this orgUnitId" });
        return;
      }
    } else {
      res.status(403).json({ error: "Only the assigned holder or orgUnitId head may refuse" });
      return;
    }

      const updatedItem = await prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id },
          data: {
            holderType: "COLLEGE",
            holderId: null,
            claimDueAt: null,
          },
        });

        await recordCustodyEvent(tx, {
          itemId: id,
          from: current,
          to: COLLEGE_HOLDER,
          eventType: "CLAIM_REFUSED",
          actingUserId: req.user!.id,
          reason: parsed.data.reason === "OTHER" ? (parsed.data.otherReason ?? null) : parsed.data.reason,
        });

        // §2: Notify both department heads when a claim is refused
        if (item.orgUnitId) {
          const unit = await tx.orgUnit.findUnique({
            where: { id: item.orgUnitId },
            select: { headId: true },
          });
          if (unit?.headId) {
            await tx.notification.create({
              data: {
                userId: unit.headId,
                message: `[CLAIM_REFUSED] Item ${id} claim refused: ${parsed.data.reason === "OTHER" ? parsed.data.otherReason : parsed.data.reason}`,
              },
            });
          }
        }
        // Notify PROPERTY_OFFICER
        const propertyOfficer = await tx.user.findFirst({
          where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
          select: { id: true },
        });
        if (propertyOfficer) {
          await tx.notification.create({
            data: {
              userId: propertyOfficer.id,
              message: `[CLAIM_REFUSED] Item ${id} claim refused from ${item.orgUnitId || "unknown"}: ${parsed.data.reason === "OTHER" ? parsed.data.otherReason : parsed.data.reason}`,
            },
          });
        }

        return tx.item.findUnique({ where: { id }, include: { category: true } });
      }, { maxWait: 5000, timeout: 15000 });

      res.status(200).json(updatedItem);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /items/:id/claim-with-correction — accept claim with condition correction.
 * Workflow-completeness-spec.md §6
 *
 * The claimant accepts custody but flags the recorded condition as wrong.
 * The item's condition field updates to the corrected value, and the correction
 * is logged in the audit trail.
 */
itemsRouter.post(
  "/:id/claim-with-correction",
  authenticate,
  requireCapability("ITEM_CLAIM"),
  validateBody(claimWithCorrectionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }
      const body = validatedBody<{ actualCondition: "NEW" | "GOOD" | "FAIR" | "DAMAGED" | "BEYOND_REPAIR"; note: string }>(req);

      const item = await prisma.item.findUnique({
        where: { id },
        select: {
          status: true,
          holderType: true,
          holderId: true,
          claimDueAt: true,
          orgUnitId: true,
          condition: true,
        },
      });

      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      if (item.status !== "PENDING_CLAIM") {
        res.status(409).json({ error: "Item is not pending claim" });
        return;
      }

      // Same authorization as claim
      const current: HolderRef = {
        holderType: item.holderType as "STAFF" | "DEPARTMENT" | "COLLEGE" | null,
        holderId: item.holderId,
      };

      const claimant: HolderRef = req.user!.role === "STAFF"
        ? staffHolder(req.user!.id)
        : req.user!.role === "DEPARTMENT_HEAD" && req.user!.orgUnitId
        ? { holderType: "DEPARTMENT", holderId: req.user!.orgUnitId }
        : COLLEGE_HOLDER;

      if (req.user!.role === "STAFF") {
        if (current.holderType !== "STAFF" || current.holderId !== req.user!.id) {
          res.status(403).json({ error: "You are not the assigned holder of this item" });
          return;
        }
      } else if (req.user!.role === "DEPARTMENT_HEAD") {
        if (!req.user!.orgUnitId || item.orgUnitId !== req.user!.orgUnitId) {
          res.status(403).json({ error: "This item is not in your orgUnitId" });
          return;
        }
        if (current.holderType !== "STAFF" && current.holderType !== "DEPARTMENT") {
          res.status(409).json({ error: "Item cannot be claimed by this orgUnitId" });
          return;
        }
      } else {
        res.status(403).json({ error: "Only the assigned holder or orgUnitId head may claim" });
        return;
      }

      const updatedItem = await prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id },
          data: {
            holderType: claimant.holderType,
            holderId: claimant.holderId,
            status: "ACTIVE",
            condition: body.actualCondition,
            claimDueAt: null,
          },
        });

        await recordCustodyEvent(tx, {
          itemId: id,
          from: current,
          to: claimant,
          eventType: "CLAIMED_WITH_CORRECTION",
          actingUserId: req.user!.id,
          reason: `Condition corrected from ${item.condition} to ${body.actualCondition}. Note: ${body.note}`,
        });

        return tx.item.findUnique({ where: { id }, include: { category: true } });
      }, { maxWait: 5000, timeout: 15000 });

      res.status(200).json(updatedItem);
    } catch (err) {
      next(err);
    }
  }
);



/**
 * POST /items/:id/verify-confirm — confirm a REVERTED_UNVERIFIED item (§5.3)
 * Department head confirms item is accurately recorded
 */
itemsRouter.post(
  "/:id/verify-confirm",
  authenticate,
  requireCapability("ITEM_EDIT_CUSTODY"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }
      const item = await prisma.item.findUnique({
        where: { id },
        select: { status: true, orgUnitId: true },
      });
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      if (item.status !== "REVERTED_UNVERIFIED") {
        res.status(409).json({ error: "Item is not in REVERTED_UNVERIFIED status" });
        return;
      }
      if (item.orgUnitId !== req.user!.orgUnitId) {
        res.status(403).json({ error: "You can only verify items in your department" });
        return;
      }
      const updatedItem = await prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id },
          data: {
            status: "ACTIVE",
            lastVerifiedAt: new Date(),
            lastVerifiedById: req.user!.id,
          },
        });
        await recordCustodyEvent(tx, {
          itemId: id,
          from: { holderType: "DEPARTMENT", holderId: item.orgUnitId },
          to: { holderType: "DEPARTMENT", holderId: item.orgUnitId },
          eventType: "VERIFIED",
          actingUserId: req.user!.id,
          reason: "Handover verification confirmed",
        });
        return tx.item.findUnique({ where: { id }, include: { category: true } });
      }, { maxWait: 5000, timeout: 15000 });
      res.status(200).json(updatedItem);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /items/:id/verify-flag — flag a REVERTED_UNVERIFIED item (§5.3)
 * Department head flags item as having issues (missing, wrong condition, wrong location)
 */
itemsRouter.post(
  "/:id/verify-flag",
  authenticate,
  requireCapability("ITEM_EDIT_CUSTODY"),
  validateBody(z.object({ reason: z.string().min(5).max(500) })),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        res.status(400).json({ error: "Item ID is required" });
        return;
      }
      const body = validatedBody<{ reason: string }>(req);
      const item = await prisma.item.findUnique({
        where: { id },
        select: { status: true, orgUnitId: true },
      });
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      if (item.status !== "REVERTED_UNVERIFIED") {
        res.status(409).json({ error: "Item is not in REVERTED_UNVERIFIED status" });
        return;
      }
      if (item.orgUnitId !== req.user!.orgUnitId) {
        res.status(403).json({ error: "You can only verify items in your department" });
        return;
      }
      await prisma.$transaction(async (tx) => {
        await tx.itemEditLog.create({
          data: {
            itemId: id,
            editedById: req.user!.id,
            fieldChanged: "verification",
            oldValue: "REVERTED_UNVERIFIED",
            newValue: "FLAGGED",
            editedAt: new Date(),
          },
        });
        const propertyOfficer = await tx.user.findFirst({
          where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
          select: { id: true },
        });
        if (propertyOfficer) {
          await tx.notification.create({
            data: {
              userId: propertyOfficer.id,
              message: `[HANDOVER_FLAG] Item ${id} flagged during verification: ${body.reason}`,
            },
          });
        }
      }, { maxWait: 5000, timeout: 15000 });
      res.status(200).json({ message: "Item flagged for review" });
    } catch (err) {
      next(err);
    }
  }
);
