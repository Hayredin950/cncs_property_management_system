import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  Lock,
  MapPinOff,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchAuditSession } from "../../api/audits";
import { describeDownloadFailure, downloadAuditReport, saveReport } from "../../api/reports";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { StatCard } from "../../components/StatCard";
import { useAcknowledgeAudit } from "../../hooks/useAudits";
import { loadCompletionSummary, loadWalkthrough } from "../../lib/auditWalkthrough";
import { cn } from "../../lib/cn";
import { formatDateTimeUTC } from "../../lib/formatters";
import { canAcknowledgeAudit } from "../../lib/permissions";
import { toast } from "../../lib/toast";
import type { AuditCompletionResponse } from "../../types/audit";
import type { ReportFormat } from "../../types/report";

interface ResultGroup {
  result: string;
  label: string;
  icon: ReactNode;
  heading: string;
}

const RESULT_GROUPS: readonly ResultGroup[] = [
  {
    result: "FOUND",
    label: "Found",
    icon: <CheckCircle2 className="h-4 w-4" />,
    heading: "bg-success-50 text-success-700 border-success-600",
  },
  {
    result: "NOT_ACCESSIBLE",
    label: "Not accessible",
    icon: <Lock className="h-4 w-4" />,
    heading: "bg-slate-100 text-slate-700 border-slate-600",
  },
  {
    result: "CHECK_AGAIN",
    label: "Check again",
    icon: <Clock className="h-4 w-4" />,
    heading: "bg-blue-50 text-blue-700 border-blue-600",
  },
  {
    result: "MISSING",
    label: "Missing",
    icon: <HelpCircle className="h-4 w-4" />,
    heading: "bg-warning-50 text-warning-700 border-warning-600",
  },
  {
    result: "LOCATION_MISMATCH",
    label: "Outside scope",
    icon: <MapPinOff className="h-4 w-4" />,
    heading: "bg-danger-50 text-danger-700 border-danger-600",
  },
  {
    result: "NOT_LOCATED",
    label: "Not located",
    icon: <HelpCircle className="h-4 w-4" />,
    heading: "bg-amber-50 text-amber-700 border-amber-600",
  },
];

