import { Building2, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Skeleton } from "../../components/Skeleton";
import { useItems } from "../../hooks/useItems";
import { NetworkError } from "../../types/api";
import type { Item } from "../../types/item";

/**
 * `/map` (F5.2) — buildings as the unit of "where are things?", from the location
 * data every item already carries (`building` / `floor` / `room`).
 *
 * This is deliberately **not** a floorplan: no map tiles or coordinate data exist
 * anywhere in the schema, and inventing a geographic view would be fiction. What
 * it does instead is group the inventory by building and link straight to each
 * item's public page — which is the underlying need ("what's in Building 3?") that
 * F5.1's text location already serves. `/map` was the plan's first cut candidate;
 * it ships as this, and `docs/frontend-phase-3.md` records the shape.
 *
 * Anonymous-visible, like the rest of the public lookup surfaces.
 */
export function MapPage() {
  // The endpoint caps `limit` at 100 (see the backend's items list schema), so this
  // is one page of the register rather than a paginated crawl — documented as a
  // known limit rather than silently showing a subset as if it were everything.
  const itemsQuery = useItems({ page: 1, limit: 100 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Browse by building</h1>
        <p className="mt-1 text-sm text-slate-500">
          Where the registered inventory sits on campus, grouped by the location on each item&apos;s tag.
        </p>
      </div>

      {itemsQuery.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading buildings">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : itemsQuery.isError ? (
        itemsQuery.error instanceof NetworkError ? (
          <OfflineState />
        ) : (
          <ErrorState
            heading="Couldn't load the inventory"
            body={itemsQuery.error instanceof Error ? itemsQuery.error.message : undefined}
            action={
              <Button size="sm" onClick={() => itemsQuery.refetch()}>
                Try again
              </Button>
            }
          />
        )
      ) : itemsQuery.data.data.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          heading="No items registered yet"
          body="Once items are registered their buildings appear here."
          action={
            <Link to="/items">
              <Button size="sm" variant="outline">
                Browse all items
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groupByBuilding(itemsQuery.data.data).map(([building, items]) => (
            <Card key={building} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Building2 className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  {building}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {items.length} {items.length === 1 ? "item" : "items"}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/item/${item.tagId}`}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>
                        <span className="font-medium text-slate-900">{item.name}</span>
                        <span className="block text-xs text-slate-500">
                          {item.department} · {item.floor} · {item.room}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Showing up to 100 items — the first page of the register. Buildings with more items than that are split
        across the list view instead.
      </p>
    </div>
  );
}

/** Buildings, alphabetical, each with its items — the only grouping the location data supports. */
function groupByBuilding(items: Item[]): Array<[string, Item[]]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.building.trim() || "Unspecified building";
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
