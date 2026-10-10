import { ClipboardCheck, Download, History, MapPinOff, MinusCircle, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { downloadAuditReport, saveReport } from "../../api/reports";
import { useAuth } from "../../app/AuthContext";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/Select";
import { SkeletonText } from "../../components/Skeleton";
import { useAuditsList } from "../../hooks/useAudits";
import { AUDITS_PAGE_SIZE } from "../../api/audits";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import { toast } from "../../lib/toast";
import { NetworkError } from "../../types/api";
import type { AuditSessionSummary } from "../../types/audit";

/**
 * `/audits` — the audit history (F9.3 read-back).
 *
 * The walkthrough writes every scan to the server as it happens, and completing
 * the audit writes the classification, but until this page existed a session id
 * was the only way back to any of it: the report page could read a session *if*
 * you already knew its id, and nothing in the app ever showed you one. Finished
 * audits were therefore stored and unreachable — which is what "it doesn't get
 * persisted" describes from the outside, even though nothing was ever lost.
 *
 * The rows here are summaries (`GET /audits` derives the counts from the stored
 * result rows); the per-item breakdown lives on the report, and the CSV is the
 * copy an office keeps. Nothing is recomputed on the client — if a number is on
 * this page, the server counted it.
 */
export function AuditListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchParams, setSearchParams] = useSearchParams();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const mine = isAdmin && searchParams.get("mine") === "1";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const auditsQuery = useAuditsList({ mine, page });

  function setParam(key: string, value: string | null) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === null) next.delete(key);
      else next.set(key, value);
      // A filter change re-pages from the start; page 4 of the old filter is
      // meaningless in the new one.
      if (key !== "page") next.delete("page");
      return next;
    });
  }

  async function handleDownload(audit: AuditSessionSummary) {
    setDownloadingId(audit.id);
    try {
      const filename = await saveReport(() => downloadAuditReport(audit.id));
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't download the audit report");
    } finally {
      setDownloadingId(null);
    }
  }

  const totalPages = auditsQuery.data
    ? Math.max(1, Math.ceil(auditsQuery.data.total / AUDITS_PAGE_SIZE))
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audits</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? "Every audit session, newest first — including any left unfinished."
              : "The audits you've run, newest first — including any left unfinished."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {isAdmin && (
            <Select
              label="Show"
              options={[
                { value: "", label: "All audits" },
                { value: "1", label: "Only mine" },
              ]}
              value={mine ? "1" : ""}
              onChange={(event) => setParam("mine", event.target.value || null)}
              className="sm:w-40"
            />
          )}
          <Link to="/audit/new">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />}>
              Start an audit
            </Button>
          </Link>
        </div>
      </div>

      {auditsQuery.isPending ? (
        <div role="status" aria-label="Loading audits">
          <SkeletonText lines={5} />
        </div>
      ) : auditsQuery.isError ? (
        auditsQuery.error instanceof NetworkError ? (
          <OfflineState />
        ) : (
          <ErrorState
            heading="Couldn't load the audit history"
            body={auditsQuery.error instanceof Error ? auditsQuery.error.message : undefined}
            action={
              <Button size="sm" onClick={() => auditsQuery.refetch()}>
                Try again
              </Button>
            }
          />
        )
      ) : auditsQuery.data.audits.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          heading={mine ? "You haven't run an audit yet" : "No audits yet"}
          body="Start one and scan items as you walk the department — every scan is saved as you go, and the finished audit stays here."
          action={
            <Link to="/audit/new">
              <Button size="sm" leftIcon={<ClipboardCheck className="h-4 w-4" />}>
                Start an audit
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {auditsQuery.data.audits.map((audit) => (
            <li key={audit.id}>
              <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/* The link is the title, not the whole card: the CSV button
                        below is a real control, and a button inside an anchor is
                        invalid HTML the browser resolves unpredictably. */}
                    <Link
                      to={`/audit/${audit.id}/report`}
                      className="font-semibold text-slate-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                    >
                      {audit.scopeValue || audit.scopeType}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {audit.runBy.fullName} ·{" "}
                      <span title={formatDateTimeUTC(audit.startedAt) ?? undefined}>
                        started {formatRelativeTime(audit.startedAt)}
                      </span>
                    </p>
                  </div>
                  {audit.completed ? (
                    <Badge tone="success">
                      Completed{" "}
                      <span title={formatDateTimeUTC(audit.completedAt ?? audit.startedAt) ?? undefined}>
                        {audit.completedAt ? formatRelativeTime(audit.completedAt) : ""}
                      </span>
                    </Badge>
                  ) : (
                    <Badge tone="warning">In progress</Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <ClipboardCheck className="h-4 w-4 text-success-600" aria-hidden="true" />
                    <strong className="font-semibold tabular-nums">{audit.counts.found}</strong> found
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <MinusCircle className="h-4 w-4 text-danger-600" aria-hidden="true" />
                    <strong className="font-semibold tabular-nums">{audit.counts.missing}</strong> missing
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <MapPinOff className="h-4 w-4 text-warning-600" aria-hidden="true" />
                    <strong className="font-semibold tabular-nums">{audit.counts.locationMismatch}</strong> at the
                    wrong location
                  </span>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Link to={`/audit/${audit.id}/report`}>
                    <Button variant="outline" size="sm">
                      View report
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Download className="h-4 w-4" />}
                    loading={downloadingId === audit.id}
                    disabled={downloadingId !== null}
                    onClick={() => void handleDownload(audit)}
                  >
                    CSV
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(next) => setParam("page", String(next))}
      />
    </div>
  );
}
