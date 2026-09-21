import { Link } from "react-router-dom";
import type { Item } from "../types/item";
import { PhotoFrame } from "./PhotoFrame";
import { ConditionBadge } from "./StatusBadges";

/** Used on `/` and `/items` — one card component, so both lists render identically. */
export function ItemCard({ item }: { item: Item }) {
  return (
    <Link
      to={`/item/${item.tagId}`}
      className={[
        "group flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm",
        "transition-shadow hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
      ].join(" ")}
    >
      <PhotoFrame src={item.photoUrl} alt={item.name} />
      <div>
        <h3 className="line-clamp-1 font-semibold text-slate-900 group-hover:text-brand-700">{item.name}</h3>
        <p className="tag-id mt-0.5 text-xs text-slate-500">{item.tagId}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConditionBadge condition={item.condition} />
        <span className="line-clamp-1 text-xs text-slate-500">{item.department}</span>
      </div>
    </Link>
  );
}
