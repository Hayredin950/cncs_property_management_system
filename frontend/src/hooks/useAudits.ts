import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeAuditSession,
  createAuditSession,
  fetchActiveAudit,
  fetchAuditSession,
  fetchAudits,
  fetchOpenFindings,
  scanAuditItem,
} from "../api/audits";
import { scanToastSlot, toast } from "../lib/toast";
import type { AuditCompletionResponse, AuditScanRow, AuditSession, CreateAuditPayload } from "../types/audit";

/**
 * The dashboard's "Current audit" tile — this auditor's open session, or `null`
 * when nothing is open.
 *
 * Both halves of the old version were wrong in the same silent way as
 * `useAuditHistoryList` below. It called `/api/v1/audits/active` with a bare,
 * root-relative `fetch` and no `Authorization` header (wrong origin on a same-origin
 * deployment; 401 on the API host), then funnelled every failure — including the
 * parse error a 200 HTML body produces — into `return null`, so "no active audit"
 * and "the request failed" were the same answer. The shape was wrong on top of
 * that: it read `data.id`/`data.scope`/`data.scanned`/`data.total` from an endpoint
 * that answers `{ active, session, progress }`.
 *
 * It now goes through `apiClient` like every other read, maps once inside
 * `fetchActiveAudit`, and lets failures be failures: the tile renders its error
 * state instead of claiming the auditor has nothing in flight.
 */
export function useActiveAudit() {
  return useQuery({
    queryKey: ["audits", "active"],
    queryFn: ({ signal }) => fetchActiveAudit(signal),
    // `null` is a designed answer; a denial or a dead network is not, and retrying
    // is the right response to the second only. The API answers 401/403/500 — never
    // a 404 — so there is no "not built yet" case left to tolerate.
    retry: false,
  });
}

/**
 * The dashboard's "Open findings" tile (`GET /audits/findings?status=OPEN`).
 *
 * Same rewrite as `useActiveAudit` above, and the same reason: a bare
 * root-relative `fetch` with no token, whose every failure — including a 404 from a
 * route that was unreachable through route ordering — became `{ count: 0 }`. A
 * zero that means "we could not ask" is worse than no tile: it reads as a clean
 * audit history.
 */
export function useOpenFindings() {
  return useQuery({
    queryKey: ["audits", "findings", "OPEN"],
    queryFn: ({ signal }) => fetchOpenFindings(signal),
    retry: false,
  });
}

/**
 * The dashboard's "Audit history" card: the most recent sessions, newest first.
 *
 * This used to be a bare `fetch("/api/v1/audits?limit=3&sort=completedAt:desc")`,
 * and every part of that was wrong in a way that failed **silently**:
 *
 *   - No `Authorization` header, so on a same-origin deployment it was a 401.
 *   - A root-relative URL, so in `pnpm dev` it hit Vite and got `index.html`
 *     back with a 200 — which is why the parse below threw rather than the
 *     status check catching it.
 *   - It read the body as an array, but `GET /audits` answers
 *     `{ audits, total, limit, offset }`.
 *
 * Each of those went into the same `catch` that returned `[]`, so the card read
 * "No audits completed yet" however many audits existed. That is the worst kind of
 * wrong: not an error a user can act on, but data-shaped reassurance that the
 * audits had been lost — and `GET /audits` had been working the whole time.
 *
 * It now goes through `apiClient` like every other read (token attached, base URL
 * resolved once, `ApiError` on failure), and an error is an error: the widget
 * renders its failure state instead of inventing an empty history.
 */
export function useAuditHistoryList(limit = 3) {
  return useQuery({
    queryKey: ["audits", "history", "quick", limit],
    queryFn: ({ signal }) => fetchAudits({ page: 1 }, signal),
    // The endpoint pages, and the card wants a fixed few — sliced here rather
    // than requested separately so the card and `/audits` page 1 read one cache
    // entry and cannot disagree.
    select: (data) => data.audits.slice(0, limit),
    retry: false,
  });
}

/**
 * One stored session and its result rows (`GET /audits/:id`).
 *
 * Shares the `["audit", id]` key with the report page's own fetch, so the two
 * screens read the same cache entry rather than asking the server twice for the
 * same session — the report is usually reached from the walkthrough.
 */
export function useAuditSession(id: string) {
  return useQuery({
    queryKey: ["audit", id],
    queryFn: ({ signal }) => fetchAuditSession(id, signal),
    enabled: Boolean(id),
    retry: false,
  });
}

