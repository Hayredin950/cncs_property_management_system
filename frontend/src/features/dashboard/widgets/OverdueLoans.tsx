import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { WidgetError } from "./WidgetError";
import { useOverdueLoans } from "../../../hooks/useLoans";

/**
 * The Property Officer's "Overdue loans" tile — approved loans past their due
 * date and not returned.
 *
 * A count of **zero** is the good news and the tile hides: a permanent "0 overdue
 * loans" card trains people to stop reading it. A **failed request** is not zero,
 * and hiding it would say the same thing — which is exactly how a 401 from a
 * token-less fetch read as a clean loan register (14 Oct). So a failure renders.
 */
export function OverdueLoans() {
  const { data, isPending, isError, refetch } = useOverdueLoans();

  if (!isPending && !isError && (!data || data.count === 0)) {
    return null;
  }

  return (
    <Card
      className={
        isError
          ? "flex flex-col gap-4"
          : "flex flex-col gap-4 border-warning-200 bg-warning-50"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Overdue loans</h2>
        {!isError && (
          // There is no `/loans` screen — the loans ARE requests, and the
          // requests list already filters by type. The old link pointed at a
          // route that does not exist, so "View all" went nowhere.
          <Link
            to="/requests?type=LOAN"
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            View all →
          </Link>
        )}
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading overdue loans">
          <SkeletonText lines={1} />
        </div>
      ) : isError ? (
        <WidgetError heading="Couldn't load overdue loans — this is unknown, not zero." onRetry={() => void refetch()} />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-100">
            <AlertTriangle className="h-5 w-5 text-warning-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data?.count ?? 0}</p>
            <p className="text-xs text-slate-600">overdue loan{data?.count === 1 ? "" : "s"}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
