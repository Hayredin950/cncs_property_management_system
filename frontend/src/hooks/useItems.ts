import { useQuery } from "@tanstack/react-query";
import { fetchItemById, fetchItemByTagId, fetchItems } from "../api/items";
import type { ItemsListQuery } from "../types/item";

export function useItems(query: ItemsListQuery) {
  return useQuery({
    queryKey: ["items", query],
    queryFn: ({ signal }) => fetchItems(query, signal),
    placeholderData: (previous) => previous,
  });
}

/**
 * Fetch recently registered items for the dashboard widget.
 * Endpoint: GET /items/recent?limit=5
 */
export function useRecentItems({ limit }: { limit: number }) {
  return useQuery({
    queryKey: ["items", "recent", limit],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/items/recent?limit=${limit}`, {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch recent items: ${response.statusText}`);
      }
      return response.json();
    },
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

/**
 * Fetch count of items held by the logged-in user for dashboard widget.
 * Endpoint: GET /items/held-by-me?summary=true
 */
export function useHeldItems() {
  return useQuery({
    queryKey: ["items", "held-by-me"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/v1/items/held-by-me?summary=true", {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch held items: ${response.statusText}`);
      }
      return response.json();
    },
  });
}

/**
 * `GET /items/:id` — the uuid-keyed read the staff and edit routes can use from
 * their own path param. Same cache family as `useItemByTagId` so invalidations
 * under `["item"]` cover both.
 */
export function useItemById(id: string | undefined) {
  return useQuery({
    queryKey: ["item", "byId", id],
    queryFn: ({ signal }) => fetchItemById(id as string, signal),
    enabled: Boolean(id),
    retry: false,
  });
}
