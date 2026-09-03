/**
 * Item visibility rules: soft-deletion by status (SRS F7.2/F7.3) and the
 * server-side field filtering from SDS 3.2.
 *
 * ── Why this is a service and not a route ─────────────────────────────────
 * Phase 1's Items track was never built: there is no `GET /items` and no
 * `GET /items/:tagId` to put these rules in. Rather than ship a throwaway public
 * route just to get a green end-to-end test — which someone would then build
 * against — Phase 2 ships the rules as unit-tested helpers plus a written
 * contract. See "Contract for the Items track" in docs/phase-2.md.
 *
 * Call sites the Items track must wire up:
 *   GET /items          → `where: activeItemsWhere({ ...filters })`
 *   GET /items/:tagId   → `publicItemView(item, req.user)`
 *   reports (Phase 3)   → `where: allItemsWhere({ ... })`
 */

/** F7.3 — what a public lookup of a disposed tag says. */
export const DISPOSED_PUBLIC_MESSAGE =
  "This item has been disposed and is no longer in active service.";

/**
 * SDS 3.2 — an allow-list, not a deny-list. A deny-list leaks every column
 * added after it was written; with an allow-list a new Item field is private
 * until someone deliberately publishes it.
 */
export const PUBLIC_ITEM_FIELDS = [
  "tagId",
  "name",
  "category",
  "department",
  "building",
  "floor",
  "room",
  "condition",
  "brand",
  "model",
  "status",
] as const;

/**
 * The fields that must never reach an unauthenticated viewer. Redundant with the
 * allow-list by construction — it exists so `itemVisibility.test.ts` can assert
 * on each one by name, and so a reviewer can see the intent without deriving it.
 */
export const RESTRICTED_ITEM_FIELDS = [
  "id",
  "categoryId",
  "ownerId",
  "owner",
  "purchaseCost",
  "currentValue",
  "serialNumber",
  "photoUrl",
  "notes",
  "disposalReason",
  "disposedAt",
  "registeredAt",
  "lastAuditedAt",
  "parentItemId",
  "accessories",
  "editLogs",
  "requests",
  "auditResults",
] as const;

/**
 * Default listing filter: active items only (F7.2 — disposal is a status change,
 * never a delete).
 *
 * `status` is pinned LAST on purpose. Spreading `extra` first means a caller who
 * passes `{ status: "DISPOSED" }` — from an unvalidated query string, say —
 * cannot widen the filter, because the pin overwrites it. That property is
 * asserted directly in itemVisibility.test.ts.
 */
export function activeItemsWhere<T extends object = Record<string, never>>(
  extra?: T,
): T & { status: "ACTIVE" } {
  return { ...(extra ?? {}), status: "ACTIVE" as const } as T & { status: "ACTIVE" };
}

/**
 * Identity function. Its entire job is to make "disposed items are included on
 * purpose here" greppable — Phase 3's disposal report needs them, and a bare
 * `where` with no status key is indistinguishable from having forgotten one.
 */
export function allItemsWhere<T extends object = Record<string, never>>(extra?: T): T {
  return (extra ?? {}) as T;
}

/** A logged-in viewer, or null/undefined for the public (guest) case. */
export type ItemViewer = { role: "ADMIN" | "STAFF" } | null | undefined;

function labelForCategory(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

/**
 * Projects an Item row down to what the given viewer may see.
 *
 * Staff and admins get the row untouched — SDS 3.2 restricts the *public* view,
 * and internal users need cost and ownership to do their jobs. Guests get the
 * allow-listed subset, and a disposed item collapses to the F7.3 message rather
 * than 404: the tag is real and scanning it should say what happened to the item,
 * not imply the record was lost.
 */
export function publicItemView(
  item: Record<string, unknown>,
  viewer: ItemViewer,
): Record<string, unknown> {
  if (viewer && (viewer.role === "ADMIN" || viewer.role === "STAFF")) {
    return item;
  }

  if (item.status === "DISPOSED") {
    return {
      tagId: item.tagId,
      name: item.name,
      status: item.status,
      message: DISPOSED_PUBLIC_MESSAGE,
    };
  }

  const view: Record<string, unknown> = {};
  for (const field of PUBLIC_ITEM_FIELDS) {
    if (field === "category") {
      const category = labelForCategory(item.category);
      if (category !== undefined) view.category = category;
      continue;
    }
    if (item[field] !== undefined) view[field] = item[field];
  }
  return view;
}
