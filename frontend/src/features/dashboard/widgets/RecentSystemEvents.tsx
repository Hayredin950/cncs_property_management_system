import { AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { WidgetError } from "./WidgetError";
import { SkeletonText } from "../../../components/Skeleton";
import { formatRelativeTime } from "../../../lib/formatters";
import { useRecentSystemEvents } from "../../../hooks/useSystem";

/**
 * The account log, on the System Admin's dashboard.
 *
 * A dashboard is not a log. The widget shows the **last few** events and a way
 * to the rest of them — a dashboard that fills itself with a hundred rows of
 * "account approved" is a list wearing a dashboard's clothes, and the rows at
 * the bottom are the ones nobody reads.
 */
export function RecentSystemEvents() {
  const { data, isPending, isError, refetch } = useRecentSystemEvents(5);
  const events = data?.events ?? [];
  const total = data?.total ?? 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Recent system events</h2>
        {total > events.length && (
          <Link to="/admin/events">
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
              See all {total}
            </Button>
          </Link>
        )}
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading system events">
          <SkeletonText lines={3} />
        </div>
      ) : isError ? (
        <WidgetError
          heading="Couldn't load system events"
          body="There was a problem loading recent system events."
          onRetry={() => void refetch()}
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          heading="No recent system events"
          body="Failed logins, errors, and migration events will appear here."
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-slate-200">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{event.type}</p>
                  <p className="text-xs text-slate-500">{event.message}</p>
                </div>
                <span className="text-xs text-slate-400">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </li>
            ))}
          </ul>
          {total > events.length && (
            <Link
              to="/admin/events"
              className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              See all {total} events →
            </Link>
          )}
        </>
      )}
    </Card>
  );
}
