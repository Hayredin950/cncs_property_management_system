import { Link2, PackageOpen, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { HistoryList } from "../../components/HistoryList";
import { Input } from "../../components/Input";
import { ItemDetailView } from "../../components/ItemDetailView";
import { Modal } from "../../components/Modal";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { TagPanel } from "../../components/TagPanel";
import { useItemByTagId, useItems } from "../../hooks/useItems";
import {
  useLinkAccessories,
  useRegenerateTag,
  useUnlinkAccessory,
} from "../../hooks/useItemMutations";
import { fetchItemHistory } from "../../api/items";
import { useQuery } from "@tanstack/react-query";
import { ApiError, NetworkError } from "../../types/api";
import { ConditionBadge, ItemStatusBadge } from "../../components/StatusBadges";

/**
 * `/items/:id` — the staff workbench for one item (frontend-design-system.md
 * §10.6): the same `ItemDetailView` the public page renders (one rule, one
 * implementation), plus the TagStickerCard (download/print/regenerate behind a
 * ConfirmDialog), the accessories bundle list (F2.2), and the grouped edit
 * history (F2.3/F6.3).
 *
 * The route param is the UUID, but the data is fetched by tag through
 * `?tag=` — there is no `GET /items/:id` in the built backend (recorded as a
 * spec-vs-backend gap in docs/frontend-phase-1.md).
 */
export function ItemStaffPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = location.state as { tagId?: string } | null;
  const tagId = state?.tagId ?? new URLSearchParams(location.search).get("tag") ?? "";

  const itemQuery = useItemByTagId(tagId || undefined);

  if (!tagId) {
    return (
      <ErrorState
        tone="neutral"
        icon={<PackageOpen className="h-8 w-8" />}
        heading="Open this item from the register"
        body="The staff view loads through an item's tag. Open it from the browse grid or a scan so the tag is available."
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

      <div className="flex flex-wrap gap-2">
        <Link to={`/items/${id}/edit?tag=${encodeURIComponent(item.tagId)}`}>
          <Button variant="outline" size="sm">
            Edit item
          </Button>
        </Link>
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

      <HistorySection itemId={item.id} />
    </div>
  );
}

/** QR preview + download + print + regenerate (F3.4, F3.5). */
function TagRegenerateSection({
  itemId,
  tagId,
  itemName,
  disposed,
}: {
  itemId: string;
  tagId: string;
  itemName: string;
  disposed: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const regenerate = useRegenerateTag(itemId);

  return (
    <div className="flex flex-col gap-3">
      <TagPanel itemId={itemId} tagId={tagId} itemName={itemName} />
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Printer className="h-4 w-4" />}
        onClick={() => window.print()}
        disabled={disposed}
      >
        Print sticker
      </Button>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<RefreshCw className="h-4 w-4" />}
        onClick={() => setConfirmOpen(true)}
        disabled={disposed}
      >
        Regenerate tag
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          regenerate.mutate(undefined, { onSettled: () => setConfirmOpen(false) });
        }}
        title="Regenerate this tag?"
        tone="destructive"
        loading={regenerate.isPending}
        confirmLabel="Regenerate"
        body={
          <>
            This replaces the printed sticker's QR design for <strong className="tag-id">{tagId}</strong>. Any
            sticker already stuck on the item stops working. <strong>The Tag ID itself does not change.</strong>
          </>
        }
      />
    </div>
  );
}

/** The bundle list (F2.2) — link by tag ID search, unlink inline. */
function AccessoriesSection({ itemId, tagId }: { itemId: string; tagId: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<{ id: string; name: string } | null>(null);
  const linkMutation = useLinkAccessories(itemId);
  const unlinkMutation = useUnlinkAccessory(itemId);

  const itemQuery = useItemByTagId(tagId);
  const accessories = itemQuery.data?.accessories ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Accessories ({accessories.length})
        </h2>
        <Button variant="outline" size="sm" leftIcon={<Link2 className="h-4 w-4" />} onClick={() => setPickerOpen(true)}>
          Link accessory
        </Button>
      </div>

      {accessories.length === 0 ? (
        <Card className="text-sm text-slate-500">
          No accessories linked. Bundles answer "did the laptop have a bag?" — link the accessory item here.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {accessories.map((accessory) => (
            <li
              key={accessory.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-slate-900">{accessory.name}</span>
                <span className="tag-id text-xs text-slate-500">{accessory.tagId}</span>
              </span>
              <span className="flex items-center gap-2">
                <ConditionBadge condition={accessory.condition} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmUnlink({ id: accessory.id, name: accessory.name })}
                >
                  Unlink
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <AccessoryPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(accessoryId) => {
          linkMutation.mutate([accessoryId], { onSettled: () => setPickerOpen(false) });
        }}
        excludeIds={[itemId, ...accessories.map((a) => a.id)]}
        loading={linkMutation.isPending}
      />

      <ConfirmDialog
        open={confirmUnlink !== null}
        onClose={() => setConfirmUnlink(null)}
        onConfirm={() => {
          if (confirmUnlink) {
            unlinkMutation.mutate(confirmUnlink.id, { onSettled: () => setConfirmUnlink(null) });
          }
        }}
        title="Unlink this accessory?"
        tone="destructive"
        loading={unlinkMutation.isPending}
        confirmLabel="Unlink"
        body={
          <>
            <strong>{confirmUnlink?.name}</strong> will no longer be part of {tagId}'s bundle. The accessory item
            itself is not deleted or disposed.
          </>
        }
      />
    </section>
  );
}

/** Picks an existing item to link — bundles reference items, never create them (backend D6 note). */
function AccessoryPickerModal({
  open,
  onClose,
  onPick,
  excludeIds,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (itemId: string) => void;
  excludeIds: string[];
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const itemsQuery = useItems({ page: 1, limit: 20, ...(search.trim() ? { search: search.trim() } : {}) });

  const candidates = (itemsQuery.data?.data ?? []).filter((item) => !excludeIds.includes(item.id));

  return (
    <Modal open={open} onClose={onClose} title="Link an accessory" size="md">
      <div className="flex flex-col gap-3">
        <Input label="Search by name or tag ID" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="max-h-72 overflow-y-auto">
          {itemsQuery.isPending ? (
            <SkeletonText lines={4} />
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No matching items.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onPick(candidate.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{candidate.name}</span>
                      <span className="tag-id block text-xs text-slate-500">{candidate.tagId}</span>
                    </span>
                    <ConditionBadge condition={candidate.condition} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Bundles are one level deep: an accessory cannot have its own accessories (server-enforced).
        </p>
      </div>
    </Modal>
  );
}

/** Grouped edit history (F2.3, F6.3) over GET /items/:id/history. */
function HistorySection({ itemId }: { itemId: string }) {
  const historyQuery = useQuery({
    queryKey: ["item-history", itemId],
    queryFn: ({ signal }) => fetchItemHistory(itemId, { limit: 50 }, signal),
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Edit history</h2>
      {historyQuery.isError ? (
        <ErrorState
          heading="Couldn't load the edit history"
          body={historyQuery.error instanceof ApiError ? historyQuery.error.message : undefined}
          action={
            <Button size="sm" onClick={() => historyQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <HistoryList entries={historyQuery.data?.entries ?? []} loading={historyQuery.isPending} />
      )}
    </section>
  );
}
