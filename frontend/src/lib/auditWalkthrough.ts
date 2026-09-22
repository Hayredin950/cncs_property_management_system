import { clearDraft, loadDraft, saveDraft } from "./storage";
import type { AuditCompletionResponse, AuditWalkthroughState, ScannedAuditItem } from "../types/audit";

/**
 * The audit walkthrough is the one screen used **holding a phone, one-handed, for
 * a whole shift** (F9.2), and the backend has no `GET /audits/:id` at all (gap
 * G1). So both pieces the UI cannot re-derive from the API are kept in
 * `sessionStorage`, through the same draft-store helpers every other in-progress
 * form uses (cleared when the tab closes — an audit left running forever is not
 * something to resurrect):
 *
 * - the **running scan list**, so a reload mid-walkthrough doesn't lose the count;
 * - the **completion summary**, because the report page has nowhere else to read
 *   it from — the completion response is the only time the server sends it.
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
