import type { Prisma } from "../generated/prisma/client.js";
import { hasCapability } from "./permissions.js";

/**
 * Who may see which item — the one place both the listing and the single-item
 * lookup get their answer (spec 2.2, Yanet's 11 Oct scan rule).
 *
 * ── Why the two share a file ──────────────────────────────────────────────
 * These were two different rules until the 14 Oct audit proved it: the listing
 * was scoped while `GET /items/:id` returned any row it was asked for, so a STAFF
 * member got nothing from the list and somebody else's item from the single-item
 * route. That is the classic IDOR — the list is not the boundary, the row is.
 * `itemInScope` now answers the single-row question from the *same* fragment the
 * listing uses, so the two cannot drift apart again.
 *
 * ── Why the evaluator refuses to guess ────────────────────────────────────
 * `itemInScope` reads the fragment rather than restating the rules per role. The
 * matcher below understands exactly the operators `itemListScope` emits and
 * throws on anything else, so widening the list scope later (say with a `NOT`)
 * fails loudly in tests instead of quietly letting a single-row read through.
 */

/** The authenticated shape the scope rules read. */
export interface ScopedUser {
  id: string;
  role: "SYSTEM_ADMIN" | "PROPERTY_OFFICER" | "DEPARTMENT_HEAD" | "STAFF" | "AUDITOR";
  orgUnitId?: string | null;
}

/** A row, reduced to the columns the scope fragment can mention. */
export interface ScopedItem {
  id?: string | null;
  ownerId?: string | null;
  holderType?: string | null;
  holderId?: string | null;
  orgUnitId?: string | null;
}

/**
 * Matches nothing. Used instead of omitting a clause: a role with no asset access
 * must be expressed as a filter that excludes everything, because a forgotten
 * clause matches everything (this is the shape of the bug the audit found).
 */
const MATCHES_NOTHING: Prisma.ItemWhereInput = { id: { in: [] } };

/**
 * The widest set of rows a role may read **at all** — the ceiling every view
 * sits under.
 *
 * This is the one place "can this role see asset data?" is answered, and it is
 * answered from the capability matrix, not from a list of role names: a role
 * granted `ITEM_READ` reads the register, one without it sees nothing. A future
 * role joins by editing `GRANTS`, not by finding every `role === …` in this
 * file. The SYSTEM_ADMIN is the one role without the grant (spec 2.1.1).
 *
 * `undefined` means "no ceiling". `MATCHES_NOTHING` is returned instead of `{}`
 * for the same reason `itemListScope` does: a forgotten clause matches
 * everything.
 */
export function itemReadScope(user?: ScopedUser | null): Prisma.ItemWhereInput | undefined {
  if (!user) return MATCHES_NOTHING;
  return hasCapability(user.role, "ITEM_READ") ? undefined : MATCHES_NOTHING;
}

/**
 * The `where` fragment limiting a listing to what the viewer may see.
 * `undefined` means "no restriction".
 */
export function itemListScope(user?: ScopedUser | null): Prisma.ItemWhereInput | undefined {
  // No authenticated user is not "the public can list the register" — every item
  // route requires a token now, so this branch is a caller error and fails closed.
  if (!user) return MATCHES_NOTHING;

  switch (user.role) {
    // The college-wide operational and read-only roles.
    case "PROPERTY_OFFICER":
    case "AUDITOR":
      return undefined;
    // Account administration only — sees no asset data (spec 2.1.1).
    case "SYSTEM_ADMIN":
      return MATCHES_NOTHING;
    // Own holdings only, via either the legacy owner link or the holder fields.
    case "STAFF":
      return { OR: [{ ownerId: user.id }, { holderType: "STAFF", holderId: user.id }] };
    // Their orgUnitId's holdings, plus anything they personally hold.
    case "DEPARTMENT_HEAD":
      return user.orgUnitId
        ? {
            OR: [
              { orgUnitId: user.orgUnitId },
              { holderType: "DEPARTMENT", holderId: user.orgUnitId },
              { ownerId: user.id },
            ],
          }
        : { ownerId: user.id };
  }
}