export function AuditReportPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);
  const [acknowledgeConfirmOpen, setAcknowledgeConfirmOpen] = useState(false);

  const fromState = (location.state as { summary?: AuditCompletionResponse } | null)?.summary;
  const cached = fromState ?? loadCompletionSummary(id);
  const walkthrough = loadWalkthrough(id);

  const sessionQuery = useQuery({
    queryKey: ["audit", id],
    queryFn: ({ signal }) => fetchAuditSession(id, signal),
    enabled: Boolean(id),
    retry: false,
  });

  const acknowledgeMutation = useAcknowledgeAudit(id);

  const sessionData = sessionQuery.data;
  const rows = sessionData?.rows ?? [];

  const summary = cached
    ? cached
    : sessionData
      ? {
          auditSessionId: sessionData.id,
          completedAt: sessionData.completedAt ?? sessionData.startedAt,
          counts: sessionData.counts,
          found: sessionData.found,
          missing: sessionData.missing,
          locationMismatch: sessionData.locationMismatch,
        }
      : null;

  if (!summary && sessionQuery.isLoading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6" role="status" aria-label="Loading audit report">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!summary && !sessionData) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit report</h1>
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8 text-danger-600" />}
          heading="Audit report couldn't be loaded"
          body="The audit session could not be found or has not been created yet."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/audits">
                <Button size="sm">Back to audits</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  async function handleDownload(format: ReportFormat) {
    setDownloading(format);
    try {
      const filename = await saveReport(() => downloadAuditReport(id, format));
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(describeDownloadFailure(err, "the audit report"));
    } finally {
      setDownloading(null);
    }
  }

  async function handleAcknowledge() {
    try {
      await acknowledgeMutation.mutateAsync();
      setAcknowledgeConfirmOpen(false);
    } catch {
      // Toast handles error
    }
  }

  const isCompleted = sessionData?.status === "COMPLETED";
  const isAcknowledged = sessionData?.status === "ACKNOWLEDGED";
  const isSorting = sessionData?.status === "SORTING";
  const canAcknowledge = canAcknowledgeAudit(user?.role);

  const reportNumber = sessionData?.reportNumber;
  const counts =
    (sessionData?.frozenReport ? sessionData.counts : summary?.counts) ||
    sessionData?.counts || { found: 0, missing: 0, locationMismatch: 0 };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Audit complete</h1>
            {reportNumber && (
              <span className="font-mono text-sm font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded border border-indigo-200">
                {reportNumber}
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                isAcknowledged
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : isCompleted
                    ? "bg-blue-100 text-blue-800 border border-blue-300"
                    : isSorting
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-slate-100 text-slate-800",
              )}
            >
              {isAcknowledged
                ? "Signed Off & Acknowledged"
                : isCompleted
                  ? "Official Frozen Report"
                  : isSorting
                    ? "Sorting Phase"
                    : "Walk in Progress"}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Scope: <strong className="text-slate-800">{sessionData?.scopeValue || walkthrough.scopeValue || "Scope"}</strong> ·{" "}
            {sessionData?.completedAt ? `Completed ${formatDateTimeUTC(sessionData.completedAt)}` : "In Progress"}
            {sessionData?.runBy && ` · Auditor: ${sessionData.runBy.fullName}`}
          </p>
        </div>

        {isSorting && (
          <Link to={`/audit/${id}/sort`}>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Open Sorting Workbench
            </Button>
          </Link>
        )}
      </div>

      {/* Scope & Exclusions Banner */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600 shadow-sm">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-slate-800 text-sm">Official Audit Scope Snapshot</span>
            <p>
              Snapshot Total: <strong>{sessionData?.snapshotTotalCount ?? rows.length} items</strong> frozen into scope at
              audit opening. Lost, Disposed, and Voided items were permanently excluded.
              {sessionData?.excludedAuditorCount !== undefined && sessionData.excludedAuditorCount > 0 && (
                <span className="ml-1 text-slate-700 font-medium">
                  ({sessionData.excludedAuditorCount} item(s) held by auditors excluded to prevent self-auditing).
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Property Officer Sign-off Card */}
      {isCompleted && canAcknowledge && (
        <Card className="border-2 border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <UserCheck className="mt-0.5 h-6 w-6 shrink-0 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900">Property Officer Formal Sign-Off</h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Review the locked audit report below. Acknowledging verifies physical audit completion and officially
                  records the results.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setAcknowledgeConfirmOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap"
            >
              Acknowledge & Sign Off
            </Button>
          </div>
        </Card>
      )}

      {isAcknowledged && sessionData?.acknowledgedBy && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <strong className="font-semibold text-sm">Formally Acknowledged & Signed Off</strong>
            <p className="text-emerald-800">
              Signed by Property Officer <strong>{sessionData.acknowledgedBy.fullName}</strong> on{" "}
              {formatDateTimeUTC(sessionData.acknowledgedAt)}.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Found" value={counts.found} tone="success" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard
          label="Not Accessible"
          value={counts.notAccessible || 0}
          tone="neutral"
          icon={<Lock className="h-5 w-5" />}
        />
        <StatCard
          label="Check Again"
          value={counts.checkAgain || 0}
          tone="neutral"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Missing"
          value={counts.missing}
          tone={counts.missing > 0 ? "danger" : "neutral"}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <StatCard
          label="Outside scope"
          value={counts.locationMismatch}
          tone="danger"
          icon={<MapPinOff className="h-5 w-5" />}
        />
        <StatCard
          label="Unsorted"
          value={counts.notLocated || 0}
          tone="warning"
          icon={<HelpCircle className="h-5 w-5" />}
        />
      </div>

      {/* Explanation of Statuses */}
      <Card className="flex flex-col gap-2 p-4 text-xs text-slate-600">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status Classification Rules</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 list-disc pl-4 text-slate-600">
          <li>
            <strong className="text-slate-800">Found:</strong> Verified on site; <em>lastAuditedAt</em> updated.
          </li>
          <li>
            <strong className="text-slate-800">Not Accessible:</strong> Locked room or holder temporarily away.
          </li>
          <li>
            <strong className="text-slate-800">Check Again:</strong> Slated for follow-up verification round.
          </li>
          <li>
            <strong className="text-slate-800">Missing:</strong> Confirmed lost; triggers Property Officer investigation.
          </li>
          <li>
            <strong className="text-slate-800">Outside Scope:</strong> Scanned item registered to a different department/building.
          </li>
        </ul>
      </Card>

      {/* Breakdown by Category */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Items in this audit</h2>
          <span className="text-xs text-slate-500">
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<HelpCircle className="h-8 w-8 text-slate-400" />}
            heading="No item breakdown available"
            body="No individual result rows were recorded for this session."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {RESULT_GROUPS.map((group) => {
              const groupRows = rows.filter((row) => row.result === group.result);
              if (groupRows.length === 0) return null;

              return (
                <section key={group.result} className="overflow-hidden rounded-md border border-slate-200">
                  <h3 className={cn("flex items-center gap-2 border-l-4 px-3 py-2 text-sm font-semibold", group.heading)}>
                    <span className="shrink-0">{group.icon}</span>
                    {group.label} <span className="font-normal opacity-80">({groupRows.length})</span>
                  </h3>
                  <ul className="divide-y divide-slate-100 px-3">
                    {groupRows.map((row) => (
                      <li
                        key={`${group.result}-${row.itemId}`}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{row.item.name}</p>
                          <p className="font-mono text-xs text-slate-500">{row.item.tagId}</p>
                          {row.sortReason && (
                            <p className="mt-0.5 text-xs text-slate-600">
                              Reason: <span className="font-medium text-slate-800">{row.sortReason}</span>
                              {row.checkAgainDays && ` (retry in ${row.checkAgainDays} days)`}
                              {row.sortNote && ` — ${row.sortNote}`}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {[row.item.building, row.item.floor, row.item.room].filter(Boolean).join(" · ")} ·{" "}
                          {row.item.department}
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

      {/* Export & Actions Footer */}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          leftIcon={<FileText className="h-4 w-4" />}
          loading={downloading === "pdf"}
          disabled={downloading !== null && downloading !== "pdf"}
          onClick={() => void handleDownload("pdf")}
        >
          Download audit PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          leftIcon={<Download className="h-4 w-4" />}
          loading={downloading === "csv"}
          disabled={downloading !== null && downloading !== "csv"}
          onClick={() => void handleDownload("csv")}
        >
          Download audit CSV
        </Button>
        <Link to="/audits">
          <Button variant="outline" type="button">
            Audit History
          </Button>
        </Link>
        <Link to="/audit/new">
          <Button type="button">Start New Audit</Button>
        </Link>
      </div>

      {/* Property Officer Sign-off Confirm Dialog */}
      <ConfirmDialog
        open={acknowledgeConfirmOpen}
        onClose={() => setAcknowledgeConfirmOpen(false)}
        onConfirm={() => void handleAcknowledge()}
        title="Sign Off & Acknowledge Audit Report?"
        body={
          <div className="flex flex-col gap-2">
            <p>
              As Property Officer, acknowledging this report formally validates the physical audit results and logs your
              electronic signature on report <strong>{reportNumber || id}</strong>.
            </p>
            {counts.missing > 0 && (
              <p className="text-xs font-semibold text-danger-700">
                Notice: {counts.missing} item(s) are officially confirmed missing and will require Property Office loss
                investigation.
              </p>
            )}
          </div>
        }
        confirmLabel="Confirm & Sign Off"
        loading={acknowledgeMutation.isPending}
      />
    </div>
  );
}
