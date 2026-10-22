import { Link } from "react-router-dom";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { SkeletonText } from "../../../components/Skeleton";
import { useActiveAudit } from "../../../hooks/useAudits";

export function CurrentAuditProgress() {
  const { data, isPending, isError } = useActiveAudit();
  /*
    A session over a department with no in-scope rows reports `total: 0`, and
    `0 / 0` is `NaN` — which Tailwind passes through as an invalid `width` and the
    browser renders as a full-width bar. An empty scope is a real state (the
    walkthrough starts before anything is scanned), so it gets an empty bar.
  */
  const percent = data && data.total > 0 ? (data.scanned / data.total) * 100 : 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Current audit</h2>
        {data && (
          <Link
            to={`/audit/${data.id}/report`}
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            View report →
          </Link>
        )}
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading audit progress">
          <SkeletonText lines={2} />
        </div>
      ) : isError ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8" />}
          heading="Couldn't load audit progress"
          body="There was a problem loading the current audit session."
        />
      ) : !data ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8" />}
          heading="No active audit"
          body="Start a new audit session to begin scanning items."
          action={
            <Link
              to="/audit/new"
              className="inline-flex items-center justify-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              Start new audit
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* The next thing an auditor does. The tile used to link only to the
              report, so the way back into the walkthrough was two clicks away
              and the tile looked like a dead end. */}
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/audit/${data.id}/scan`}
              className="inline-flex items-center justify-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              Continue scanning
            </Link>
            <Link
              to={`/audit/${data.id}/report`}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              See the report
            </Link>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Scope:</span>
            <span className="font-medium text-slate-900">{data.scope}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Progress:</span>
            <span className="font-medium text-slate-900">
              {data.scanned} / {data.total} scanned
            </span>
          </div>
          {/* The shape of the audit so far, without opening the report. An
              auditor walking a department wants to know whether anything is
              missing, and that is the one number the tile used to hide. */}
          {data.missing > 0 ? (
            <p className="flex items-center gap-2 rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning-600" aria-hidden="true" />
              <span>
                <strong className="font-semibold">{data.missing}</strong> item
                {data.missing === 1 ? "" : "s"} missing
                {data.total - data.scanned > 0
                  ? ` · ${data.total - data.scanned} still to scan`
                  : ""}
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Nothing missing so far.
            </p>
          )}
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${percent}%` }}
              role="progressbar"
              aria-valuenow={data.scanned}
              aria-valuemin={0}
              aria-valuemax={data.total}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
