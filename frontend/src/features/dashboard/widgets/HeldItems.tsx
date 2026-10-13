import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { useHeldItems } from "../../../hooks/useItems";

export function HeldItems() {
  const { data, isPending, isError } = useHeldItems();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Your held items</h2>
        <Link
          to="/items?mine=true"
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          View all →
        </Link>
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading held items">
          <SkeletonText lines={1} />
        </div>
      ) : isError ? (
        <p className="text-sm text-slate-500">Couldn't load your held items</p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
            <Package className="h-5 w-5 text-brand-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data?.count ?? 0}</p>
            <p className="text-xs text-slate-600">item{data?.count === 1 ? "" : "s"} held by you</p>
          </div>
        </div>
      )}
    </Card>
  );
}
