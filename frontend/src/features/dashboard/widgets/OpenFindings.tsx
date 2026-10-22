import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { WidgetError } from "./WidgetError";
import { useOpenFindings } from "../../../hooks/useAudits";

/**
 * The Auditor's \"Open findings\" tile — items marked MISSING inside their grace
 * window.
 *
 * Two states, and the difference between them is the whole point of this
 * component. A count of **zero** means the good news and the tile renders nothing:
 * a permanent \"0 findings\" banner trains people to stop reading it. A **failed
 * request** is not zero, and hiding it would say the same thing as an empty list —
 * which is exactly how a 404 from an unreachable route read as a clean audit
 * history (14 Oct). So a failure renders, and says what it does not know.
 */
export function OpenFindings() {
  const { data, isPending, isError, refetch } = useOpenFindings();

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
        <h2 className="text-base font-semibold text-slate-900">Open findings</h2>
        {!isError && (
          /*
            `/audits`, not `/audits/findings?status=OPEN`: nothing declares that
            route, so the link was a 404 for the one action on the tile. Findings
            are per-session rows, so the history is where they can actually be
            reached; a dedicated screen is a page to build, not a link to invent.
          */
          <Link
            to="/audits"
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            View all →
          </Link>
        )}
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading open findings">
          <SkeletonText lines={1} />
        </div>
      ) : isError ? (
        <WidgetError heading="Couldn't load open findings — this is unknown, not zero." onRetry={() => void refetch()} />
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
