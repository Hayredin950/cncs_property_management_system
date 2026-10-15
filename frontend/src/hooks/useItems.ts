import { useQuery } from "@tanstack/react-query";
import {
  fetchHeldItemsSummary,
  fetchItemById,
  fetchItemByTagId,
  fetchItems,
  fetchRecentItems,
} from "../api/items";
import type { ItemsListQuery } from "../types/item";

export function useItems(query: ItemsListQuery) {
  return useQuery({
    queryKey: ["items", query],
    queryFn: ({ signal }) => fetchItems(query, signal),
    placeholderData: (previous) => previous,
  });
}

/**
 * The Property Officer's "Recently registered items" tile (`GET /items/recent`).
 *
 * It used to be a bare, root-relative `fetch` with no `Authorization` header, whose
 * failures were all funnelled into `return []`. Two of those failures were real and
 * permanent, and both read as "no items registered yet": the request had no token,
 * and the route it asked for was unreachable because `GET /items/:tagId` matched the
 * literal name first. Even a 200 would have been displayed wrong — the endpoint
 * sends `registeredAt` while the tile read `createdAt`.
 *
 * `apiClient` for the token and the base URL, `fetchRecentItems` for the field, and
 * a thrown error now surfaces as the tile's error state rather than an empty
 * register.
 */
export function useRecentItems({ limit }: { limit: number }) {
  return useQuery({
    queryKey: ["items", "recent", limit],
    queryFn: ({ signal }) => fetchRecentItems(limit, signal),
    retry: false,
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
 * The Department Head's "Your held items" tile (`GET /items/held-by-me?summary=true`).
 *
 * Same three faults as `useRecentItems` above, including the route-ordering one
 * (`GET /items/:tagId` swallowed the literal path, so the count was always zero), and
 * the same fix. A `{ count: 0 }` the client invented is indistinguishable from a
 * genuinely empty register, which is why the failure has to reach the tile now.
 */
export function useHeldItems() {
  return useQuery({
    queryKey: ["items", "held-by-me"],
    queryFn: ({ signal }) => fetchHeldItemsSummary(signal),
    retry: false,
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
