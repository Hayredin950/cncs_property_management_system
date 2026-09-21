import { apiClient } from "../lib/apiClient";
import type { Item, ItemsListQuery, ItemsListResponse } from "../types/item";

/**
 * `GET /items` — public, richer when signed in (SDS 3.2 field filtering happens
 * server-side; this module never re-implements it — frontend-plan.md §5).
 * Destructures and rebuilds a fresh object so the query map stays a plain
 * `Record<string, ...>` at the call site rather than the named `ItemsListQuery`
 * interface, which keeps this compatible with `apiClient.get`'s generic query type.
 */
export function fetchItems(query: ItemsListQuery = {}, signal?: AbortSignal): Promise<ItemsListResponse> {
  const { page, limit, search, categoryId, department } = query;
  return apiClient.get<ItemsListResponse>(
    "/items",
    { page, limit, search, categoryId, department },
    signal,
  );
}

/**
 * `GET /items/:tagId` — the QR destination. `404` for an unknown tag, `410` for a
 * disposed item seen by the public (both surface as `ApiError`; screens branch on
 * `error.status`, not on parsing the message).
 */
export function fetchItemByTagId(tagId: string, signal?: AbortSignal): Promise<Item> {
  return apiClient.get<Item>(`/items/${encodeURIComponent(tagId)}`, undefined, signal);
}
