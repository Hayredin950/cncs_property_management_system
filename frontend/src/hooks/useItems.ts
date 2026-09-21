import { useQuery } from "@tanstack/react-query";
import { fetchItemByTagId, fetchItems } from "../api/items";
import type { ItemsListQuery } from "../types/item";

export function useItems(query: ItemsListQuery) {
  return useQuery({
    queryKey: ["items", query],
    queryFn: ({ signal }) => fetchItems(query, signal),
    placeholderData: (previous) => previous,
  });
}

/**
 * `enabled: Boolean(tagId)` guards the route param edge case, and `retry: false`
 * means a `404`/`410` renders immediately as the designed state (frontend-plan.md
 * §7) instead of the query hook retrying a real, final answer.
 */
export function useItemByTagId(tagId: string | undefined) {
  return useQuery({
    queryKey: ["item", "byTagId", tagId],
    queryFn: ({ signal }) => fetchItemByTagId(tagId as string, signal),
    enabled: Boolean(tagId),
    retry: false,
  });
}
