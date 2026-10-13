import { AlertCircle } from "lucide-react";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { SkeletonText } from "../../../components/Skeleton";
import { formatRelativeTime } from "../../../lib/formatters";
import { useRecentSystemEvents } from "../../../hooks/useSystem";

interface SystemEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export function RecentSystemEvents() {
  const { data, isPending, isError } = useRecentSystemEvents();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Recent system events</h2>
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading system events">
          <SkeletonText lines={3} />
        </div>
      ) : isError ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          heading="Couldn't load system events"
          body="There was a problem loading recent system events."
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          heading="No recent system events"
          body="Failed logins, errors, and migration events will appear here."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200">
          {data.map((event: SystemEvent) => (
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
      )}
    </Card>
  );
}
