import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, HelpCircle, MapPinOff } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchAuditSession } from "../../api/audits";
import { saveReport, downloadAuditReport } from "../../api/reports";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { StatCard } from "../../components/StatCard";
import { loadCompletionSummary, loadWalkthrough } from "../../lib/auditWalkthrough";
import { formatDateTimeUTC } from "../../lib/formatters";
import { toast } from "../../lib/toast";
import type { AuditCompletionResponse } from "../../types/audit";

/**
 * `/audit/:id/report` (F9.3) — the completion summary.
 *
 * The summary arrives two ways now, in order of immediacy:
 *
 *   1. Router state (or its `sessionStorage` mirror), set the moment the audit
 *      was completed — instant, no request.
 *   2. `GET /audits/:id`, the read-back that closes gap G1. Before it, a reload
 *      or a direct visit to this URL lost the summary for good because the
 *      server had no way to hand it back.
 *
 * Either source produces the same shape, so nothing below branches on which one
 * won. The counts are always the server's, never recomputed here.
 */
export function AuditReportPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const [downloading, setDownloading] = useState(false);

  const fromState = (location.state as { summary?: AuditCompletionResponse } | null)?.summary;
  const cached = fromState ?? loadCompletionSummary(id);
  const walkthrough = loadWalkthrough(id);

  /**
   * Always fetched when there is an id, even though the counts above may already
   * be in hand. The counts come instantly from the completion response; the
   * per-item breakdown does not, because `found` / `missing` / `locationMismatch`
   * are *item ids* — they carry no name, tag or room. Only `GET /audits/:id`
   * carries those, so the request exists for the table below and the summary
   * above never waits on it.
   */
  const sessionQuery = useQuery({
    queryKey: ["audit", id],
    queryFn: ({ signal }) => fetchAuditSession(id, signal),
    enabled: Boolean(id),
    retry: false,
  });

  /** One stored result row per item, `MISSING` rows included (`scannedAt: null`). */
  const rows = sessionQuery.data?.rows ?? [];

  const summary: AuditCompletionResponse | null = cached
    ? cached
    : sessionQuery.data
      ? {
          auditSessionId: sessionQuery.data.id,
          completedAt: sessionQuery.data.completedAt ?? sessionQuery.data.startedAt,
          counts: sessionQuery.data.counts,
          found: sessionQuery.data.found,
          missing: sessionQuery.data.missing,
          locationMismatch: sessionQuery.data.locationMismatch,
        }
      : null;

  if (!summary) {
    if (id && !sessionQuery.isError && (sessionQuery.isPending || sessionQuery.isFetching)) {
      return (
        <div className="mx-auto flex max-w-2xl flex-col gap-6" role="status" aria-label="Loading audit report">
          <Skeleton className="h-8 w-1/3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit report</h1>
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          heading="This audit session couldn't be loaded"
          body="The session id in the address isn't one this server knows about — it may have been mistyped, or the audit was never started. Check the link, or start a fresh audit."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {walkthrough.scanned.length > 0 && (
                <Link to={`/audit/${id}/scan`}>
                  <Button variant="outline" size="sm">
                    Back to scanning ({walkthrough.scanned.length})
                  </Button>
                </Link>
              )}
              <Link to="/audit/new">
                <Button size="sm">Start a new audit</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const filename = await saveReport(() => downloadAuditReport(id));
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't download the audit report");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit complete</h1>
        <p className="mt-1 text-sm text-slate-500">
          Completed {formatDateTimeUTC(summary.completedAt)}
          {walkthrough.scopeValue ? ` · ${walkthrough.scopeValue}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Found"
          value={summary.counts.found}
          tone="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          label="Missing"
          value={summary.counts.missing}
          tone="warning"
          icon={<HelpCircle className="h-5 w-5" />}
        />
        <StatCard
          label="Outside scope"
          value={summary.counts.locationMismatch}
          tone="danger"
          icon={<MapPinOff className="h-5 w-5" />}
        />
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What these mean</h2>
        <p className="text-sm text-slate-600">
          <strong className="font-semibold text-slate-900">Found</strong> items have had <em>last audited</em>{" "}
          stamped with this completion time. <strong className="font-semibold text-slate-900">Missing</strong> items
          are active items in the audited scope that weren&apos;t scanned;{" "}
          <strong className="font-semibold text-slate-900">outside scope</strong> items were scanned but don&apos;t
          belong to the scope being audited. Every row behind those three numbers is listed below, and those same
          rows are what the CSV export contains.
        </p>
      </Card>

      {/*
        The breakdown the summary counts are made of. It was a documented gap —
        "the audit doesn't give much detail" — because the page showed three
        numbers and pointed at the CSV for anything else, even though the server
        had been storing a row per item all along. Reading it back is one
        request, and nothing here is recomputed: the rows are the server's.
      */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Items in this audit
          </h2>
          {rows.length > 0 && (
            <span className="text-xs text-slate-500">
              {rows.length} row{rows.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {sessionQuery.isPending ? (
          <p className="text-sm text-slate-500" role="status">
            Loading the per-item breakdown…
          </p>
        ) : sessionQuery.isError ? (
          <p className="text-sm text-slate-500">
            The per-item breakdown couldn&apos;t be loaded. The CSV export still contains every row.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No result rows are stored for this session yet. An audit that was started but never completed records
            only the items that were scanned, so there is nothing to classify.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {([
              { result: "FOUND", label: "Found" },
              { result: "MISSING", label: "Missing" },
              { result: "LOCATION_MISMATCH", label: "Outside scope" },
            ] as const).map((group) => {
              const groupRows = rows.filter((row) => row.result === group.result);
              if (groupRows.length === 0) return null;

              return (
                <section key={group.result} className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {group.label} <span className="text-slate-500">({groupRows.length})</span>
                  </h3>
                  <ul className="divide-y divide-slate-100">
                    {groupRows.map((row) => (
                      <li
                        key={`${group.result}-${row.itemId}`}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{row.item.name}</p>
                          <p className="font-mono text-xs text-slate-500">{row.item.tagId}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {[row.item.building, row.item.floor, row.item.room]
                            .filter(Boolean)
                            .join(" · ")} · {row.item.department}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          leftIcon={<Download className="h-4 w-4" />}
          loading={downloading}
          onClick={() => void handleDownload()}
        >
          Download audit CSV
        </Button>
        <Link to="/audit/new">
          <Button type="button">Start another audit</Button>
        </Link>
      </div>
    </div>
  );
}
