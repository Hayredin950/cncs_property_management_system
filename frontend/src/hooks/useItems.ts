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
 * Falls back gracefully if endpoint doesn't exist yet.
 */
export function useRecentItems({ limit }: { limit: number }) {
  return useQuery({
    queryKey: ["items", "recent", limit],
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch(`/api/v1/items/recent?limit=${limit}`, {
          signal,
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          // Endpoint doesn't exist yet - return empty array gracefully
          if (response.status === 404) {
            return [];
          }
          throw new Error(`Failed to fetch recent items: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        // If fetch fails, return empty array gracefully
        console.error("Failed to fetch recent items:", error);
        return [];
      }
    },
    // Don't retry on 404 - endpoint might not exist yet
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("404")) {
        return false;
      }
      return failureCount < 3;
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
 * Falls back gracefully if endpoint doesn't exist yet.
 */
export function useHeldItems() {
  return useQuery({
    queryKey: ["items", "held-by-me"],
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch("/api/v1/items/held-by-me?summary=true", {
          signal,
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          // Endpoint doesn't exist yet - return zero count gracefully
          if (response.status === 404) {
            return { count: 0 };
          }
          throw new Error(`Failed to fetch held items: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        // If fetch fails, return zero count gracefully
        console.error("Failed to fetch held items:", error);
        return { count: 0 };
      }
    },
    // Don't retry on 404 - endpoint might not exist yet
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("404")) {
        return false;
      }
      return failureCount < 3;
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
