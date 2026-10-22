/**
 * Item visibility: soft-deletion by status (SRS F7.2/F7.3).
 *
 * ── Why the where-clause helpers are a service ────────────────────────────
 * "Disposed items disappear from active/default search results but remain
 * queryable in reports/history" (F7.2) is one rule enforced at three call
 * sites — the listing, the approval path, and Phase 3's reports. Written out
 * at each of them it is one forgotten `status` key away from a disposed item
 * reappearing in a public search, and nothing about a missing key looks wrong
 * in review.
 *
 * Call sites:
 *   GET /items          → `where: activeItemsWhere({ ...filters })`  (routes/items.ts)
 *   GET /items/:tagId   → `DISPOSED_PUBLIC_MESSAGE` behind the 410  (routes/items.ts)
 *   reports (Phase 3)   → `where: allItemsWhere({ ... })`
 *
 * ── Field filtering lives elsewhere ───────────────────────────────────────
 * SDS 3.2's strip-before-sending rule is `sanitizeItem` in
 * utils/filterItemFields.ts. This file deliberately does not duplicate it:
 * Phase 2 shipped a second implementation while `GET /items/:tagId` did not
 * exist yet, and two field lists that must agree forever is a bug with a
 * delay on it. `sanitizeItem` won because SDS 3.2 prescribes its exact shape
 * (strip a deny-list, with an owner branch) and its list matches SRS 3.4's
 * table — `photoUrl` public, `brand`/`model` not.
 */

/**
 * F7.3, verbatim: a public tag lookup for a disposed item "shows 'this item is
 * no longer in service', nothing else". Sentence-cased for a JSON `error`
 * field; the wording is otherwise untouched, because the acceptance criterion
 * quotes it.
 */
export const DISPOSED_PUBLIC_MESSAGE = "This item is no longer in service";

/**
 * Default listing filter: the college's **live** items.
 *
 * It used to pin `status: "ACTIVE"`, which is the same rule as "exclude the
 * disposed" (F7.2 — a disposal is a status change, never a delete) taken one
 * step too far. The register is the college's assets, and three of the states
 * are still live:
 *
 *   - `PENDING_CLAIM` — registered and assigned, waiting for the holder to
 *     confirm they have it. Pinning ACTIVE hid the item from the register
 *     **and** from the person who had to act on it, which made the claim
 *     handshake (spec 4.4) a screen nobody could reach.
 *   - `LOANED` — out on loan, still the college's asset.
 *   - `REVERTED_UNVERIFIED` — came back from somebody who left; it needs
 *     verifying.
 *
 * What the listing must not show is what is **out of service**: `DISPOSED`,
 * `VOIDED` and `LOST`. Those are excluded, and the exclusion is by name
 * rather than by pinning one status, so a new live state cannot silently
 * vanish from the register.
 *
 * `status` is pinned LAST on purpose. Spreading `extra` first means a caller who
 * passes `{ status: "DISPOSED" }` — from an unvalidated query string, say —
 * cannot widen the filter, because the pin overwrites it. That property is
 * asserted directly in itemVisibility.test.ts.
 */
export function activeItemsWhere<T extends object = Record<string, never>>(
  extra?: T,
): T & { status: { notIn: string[] } } {
  return {
    ...(extra ?? {}),
    status: { notIn: ["DISPOSED", "VOIDED", "LOST"] },
  } as T & { status: { notIn: string[] } };
}

/**
 * Identity function. Its entire job is to make "disposed items are included on
 * purpose here" greppable — Phase 3's disposal report needs them, and a bare
 * `where` with no status key is indistinguishable from having forgotten one.
 */
export function allItemsWhere<T extends object = Record<string, never>>(extra?: T): T {
  return (extra ?? {}) as T;
}