/**
 * The audit history (`GET /audits`). `mine` is the admin's "only mine" filter; for
 * a Staff member the server already scopes the list, so the flag changes nothing
 * there and the client does not pretend otherwise.
 */
export function useAuditsList({ mine = false, page = 1 }: { mine?: boolean; page?: number } = {}) {
  return useQuery({
    queryKey: ["audits", mine, page],
    queryFn: ({ signal }) => fetchAudits({ mine, page }, signal),
    retry: false,
  });
}

/**
 * Starts a department audit session (F9.1). The new session is now listable
 * (`GET /audits`), so the history is invalidated: an audit that has been started
 * and not finished is the one a reviewer most needs to see.
 */
export function useCreateAuditSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAuditPayload) => createAuditSession(payload),
    onSuccess: (session: AuditSession) => {
      toast.success(`Audit started for ${session.scopeValue ?? "the selected scope"} — scan as you walk.`);
      void queryClient.invalidateQueries({ queryKey: ["audits"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't start the audit"),
  });
}

/**
 * Records one scan (F9.2). The toast names the item because the walkthrough is
 * used without looking at the screen between scans — "Scanned Dell Latitude 5440"
 * is the only confirmation that the right tag was read.
 *
 * Everything a scan can say goes into the session's single toast slot
 * (`scanToastSlot`), so a busy minute at the camera produces one line that stays
 * current rather than a stack of them. The audit is the one screen where the
 * toast is not a notification but feedback, and feedback that arrives ten times a
 * second is noise.
 */
export function useScanAuditItem(auditId: string) {
  const slot = scanToastSlot(auditId);
  return useMutation({
    mutationFn: (itemId: string) => scanAuditItem(auditId, itemId),
    onSuccess: (row: AuditScanRow) => {
      toast.success(`Scanned ${row.item.name} — recorded as found.`, { id: slot });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't record the scan", { id: slot }),
  });
}

/**
 * Finalizes the audit (F9.3). Completing sets `Item.lastAuditedAt` for everything
 * found, so the item queries are invalidated — a stale item page would still show
 * the pre-audit date.
 */
export function useCompleteAuditSession(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeAuditSession(auditId),
    onSuccess: (summary: AuditCompletionResponse) => {
      const { found, missing, locationMismatch } = summary.counts;
      toast.success(
        `Audit complete — ${found} found, ${missing} missing, ${locationMismatch} at the wrong location.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      // Its counts and its `completed` flag both just changed.
      void queryClient.invalidateQueries({ queryKey: ["audits"] });
      void queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't complete the audit"),
  });
}

/**
 * Concludes the physical walk and transitions remaining items to NOT_LOCATED for sorting.
 */
export function useCloseAuditWalk(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => import("../api/audits").then((m) => m.closeAuditWalk(auditId)),
    onSuccess: (data) => {
      toast.success(data.message || "Walk completed. Proceeding to sorting phase.");
      void queryClient.invalidateQueries({ queryKey: ["audits"] });
      void queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
      void queryClient.invalidateQueries({ queryKey: ["audits", "active"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to close audit walk"),
  });
}

/**
 * Sorts an un-scanned item into NOT_ACCESSIBLE, CHECK_AGAIN, or MISSING.
 */
export function useSortAuditItem(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: import("../types/audit").SortAuditItemPayload) =>
      import("../api/audits").then((m) => m.sortAuditItem(auditId, payload)),
    onSuccess: (row) => {
      toast.success(`Updated item ${row.item?.name || "status"}.`);
      void queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to update item status"),
  });
}

/**
 * Finalizes the audit: freezes report, generates reportNumber, updates Item.lastAuditedAt.
 */
export function useFinalizeAudit(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => import("../api/audits").then((m) => m.finalizeAudit(auditId)),
    onSuccess: (data) => {
      toast.success(`Audit ${data.reportNumber} finalized and report locked.`);
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["audits"] });
      void queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
      void queryClient.invalidateQueries({ queryKey: ["audits", "active"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to finalize audit"),
  });
}

/**
 * Property Officer formal acknowledgement and report sign-off.
 */
export function useAcknowledgeAudit(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => import("../api/audits").then((m) => m.acknowledgeAudit(auditId)),
    onSuccess: (session) => {
      toast.success(`Audit report ${session.reportNumber || session.id} signed off and acknowledged.`);
      void queryClient.invalidateQueries({ queryKey: ["audits"] });
      void queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to acknowledge audit"),
  });
}
