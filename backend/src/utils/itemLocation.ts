import type { Prisma } from "../generated/prisma/client.js";

/**
 * An item's location and department, as every caller of an item row names them.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * `department` and `building` were free-text columns on `Item`. The org tree and
 * the building table replaced them with `orgUnitId` / `buildingId`, and both
 * columns are gone from the database — but the selects that still asked for them
 * were not, and Prisma rejects an unknown select key at *runtime*
 * (`Unknown field 'department' for select statement on model 'Item'`), so
 * `GET /requests/:id`, `/reports/inventory`, `/reports/audit/:id`,
 * `/reports/disposals` and `GET /audits/:id` all answered 500. TypeScript cannot
 * catch it: the select's target type is a mapped type, so an extra key is not an
 * excess-property error and `tsc` stays green.
 *
 * So the pair is written once, here, and every one of those call sites spreads
 * `ITEM_LOCATION_SELECT` and reshapes with `withLocationNames`. A stale column
 * name now has exactly one place to be wrong — and it is the place a live request
 * reaches first — instead of five that each had to be found separately.
 *
 * ── Why the wire keys did not change ──────────────────────────────────────
 * The frontend and mobile models still read `item.department` / `item.building`
 * as *names* (`frontend/src/types/item.ts`, `mobile/lib/models/item.dart`), and a
 * CSV whose department column held a uuid would not be a report. So the
 * relations are resolved to names here and put back under the keys the clients
 * already read, instead of handing every client a new shape to migrate to.
 */

/** The relation fields to spread into an `Item` select to get the pair above. */
export const ITEM_LOCATION_SELECT = {
  orgUnitRef: { select: { name: true } },
  buildingRef: { select: { name: true } },
} as const;

/** The relation side of `ITEM_LOCATION_SELECT`, for the reshape below. */
export interface ItemLocationRelations {
  orgUnitRef?: { name: string } | null;
  buildingRef?: { name: string } | null;
}

/**
 * `{ orgUnitRef, buildingRef }` → `{ department, building }`, and the relations
 * themselves are dropped so no response leaks the raw `orgUnit`/`buildingRef`
 * object shape that only this module is supposed to know about.
 *
 * Nullable, not optional: an item registered before the org tree existed has no
 * unit, and the clients read these keys as "string or empty".
 */
export type ItemWithNames<T> = Omit<T, "orgUnitRef" | "buildingRef"> & {
  department: string | null;
  building: string | null;
};

export function withLocationNames<T extends ItemLocationRelations>(
  item: T,
): ItemWithNames<T> {
  const { orgUnitRef, buildingRef, ...rest } = item;
  return {
    ...rest,
    department: orgUnitRef?.name ?? null,
    building: buildingRef?.name ?? null,
  };
}

/**
 * A row that carries its item under `item` — a request, an audit result row — gets
 * the same reshape one level down, so a route never has to know which of the two
 * shapes its clients read.
 */
export function withRowItemNames<T extends { item: ItemLocationRelations }>(
  row: T,
): Omit<T, "item"> & { item: ItemWithNames<T["item"]> } {
  return { ...row, item: withLocationNames(row.item) };
}

/**
 * `?department=` as a where-clause. The parameter keeps its name and now matches
 * the OrgUnit's name, which is what the free-text column held.
 *
 * `insensitive` on request: an audit's scope value comes from a fixed list, so
 * the hole this closes is the one the old code documented — an item filed as
 * "computer science" disappearing from a "Computer Science" audit. Reports filter
 * exactly, as they did before, because a report is asked for by the operator who
 * typed the name.
 */
export function departmentWhere(
  name: string,
  mode: "default" | "insensitive" = "default",
): Prisma.ItemWhereInput {
  return {
    orgUnitRef: {
      is: { name: mode === "insensitive" ? { equals: name, mode: "insensitive" } : { equals: name } },
    },
  };
}

/** `building` scope/param, matched on the Building's name. Audits match insensitively — see `departmentWhere`. */
export function buildingWhere(name: string): Prisma.ItemWhereInput {
  return { buildingRef: { is: { name: { equals: name, mode: "insensitive" } } } };
}
