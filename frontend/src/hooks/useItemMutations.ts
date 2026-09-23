import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createItem,
  deleteItem,
  linkAccessories,
  regenerateTag,
  unlinkAccessory,
  updateItem,
  type CreateItemPayload,
} from "../api/items";
import type { Item } from "../types/item";
import { toast } from "../lib/toast";

/**
 * Every mutation toasts and invalidates the affected queries (frontend-plan.md
 * §8). Items are cached under ["items", …] / ["item", …]; accessory and edit
 * changes also touch history, so ["item-history"] is invalidated alongside.
 */
export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateItemPayload) => createItem(payload),
    onSuccess: (item) => {
      toast.success(`Item registered — tag ${item.tagId}`);
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't register the item"),
  });
}

export function useUpdateItem(itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<CreateItemPayload>) => updateItem(itemId, payload),
    onSuccess: () => {
      toast.success("Item updated");
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["item-history"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't update the item"),
  });
}

/**
 * Admin-only removal of an item and everything hanging off it.
 *
 * Deliberately *not* the disposal path — retiring an asset is a `DISPOSAL`
 * request that keeps the record, and this is the data-correction escape hatch
 * (see `api/items.ts`). The server re-checks the role, so a staff-side render of
 * the button would be a UI bug, not a security hole.
 *
 * The toast names the tag because the row is gone afterwards: the tag is the
 * only thing left to quote in a ticket. There is no navigate here — callers
 * differ (the browse grid stays put, the item page has nowhere to return to).
 */
export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteItem(itemId),
    onSuccess: (deleted) => {
      const alsoGone = deleted.deletedRequestCount + deleted.deletedEditLogCount;
      toast.success(
        alsoGone > 0
          ? `Deleted ${deleted.tagId} — ${alsoGone} related record${alsoGone === 1 ? "" : "s"} removed with it.`
          : `Deleted ${deleted.tagId}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      // Every cached item is potentially the deleted one, and the cache is keyed
      // by tag id, so the whole family goes rather than guessing.
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["item-history"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't delete the item"),
  });
}

export function useLinkAccessories(parentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accessoryItemIds: string[]) => linkAccessories(parentId, accessoryItemIds),
    onSuccess: (outcome) => {
      const linked = outcome.linkedItemIds?.length ?? 0;
      const already = outcome.alreadyLinkedItemIds?.length ?? 0;
      if (linked > 0) toast.success(`Linked ${linked} accessory${linked === 1 ? "" : "ies"}.`);
      if (already > 0) toast.info(`${already} ${already === 1 ? "was" : "were"} already linked to this item.`);
      if (linked === 0 && already === 0) toast.info("Nothing new to link.");
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["item-history"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't link the accessory"),
  });
}

export function useUnlinkAccessory(parentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accessoryId: string) => unlinkAccessory(parentId, accessoryId),
    onSuccess: () => {
      toast.success("Accessory unlinked.");
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["item-history"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't unlink the accessory"),
  });
}

export function useRegenerateTag(itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regenerateTag(itemId),
    onSuccess: () => {
      toast.success("Tag regenerated — print the new sticker. The Tag ID did not change.");
      void queryClient.invalidateQueries({ queryKey: ["item"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't regenerate the tag"),
  });
}

export type { Item };
