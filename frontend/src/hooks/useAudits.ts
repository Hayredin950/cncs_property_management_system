import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeAuditSession,
  createAuditSession,
  fetchAuditSession,
  fetchAudits,
  scanAuditItem,
} from "../api/audits";
import { scanToastSlot, toast } from "../lib/toast";
import type { AuditCompletionResponse, AuditScanRow, AuditSession, CreateAuditPayload } from "../types/audit";

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
