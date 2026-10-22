import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { WidgetError } from "./WidgetError";
import { SkeletonText } from "../../../components/Skeleton";
import { formatRelativeTime } from "../../../lib/formatters";
import { useAuditHistoryList } from "../../../hooks/useAudits";

/**
 * The auditor's dashboard card: the last few audit sessions, from GET /audits.
 *
 * The rows are AuditSessionSummary — the same shape the /audits page renders —
 * because this card and that page now read the same query. It used to guess at a
 * flatter shape (scope, type) that the API has never returned, which is part of
 * why the widget answered "No audits completed yet" whatever the server said (see
 * useAuditHistoryList).
 *
 * An unfinished session is shown as such rather than hidden: an audit someone
 * started and walked away from is the one worth noticing.
 */
export function AuditHistoryQuickList() {
  const { data, isPending, isError, refetch } = useAuditHistoryList();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Audit history</h2>
        <Link
          to="/audits"
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          View all →
        </Link>
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading audit history">
          <SkeletonText lines={3} />
        </div>
      ) : isError ? (
        /*
          A failed request is reported as a failed request. The previous version
          caught every error and returned an empty list, which is how a 401 and a
          parse failure both came out as "No audits completed yet".
        */
        <WidgetError
          heading="Couldn't load audit history"
          body="There was a problem loading the audit history. Your audit records are not affected — try again in a moment."
          onRetry={() => void refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          heading="No audits completed yet"
          body="Completed audits will appear here."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200">
          {data.map((audit) => (
            <li
              key={audit.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  <Link
                    to={`/audit/${audit.id}/report`}
                    className="underline-offset-4 hover:underline"
                  >
                    {audit.scopeValue || audit.scopeType}
                  </Link>
                </p>
                <p className="text-xs text-slate-500">
                  {audit.runBy.fullName}
                  {/* The three states, in the words the register uses. An
                      abandoned session produced no report, and saying "in
                      progress" about it would be a lie — it is closed. */}
                  {audit.completed
                    ? ""
                    : audit.abandoned
                      ? " · abandoned"
                      : " · in progress"}
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {formatRelativeTime(audit.completedAt ?? audit.startedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
