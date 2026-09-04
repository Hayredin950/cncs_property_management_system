/**
 * SDS 3.2 field filtering for item responses.
 *
 * The SDS names the mechanism explicitly: "check if the requester is logged in
 * AND their `id` matches the item's `ownerId` (or they're Staff/Admin). If not,
 * **strip** ... from the response object before sending it." So this is a
 * deny-list plus an owner branch, by prescription — not by shortcut.
 *
 * A deny-list fails open: a column added to `Item` later is public until
 * someone remembers to list it here. That is the one weakness of the shape the
 * SDS asked for, and the mitigation is to keep this set wider than SRS 3.4's
 * table and to re-read it whenever the schema grows.
 */

/** Structurally identical to `AuthenticatedRequest["user"]` — kept local so utils don't import middleware. */
export interface RequestingUser {
  id: string;
  role: "ADMIN" | "STAFF";
}

const RESTRICTED_FIELDS = new Set([
  // SRS 3.4, "not visible to the public" column, verbatim.
  "purchaseCost",
  "currentValue",
  "brand",
  "model",
  "serialNumber",
  "notes",
  "accessories",
  "ownerId",
  "owner",

  // Not in that table, but restricted for reasons the table implies:
  // `parentItemId` is the inverse edge of `accessories` — the same relation,
  // so leaving it in would publish a sibling item's id while hiding the list.
  "parentItemId",
  // Edit history is ❌ for the public *and* for the owner (SRS 3.4), so it is
  // stripped even though no current call site includes it.
  "editLogs",
  "requests",
  // F7.3 gives the public one sentence about a disposed item and "nothing
  // else". `GET /items/:tagId` returns 410 before reaching this function and
  // `GET /items` filters to ACTIVE, so these two cannot leak today; they are
  // listed so a third call site can't reintroduce the leak.
  "disposalReason",
  "disposedAt",
]);

/**
 * True for a viewer SRS 3.4 grants every field to. Exported because the
 * disposed-item guard in `GET /items/:tagId` needs the same predicate: F7.2
 * keeps a disposed item "queryable in reports/history", so Staff/Admin get the
 * record while the public gets F7.3's sentence.
 *
 * `Role` has exactly two members, so today this is "is authenticated at all".
 * It is written as a role check anyway — if a VIEWER or AUDITOR role ever
 * lands, this is the one line that has to be right.
 */
export function isPrivilegedViewer(user?: RequestingUser | null): boolean {
  return user?.role === "ADMIN" || user?.role === "STAFF";
}

export function sanitizeItem(
  item: Record<string, unknown>,
  user?: RequestingUser | null
): Record<string, unknown> {
  const isOwner = user && typeof item.ownerId === "string" && user.id === item.ownerId;

  if (isPrivilegedViewer(user) || isOwner) {
    return item;
  }

  const publicSafeFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!RESTRICTED_FIELDS.has(key)) {
      publicSafeFields[key] = value;
    }
  }

  return publicSafeFields;
}