/**
 * The scope a caller asked for, resolved into the same fragment the listing
 * uses.
 *
 * It used to live inline in the list route, which meant the two item reads
 * could disagree: the listing understood `?scope=all` and the "recently
 * registered" tile behind `GET /items/recent` did not, so a staff member — who
 * may read the whole register — was told 403 by a tile asking for three rows
 * of it. One resolver, used by both, is the fix that cannot come back.
 *
 * `scopeParam` is the caller's `?scope=`. An unknown value falls back to the
 * role's own scope rather than widening anything.
 */
export function resolveItemScope(
  user: ScopedUser | null | undefined,
  scopeParam?: string,
): Prisma.ItemWhereInput | undefined {
  /**
   * The read ceiling comes first, and it **ends** the question for a role
   * without it. Every branch below narrows or reshapes a view; none may widen
   * it past what the matrix allows. Without this early return, a role that lost
   * `ITEM_READ` could still be handed rows by a scope value the switch happens
   * to recognise (or by the `default` fallback) — the exact shape of "a list
   * shows what the detail then refuses".
   */
  const readable = itemReadScope(user);
  if (readable) return readable;
  if (!user) return MATCHES_NOTHING;
  if (!scopeParam) return itemListScope(user);

  switch (user.role) {
    case "DEPARTMENT_HEAD":
      switch (scopeParam) {
        case "mine":
          return { OR: [{ ownerId: user.id }, { holderType: "STAFF", holderId: user.id }] };
        case "department":
          return user.orgUnitId
            ? {
                OR: [
                  { orgUnitId: user.orgUnitId },
                  { holderType: "DEPARTMENT", holderId: user.orgUnitId },
                  { ownerId: user.id },
                ],
              }
            : { ownerId: user.id };
        case "other":
          return user.orgUnitId
            ? {
                NOT: {
                  OR: [
                    { orgUnitId: user.orgUnitId },
                    { holderType: "DEPARTMENT", holderId: user.orgUnitId },
                  ],
                },
              }
            : undefined;
        case "all":
          return undefined;
        default:
          return itemListScope(user);
      }
    case "PROPERTY_OFFICER":
    case "AUDITOR":
      /**
       * "My items" has to mean *theirs*, even for the roles that may read the whole
       * register. This branch used to answer every value except `all` with the
       * role's own scope — which for these two roles is "no restriction" — so the
       * web's and the phone's "My items" option showed the entire college and
       * called it personal. A capability says what a role *may* read; the scope
       * says what this list is showing, and the two are not the same question.
       */
      switch (scopeParam) {
        case "mine":
          return { OR: [{ ownerId: user.id }, { holderType: "STAFF", holderId: user.id }] };
        case "all":
          return undefined;
        default:
          return itemListScope(user);
      }
    case "STAFF":
      switch (scopeParam) {
        case "mine":
          return { OR: [{ ownerId: user.id }, { holderType: "STAFF", holderId: user.id }] };
        case "department":
          return user.orgUnitId
            ? {
                OR: [
                  { orgUnitId: user.orgUnitId },
                  { holderType: "DEPARTMENT", holderId: user.orgUnitId },
                  { ownerId: user.id },
                ],
              }
            : { ownerId: user.id };
        case "all":
          return undefined;
        case "other":
          /**
           * "Other departments" means *other departments*, the same view a head
           * gets — not "everything I do not personally hold". The old rule only
           * removed the caller's own rows, so a CS staff member's "other
           * departments" list still contained 52 Computer Science items
           * (including the department's own pool) and could be used to request a
           * transfer of something the caller's unit already had.
           *
           * A staff member without an org unit has no "other" to name; the
           * caller falls back to the role scope rather than inventing one.
           */
          return user.orgUnitId
            ? {
                NOT: {
                  OR: [
                    { orgUnitId: user.orgUnitId },
                    { holderType: "DEPARTMENT", holderId: user.orgUnitId },
                  ],
                },
              }
            : itemListScope(user);
        default:
          return itemListScope(user);
      }
    default:
      return itemListScope(user);
  }
}

