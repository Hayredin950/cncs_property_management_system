import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { useOpenFindings } from "../../../hooks/useAudits";

export function OpenFindings() {
  const { data, isPending } = useOpenFindings();

  // Widget should only render if count > 0
  if (!isPending && (!data || data.count === 0)) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-4 border-warning-200 bg-warning-50">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Open findings</h2>
        <Link
          to="/audits/findings?status=OPEN"
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          View all →
        </Link>
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading open findings">
          <SkeletonText lines={1} />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-100">
            <AlertTriangle className="h-5 w-5 text-warning-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data?.count ?? 0}</p>
            <p className="text-xs text-slate-600">missing item{data?.count === 1 ? "" : "s"} awaiting review</p>
          </div>
        </div>
      )}
    </Card>
  );
}
