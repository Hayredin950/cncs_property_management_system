import { Link2, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { SkeletonText } from "../../components/Skeleton";
import { ConditionBadge } from "../../components/StatusBadges";
import { TagPanel } from "../../components/TagPanel";
import { useItemByTagId, useItems } from "../../hooks/useItems";
import {
  useLinkAccessories,
  useRegenerateTag,
  useUnlinkAccessory,
} from "../../hooks/useItemMutations";

/**
 * The two staff-only workbench sections behind the item: the tag workbench
 * (F3.4 download/print, F3.5 regenerate) and the accessory bundle list (F2.2).
 *
 * They live outside `ItemStaffPage` because two pages render them now: the staff
 * workbench `/items/:id`, and `/item/:tagId`'s "staff detail & tag" disclosure.
 * Sharing the components is what keeps the two from drifting — one tag image
 * fetch, one regenerate confirmation, one bundle rule. (The history section is
 * shared the same way, from `ItemHistorySection.tsx`.)
 */

/** QR preview + download + print + regenerate (F3.4, F3.5). */
export function TagRegenerateSection({
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
  // Bumped on every successful regeneration so `TagPanel` knows to re-fetch.
  const [tagVersion, setTagVersion] = useState(0);
  const regenerate = useRegenerateTag(itemId);

  return (
    <div className="flex flex-col gap-3">
      <TagPanel itemId={itemId} tagId={tagId} itemName={itemName} refreshKey={tagVersion} />
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
          regenerate.mutate(undefined, {
            onSuccess: () => setTagVersion((version) => version + 1),
            onSettled: () => setConfirmOpen(false),
          });
        }}
        title="Re-render this tag?"
        loading={regenerate.isPending}
        confirmLabel="Re-render image"
        body={
          <>
            This re-renders and re-caches the QR image for <strong className="tag-id">{tagId}</strong>. The Tag ID and
            the link it encodes do not change, so a sticker already stuck on the item keeps working. Print a fresh copy
            only if the old one is damaged or lost.
          </>
        }
      />
    </div>
  );
}

/** The bundle list (F2.2) — link by tag ID search, unlink inline. */
export function AccessoriesSection({ itemId, tagId }: { itemId: string; tagId: string }) {
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
