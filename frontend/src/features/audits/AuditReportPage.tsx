import { AlertTriangle, CheckCircle2, Download, HelpCircle, MapPinOff } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { saveReport, downloadAuditReport } from "../../api/reports";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { loadCompletionSummary, loadWalkthrough } from "../../lib/auditWalkthrough";
import { formatDateTimeUTC } from "../../lib/formatters";
import { toast } from "../../lib/toast";
import type { AuditCompletionResponse } from "../../types/audit";

/**
 * `/audit/:id/report` (F9.3) — the completion summary, exactly as the completion
 * endpoint returned it.
 *
 * The counts are **not** recomputed here. There is no `GET /audits/:id` (gap G1),
 * so the summary arrives through router state from the scan page and is mirrored
 * into `sessionStorage`; a direct visit to this URL without either shows the
 * "not available" state rather than guessing. Per-item detail is deliberately not
 * fetched — a `MISSING` row carries no item data, so the CSV export is the
 * breakdown, and the page says so instead of rendering a half-list.
 */
export function AuditReportPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const [downloading, setDownloading] = useState(false);

  const fromState = (location.state as { summary?: AuditCompletionResponse } | null)?.summary;
  const summary = fromState ?? loadCompletionSummary(id);
  const walkthrough = loadWalkthrough(id);

  if (!summary) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit report</h1>
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          heading="This session's summary isn't available"
          body="The API has no endpoint for reading a finished audit back (gap G1), so the summary exists only right after the audit is completed. Complete the audit again to see it, or start a fresh one."
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
          label="Wrong location"
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
          are active items in the audited department that weren&apos;t scanned;{" "}
          <strong className="font-semibold text-slate-900">wrong location</strong> items were scanned but don&apos;t
          belong to it. The per-item breakdown — tag, room and result for each row — is in the CSV export, not on
          this page.
        </p>
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
