import { PackageOpen } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { ItemActions } from "../../components/ItemActions";
import { ItemDetailView } from "../../components/ItemDetailView";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { useItemById } from "../../hooks/useItems";
import { NetworkError } from "../../types/api";
import { ConditionBadge, ItemStatusBadge } from "../../components/StatusBadges";
import { ItemHistorySection } from "./ItemHistorySection";
import { AccessoriesSection, TagRegenerateSection } from "./ItemStaffSections";

/**
 * `/items/:id` — the staff workbench for one item (frontend-design-system.md
 * §10.6): the same `ItemDetailView` the public page renders (one rule, one
 * implementation), plus the tag workbench (download/print/regenerate behind a
 * ConfirmDialog), the accessories bundle list (F2.2), and the grouped edit
 * history (F2.3/F6.3) — the last three shared with the `/item/:tagId`
 * disclosure through `ItemStaffSections.tsx` and `ItemHistorySection.tsx`.
 *
 * The data is now fetched by the item's own id through `GET /items/:id` (the
 * backend resolves either a uuid or a tag id on that path), so the `:id` in the
 * URL is what loads the page. Before that endpoint existed this route carried a
 * `?tag=` around just to resolve itself, which is why a bare `/items/<uuid>`
 * used to dead-end on "open this from the register".
 */
export function ItemStaffPage() {
  const { id } = useParams<{ id: string }>();

  const itemQuery = useItemById(id);

  if (!id) {
    return (
      <ErrorState
        tone="neutral"
        icon={<PackageOpen className="h-8 w-8" />}
        heading="Open this item from the register"
        body="The staff view loads an item by its id. Open it from the browse grid or a scan."
        action={
          <Link to="/items">
            <Button size="sm" variant="outline">
              Browse items
            </Button>
          </Link>
        }
      />
    );
  }

  if (itemQuery.isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]" role="status" aria-label="Loading item">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-2/3" />
          <SkeletonText lines={3} />
        </div>
      </div>
    );
  }

  if (itemQuery.isError) {
    return itemQuery.error instanceof NetworkError ? (
      <OfflineState />
    ) : (
      <ErrorState
        heading="Couldn't load this item"
        body={itemQuery.error instanceof Error ? itemQuery.error.message : undefined}
        action={
          <Button size="sm" onClick={() => itemQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const item = itemQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{item.name}</h1>
          <p className="tag-id mt-0.5 text-xs text-slate-500">{item.tagId}</p>
        </div>
        <div className="flex items-center gap-2">
          <ConditionBadge condition={item.condition} />
          {item.status && <ItemStatusBadge status={item.status} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          The same role-gated Edit the item page and the browse cards use, so
          "who may edit" has one implementation. Nothing here deletes — an item
          leaves the active register through the disposal request below, which
          keeps its record (F7.2).
        */}
        <ItemActions item={item} />
        <Link to={`/requests/new?item=${encodeURIComponent(item.tagId)}`}>
          <Button variant="outline" size="sm">
            File transfer / disposal
          </Button>
        </Link>
        <Link to={`/item/${item.tagId}`}>
          <Button variant="ghost" size="sm">
            Public view
          </Button>
        </Link>
      </div>

      <ItemDetailView item={item} />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <TagRegenerateSection itemId={item.id} tagId={item.tagId} itemName={item.name} disposed={item.status === "DISPOSED"} />
        <AccessoriesSection itemId={item.id} tagId={item.tagId} />
      </div>

      <ItemHistorySection itemId={item.id} />
    </div>
  );
}
