import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createItem,
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
      toast.success("Tag image re-rendered. The Tag ID and its link are unchanged.");
      void queryClient.invalidateQueries({ queryKey: ["item"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't regenerate the tag"),
  });
}

export type { Item };
