import type { Prisma } from "../generated/prisma/client.js";

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

/** Equality under Prisma's rules: `null` and `undefined` are both "no value". */
function sameValue(rowValue: unknown, filterValue: unknown): boolean {
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
export function itemInScope(user: ScopedUser | null | undefined, item: ScopedItem): boolean {
  const scope = itemListScope(user);
  if (!scope) return true;
  return matchesScope(scope, item);
}
