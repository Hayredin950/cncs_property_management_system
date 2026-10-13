import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { SkeletonText } from "../../../components/Skeleton";
import { formatRelativeTime } from "../../../lib/formatters";
import { useRecentItems } from "../../../hooks/useItems";

interface RecentItem {
  id: string;
  name: string;
  tagId: string;
  createdAt: string;
}

export function RecentlyRegisteredItems() {
  const { data, isPending, isError } = useRecentItems({ limit: 5 });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Recently registered items</h2>
        <Link
          to="/items?sort=createdAt:desc"
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          View all →
        </Link>
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading recent items">
          <SkeletonText lines={3} />
        </div>
      ) : isError ? (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          heading="Couldn't load recent items"
          body="There was a problem loading the recently registered items."
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          heading="No items registered yet"
          body="Items registered in the system will appear here."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200">
          {data.map((item: RecentItem) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{item.name}</p>
                <p className="tag-id text-xs text-slate-500">{item.tagId}</p>
              </div>
              <span className="text-xs text-slate-400">
                {formatRelativeTime(item.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
