import { Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "../../components/Input";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { SkeletonText } from "../../components/Skeleton";
import type { ItemStatus } from "../../types/enums";
import { fetchCatalog } from "../../api/catalog";
import { useQuery } from "@tanstack/react-query";
import { NetworkError } from "../../types/api";
import { ItemStatusBadge } from "../../components/StatusBadges";

/**
 * `/catalog` (§9.1) — Staff restricted catalog browse
 *
 * Shows: item name, category, general location (building only), current status
 * Hides: cost, custodian, exact room
 *
 * This is a dedicated endpoint for Staff to identify items for requests without
 * seeing sensitive information like cost or exact room location.
 */
export function CatalogPage() {
  const [search, setSearch] = useState("");

  const catalogQuery = useQuery({
    queryKey: ["catalog"],
    queryFn: fetchCatalog,
  });

  const filteredItems = catalogQuery.data?.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.tagId.toLowerCase().includes(search.toLowerCase()) ||
    item.category.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Catalog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Browse available items by name, tag ID, or category. Use this to identify items for transfer or loan requests.
        </p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            label="Search"
            placeholder="Search by name, tag ID, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {catalogQuery.isPending ? (
        <div role="status" aria-label="Loading catalog">
          <SkeletonText lines={8} />
        </div>
      ) : catalogQuery.isError ? (
        catalogQuery.error instanceof NetworkError ? (
          <OfflineState />
        ) : (
          <ErrorState
            heading="Couldn't load catalog"
            body={catalogQuery.error instanceof Error ? catalogQuery.error.message : undefined}
          />
        )
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          heading={search ? "No items match your search" : "No items in catalog"}
          body={search ? "Try a different search term or clear the filter." : "Items will appear here once they are registered."}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Link key={item.id} to={`/items?mine=true`}>
              <Card className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 truncate">{item.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">{item.tagId}</p>
                  </div>
                  <ItemStatusBadge status={item.status as ItemStatus} />
                </div>
                <div className="flex flex-col gap-1 text-sm text-slate-600">
                  <div>
                    <span className="font-medium">Category:</span> {item.category.name}
                  </div>
                  {item.building && (
                    <div>
                      <span className="font-medium">Building:</span> {item.building.name}
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
