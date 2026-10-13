import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { SkeletonText } from "../../../components/Skeleton";
import { formatRelativeTime } from "../../../lib/formatters";
import { useAuditHistoryList } from "../../../hooks/useAudits";

export function AuditHistoryQuickList() {
  const { data, isPending, isError } = useAuditHistoryList();

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
        <EmptyState
          icon={<History className="h-8 w-8" />}
          heading="Couldn't load audit history"
          body="There was a problem loading the audit history."
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          heading="No audits completed yet"
          body="Completed audits will appear here."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200">
          {data.map((audit: { id: string; scope: string; type: string; completedAt: string }) => (
            <li
              key={audit.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{audit.scope}</p>
                <p className="text-xs text-slate-500">{audit.type}</p>
              </div>
              <span className="text-xs text-slate-400">
                {formatRelativeTime(audit.completedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
