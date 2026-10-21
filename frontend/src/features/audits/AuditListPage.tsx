import { ClipboardCheck, Download, History, MapPinOff, MinusCircle, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { describeDownloadFailure, downloadAuditReport, saveReport } from "../../api/reports";
import { useAuth } from "../../app/AuthContext";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/Select";
import { SkeletonText } from "../../components/Skeleton";
import { useAuditsList } from "../../hooks/useAudits";
import { abandonAuditSession, AUDITS_PAGE_SIZE } from "../../api/audits";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import type { AuditSessionSummary } from "../../types/audit";
import { canRunAudits, canViewAudits } from "../../lib/permissions";
import { toast } from "../../lib/toast";
import { NetworkError } from "../../types/api";

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
  const canBrowseAll = canViewAudits(user?.role);
  const canRun = canRunAudits(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [abandonDialogOpen, setAbandonDialogOpen] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");
  const [auditToAbandon, setAuditToAbandon] = useState<AuditSessionSummary | null>(null);

  const mine = canBrowseAll && searchParams.get("mine") === "1";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const status = searchParams.get("status") || "";
  const searchQuery = searchParams.get("search") || "";
  const sortBy = searchParams.get("sort") || "startedAt";
  const sortOrder = searchParams.get("order") || "desc";

  const auditsQuery = useAuditsList({ mine, page, status, search: searchQuery, sortBy, sortOrder });

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
      toast.error(describeDownloadFailure(err, "the audit report"));
    } finally {
      setDownloadingId(null);
    }
  }

  function handleAbandon(audit: AuditSessionSummary) {
    setAuditToAbandon(audit);
    setAbandonDialogOpen(true);
  }

  async function confirmAbandon() {
    if (!auditToAbandon) return;
    try {
      // The session is closed for real, with the reason recorded. The old
      // version of this showed a success toast and changed nothing at all —
      // the session stayed open, kept showing up in the "Active Audit" tile,
      // and the person was told it had been dealt with.
      await abandonAuditSession(auditToAbandon.id, abandonReason.trim());
      toast.success(
        `Audit abandoned: ${auditToAbandon.scopeValue || auditToAbandon.scopeType}. It produced no report.`,
      );
      setAbandonDialogOpen(false);
      setAbandonReason("");
      setAuditToAbandon(null);
      void auditsQuery.refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't abandon the audit session.",
      );
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
            {canBrowseAll
              ? "Every audit session, newest first — including any left unfinished."
              : "The audits you've run, newest first — including any left unfinished."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {canRun && (
            <Link to="/audit/new">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                Start an audit
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Search session ID"
              value={searchQuery}
              onChange={(event) => setParam("search", event.target.value || null)}
              leadingIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Select
            label="Status"
            options={[
              { value: "", label: "All statuses" },
              { value: "completed", label: "Completed" },
              { value: "in-progress", label: "In progress" },
              { value: "abandoned", label: "Abandoned" },
            ]}
            value={status}
            onChange={(event) => setParam("status", event.target.value || null)}
            className="sm:w-40"
          />
          {canBrowseAll && (
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
          <Select
            label="Sort by"
            options={[
              { value: "startedAt", label: "Started date" },
              { value: "completedAt", label: "Completed date" },
              { value: "runBy", label: "Started by" },
            ]}
            value={sortBy}
            onChange={(event) => setParam("sort", event.target.value || null)}
            className="sm:w-40"
          />
          <Select
            label="Order"
            options={[
              { value: "desc", label: "Newest first" },
              { value: "asc", label: "Oldest first" },
            ]}
            value={sortOrder}
            onChange={(event) => setParam("order", event.target.value || null)}
            className="sm:w-40"
          />
        </div>
      </Card>

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
          {auditsQuery.data.audits.map((audit: AuditSessionSummary) => (
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
                  ) : audit.abandoned ? (
                    // An abandoned session produced no report. Saying
                    // "Abandoned" rather than "In progress" is the whole
                    // point: it must never be read as evidence.
                    <Badge tone="neutral">Abandoned</Badge>
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
                  {/* An abandoned session produced no report, so there is no
                      report to read and no export to download. Offering both
                      would send people to a page that says "not found" for a
                      session that was never a report at all. */}
                  {!audit.abandoned && (
                    <>
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
                    </>
                  )}
                  {audit.abandoned && audit.abandonReason && (
                    <p className="max-w-xs text-right text-xs text-slate-500">
                      Abandoned: {audit.abandonReason}
                    </p>
                  )}
                  {!audit.completed && !audit.abandoned && canRun && audit.runBy.id === user?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<X className="h-4 w-4" />}
                      onClick={() => handleAbandon(audit)}
                    >
                      Abandon
                    </Button>
                  )}
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

      <ConfirmDialog
        open={abandonDialogOpen}
        onClose={() => {
          setAbandonDialogOpen(false);
          setAbandonReason("");
          setAuditToAbandon(null);
        }}
        onConfirm={confirmAbandon}
        title="Abandon audit session"
        body={
          <div className="flex flex-col gap-4">
            <p>
              {auditToAbandon
                ? `Are you sure you want to abandon "${auditToAbandon.scopeValue || auditToAbandon.scopeType}"? The session is closed and produces no report — it can never be completed afterwards.`
                : ""}
            </p>
            <Input
              label="Why is it being abandoned"
              hint="Required. An abandoned session is a record of a decision not to count, and the reason is part of that record."
              value={abandonReason}
              onChange={(event) => setAbandonReason(event.target.value)}
              required
            />
          </div>
        }
        confirmLabel="Abandon"
        tone="destructive"
      />
    </div>
  );
}
