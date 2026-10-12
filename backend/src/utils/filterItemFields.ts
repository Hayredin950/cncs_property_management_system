/**
 * Field visibility for item responses.
 *
 * This replaces the old "SDS 3.2 deny-list for the public plus an owner branch"
 * with the role model from spec 2.2 and Yanet's scan rule (11 Oct):
 *
 *   - PROPERTY_OFFICER and AUDITOR see every field of every item.
 *   - A DEPARTMENT_HEAD sees full detail for items their department holds.
 *   - STAFF see only the items they hold, and the public sees nothing restricted.
 *   - SYSTEM_ADMIN is an account role and sees no asset data at all.
 *
 * The owner branch survives, but it is now *one* way to be a custodian: an item
 * is held by a staff member (`ownerId` / `holderType = STAFF`) or by a department
 * (`departmentId`). The helper checks both, so the same rule holds whether the
 * item was written before or after the holder fields were introduced.
 *
 * A deny-list still fails open for a *column added later*, so the mitigation is
 * the same as before: keep the set wider than the table and re-read it whenever
 * `Item` grows.
 */

/** Structurally a subset of `AuthenticatedRequest["user"]` — kept local so utils don't import middleware. */
export interface RequestingUser {
  id: string;
  role:
    | "SYSTEM_ADMIN"
    | "PROPERTY_OFFICER"
    | "DEPARTMENT_HEAD"
    | "STAFF"
    | "AUDITOR";
  /** Filled when the token carried a `ver` claim and the row was read; see `authenticate`. */
  departmentId?: string | null;
}

/** The item fields the visibility helpers read. Everything else is opaque here. */
interface ItemCustody {
  ownerId?: string | null;
  holderType?: string | null;
  holderId?: string | null;
  departmentId?: string | null;
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
  // The holder pair (spec 4.1) is the same fact as `ownerId`/`owner` and is
  // stripped with them: `holderId` is a user id, and who physically holds an item
  // is not something a public tag lookup answers (SRS 3.4's "not visible to the
  // public" column). The privileged view below keeps them, because custody is what
  // the workbench is for.
  "holderId",
  "holderType",
  // `parentItemId` is the inverse edge of `accessories` — the same relation, so
  // leaving it in would publish a sibling item's id while hiding the list.
  "parentItemId",
  // Edit history is ❌ for the public *and* for the owner (SRS 3.4).
  "editLogs",
  "requests",
  // F7.3 gives the public one sentence about a disposed item and "nothing else".
  "disposalReason",
  "disposedAt",
]);

/**
 * Roles that see full detail on any item regardless of who holds it
 * (spec 2.2: property officers see everything; auditors read everything).
 * SYSTEM_ADMIN is deliberately absent — it is an account role with no asset
 * access, so an admin scanning a tag gets the same stripped view as the public.
 */
const FULL_DETAIL_ROLES = new Set(["PROPERTY_OFFICER", "AUDITOR"]);

function isCustodian(user: RequestingUser, item: ItemCustody): boolean {
  // Holder-first: the holder columns are authoritative, and new writes always set
  // them (services/holder.ts).
  if (item.holderType === "STAFF" && item.holderId === user.id) return true;
  // `ownerId` is the fallback for rows written before the holder columns existed.
  // It goes when the backfill migration lands, and this line is the only read of
  // it left in the visibility rules.
  if (typeof item.ownerId === "string" && item.ownerId === user.id) return true;
  return false;
}

/**
 * True when the viewer may see every field of this item.
 *
 * Written per-item rather than per-role alone because a DEPARTMENT_HEAD's access
 * depends on the item, not just on who they are — that is the scoping rule from
 * spec 2.3.3 ("an item's department is derived from its holder").
 */
export function seesFullItemDetail(
  user: RequestingUser | null | undefined,
  item: ItemCustody = {},
): boolean {
  if (!user) return false;
  if (FULL_DETAIL_ROLES.has(user.role)) return true;
  if (isCustodian(user, item)) return true;

  // A department head sees their department's holdings. The item's department
  // comes from the holder; both the stored `departmentId` and a
  // DEPARTMENT-held `holderId` are checked, because the holder fields are new
  // and the column link is what older rows populate.
  if (user.role === "DEPARTMENT_HEAD" && user.departmentId) {
    if (item.departmentId === user.departmentId) return true;
    if (item.holderType === "DEPARTMENT" && item.holderId === user.departmentId) return true;
  }

  return false;
}

/**
 * Kept for the disposed-item guard: it asks "is this an internal viewer at all?",
 * which is broader than "may they see every field". A STAFF member scanning a
 * disposed tag is still an authenticated user who should get the record, not
 * F7.3's sentence — but the record they get is still field-filtered below.
 */
export function isAuthenticatedViewer(user?: RequestingUser | null): boolean {
  return Boolean(user);
}

export function sanitizeItem(
  item: Record<string, unknown>,
  user?: RequestingUser | null,
): Record<string, unknown> {
  if (seesFullItemDetail(user, item as ItemCustody)) {
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
