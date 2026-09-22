import { useMutation, useQueryClient } from "@tanstack/react-query";
import { completeAuditSession, createAuditSession, scanAuditItem } from "../api/audits";
import { toast } from "../lib/toast";
import type { AuditCompletionResponse, AuditScanRow, AuditSession, CreateAuditPayload } from "../types/audit";

/** Starts a department audit session (F9.1). Nothing to invalidate — no session is listable. */
export function useCreateAuditSession() {
  return useMutation({
    mutationFn: (payload: CreateAuditPayload) => createAuditSession(payload),
    onSuccess: (session: AuditSession) => {
      toast.success(`Audit started for ${session.scopeValue ?? "the selected scope"} — scan as you walk.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't start the audit"),
  });
}

/**
 * Records one scan (F9.2). The toast names the item because the walkthrough is
 * used without looking at the screen between scans — "Scanned Dell Latitude 5440"
 * is the only confirmation that the right tag was read.
 */
export function useScanAuditItem(auditId: string) {
  return useMutation({
    mutationFn: (itemId: string) => scanAuditItem(auditId, itemId),
    onSuccess: (row: AuditScanRow) => {
      toast.success(`Scanned ${row.item.name} — recorded as found.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't record the scan"),
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
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't complete the audit"),
  });
}
