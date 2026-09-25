import { clearDraft, loadDraft, saveDraft } from "./storage";
import type {
  AuditCompletionResponse,
  AuditSessionReadback,
  AuditWalkthroughState,
  ScannedAuditItem,
} from "../types/audit";

/**
 * The audit walkthrough is the one screen used **holding a phone, one-handed, for
 * a whole shift** (F9.2), so it keeps two things in `sessionStorage` through the
 * same draft-store helpers every other in-progress form uses (cleared when the tab
 * closes — an audit left running forever is not something to resurrect):
 *
 * - the **running scan list**, so a reload mid-walkthrough is instant;
 * - the **completion summary**, so the report renders the moment the audit is
 *   completed without waiting on a request.
 *
 * Neither is the source of truth, and that distinction matters. Both were once the
 * *only* copy the UI could see, because no endpoint read a session back — the rows
 * were written to the database and were unreachable from the app. `GET /audits/:id`
 * and `GET /audits` closed that, so `sessionStorage` is now a cache in front of
 * stored data: the walkthrough merges stored rows in (`mergeStoredScans`) and the
 * report falls back to the read-back whenever its cache is cold.
 */

const WALKTHROUGH_PREFIX = "audit-scans.";
const SUMMARY_PREFIX = "audit-summary.";

export function loadWalkthrough(auditId: string): AuditWalkthroughState {
  return loadDraft<AuditWalkthroughState>(WALKTHROUGH_PREFIX + auditId) ?? { scopeValue: "", scanned: [] };
}

export function saveWalkthrough(auditId: string, state: AuditWalkthroughState): void {
  saveDraft(WALKTHROUGH_PREFIX + auditId, state);
}

export function clearWalkthrough(auditId: string): void {
  clearDraft(WALKTHROUGH_PREFIX + auditId);
}

export function loadCompletionSummary(auditId: string): AuditCompletionResponse | null {
  return loadDraft<AuditCompletionResponse>(SUMMARY_PREFIX + auditId);
}

export function saveCompletionSummary(summary: AuditCompletionResponse): void {
  saveDraft(SUMMARY_PREFIX + summary.auditSessionId, summary);
}

/** Appends one scan unless the item is already in the list (the server would accept a duplicate row). */
export function appendScan(state: AuditWalkthroughState, scan: ScannedAuditItem): AuditWalkthroughState {
  if (state.scanned.some((entry) => entry.itemId === scan.itemId)) return state;
  return { ...state, scanned: [...state.scanned, scan] };
}

/**
 * The stored result rows merged with this tab's local list, oldest first.
 *
 * The walkthrough used to be the local list and nothing else, and `sessionStorage`
 * is **per tab**: open `/audit/:id/scan` in a new tab — or come back on another
 * device, or after the browser closed — and the count was zero while every scan was
 * already saved on the server. That reads as "the audit didn't persist", and it was
 * the honest description of the screen even though the rows were always there.
 *
 * So the server's rows are the base and the local list only contributes scans it
 * has not caught up with yet, keyed by item id — the same key `appendScan`
 * dedupes on, which is also what keeps the two from double-counting a scan made in
 * this tab a moment ago.
 *
 * `scannedAt` is what decides membership, not `result`: a `MISSING` row is written
 * by completion for an item nobody scanned and carries no timestamp at all, whereas
 * a `LOCATION_MISMATCH` row *was* scanned — just somewhere it should not have been,
 * which is exactly the scan a walker needs to see again in their list.
 */
export function mergeStoredScans(
  local: ScannedAuditItem[],
  stored: AuditSessionReadback | undefined,
): ScannedAuditItem[] {
  const byItemId = new Map(local.map((entry) => [entry.itemId, entry]));

  for (const row of stored?.rows ?? []) {
    if (row.scannedAt === null) continue;
    if (byItemId.has(row.itemId)) continue;

    byItemId.set(row.itemId, {
      itemId: row.itemId,
      tagId: row.item.tagId,
      name: row.item.name,
      room: row.item.room,
      scannedAt: row.scannedAt,
    });
  }

  return [...byItemId.values()].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
}