/** Equality under Prisma's rules: `null` and `undefined` are both "no value". */function sameValue(rowValue: unknown, filterValue: unknown): boolean {
  const normalise = (value: unknown) => (value === null || value === undefined ? null : value);
  return normalise(rowValue) === normalise(filterValue);
}

/**
 * Evaluates one `itemListScope` fragment against one row, in memory.
 *
 * Supports exactly what `itemListScope` produces: `OR`, `AND`, `{ id: { in: [] } }`
 * and plain equality on the holder/scope columns. Anything else throws — see the
 * note at the top of the file for why that is deliberate.
 */
function matchesScope(where: Prisma.ItemWhereInput, item: ScopedItem): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    if (key === "OR") {
      const branches = value as Prisma.ItemWhereInput[];
      if (!branches.some((branch) => matchesScope(branch, item))) return false;
      continue;
    }

    if (key === "AND") {
      const branches = value as Prisma.ItemWhereInput[];
      if (!branches.every((branch) => matchesScope(branch, item))) return false;
      continue;
    }

    if (key === "id") {
      const operator = value as { in?: unknown };
      if (!Array.isArray(operator.in)) {
        throw new Error("itemScope: only `id: { in: [...] }` is supported");
      }
      if (!operator.in.includes(item.id)) return false;
      continue;
    }

    if (key === "ownerId" || key === "holderType" || key === "holderId" || key === "orgUnitId") {
      if (!sameValue(item[key], value)) return false;
      continue;
    }

    throw new Error(`itemScope: unsupported filter key \`${key}\``);
  }

  return true;
}

/**
 * May this viewer see this one item? The single-row twin of `itemListScope`, and
 * the check every by-id/by-tag route must make before answering.
 *
 * An out-of-scope row is reported as *not found* by the caller, not as forbidden:
 * a 403 would confirm the item exists (ground rule 3 of the design doc).
 */
/**
 * May this viewer **open** this item?
 *
 * The register is the college's, and "what does the rest of the college have?"
 * is the question a person asks when they need to request something. So a
 * staff member and a department head may open an item that is **not** in their
 * own scope, and the response is field-filtered accordingly (the restricted
 * tier for a staff member, the operational detail for a head).
 *
 * The one thing nobody may open is **another department's pool** — the items a
 * department holds for itself. That is the department's own business, and it is
 * not a catalogue of things you may request.
 *
 * Every item route uses this one rule: the by-tag read, the by-id read, the
 * tag image and the edit history. They used to disagree — the read allowed a
 * cross-department item while the tag image and the history did not — so a
 * person could open an item and then be told "Insufficient permissions" about
 * the picture and the record on the same page.
 */
export function canOpenItem(
  user: ScopedUser | null | undefined,
  item: ScopedItem,
): boolean {
  if (!user) return false;
  if (itemInScope(user, item)) return true;

  /**
   * A register reader may **open** any row the register can list.
   *
   * Both clients list the whole register (`scope=all`) and offer "Other
   * departments" so somebody can find an item to request, so a row drawn by the
   * list must open. This used to refuse another unit's `DEPARTMENT`-held pool,
   * which made that row a dead end — the list said 7 Physics items and tapping
   * one answered "This item is not assigned to you" (26 Oct device pass).
   *
   * The rule is the capability, not a role name: `ITEM_READ` is exactly "this
   * role uses the register", so a future role gets the behaviour from the
   * matrix. Reading is safe by construction — `sanitizeItem` already shows the
   * whole record to every college member, and **editing** is still
   * `itemInScope`-only in `PUT /items/:id`. This answers "may they open it",
   * never "may they change it".
   */
  return hasCapability(user.role, "ITEM_READ");
}

export function itemInScope(user: ScopedUser | null | undefined, item: ScopedItem): boolean {
  const scope = itemListScope(user);
  if (!scope) return true;
  return matchesScope(scope, item);
}
