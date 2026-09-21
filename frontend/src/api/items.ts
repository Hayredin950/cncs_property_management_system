import { apiClient } from "../lib/apiClient";
import type { EditLogEntry, ItemsHistoryResponse } from "../types/history";
import type { Item, ItemsListQuery, ItemsListResponse } from "../types/item";
import type { Category } from "../types/category";

/**
 * `GET /items` — public, richer when signed in (SDS 3.2 field filtering happens
 * server-side; this module never re-implements it — frontend-plan.md §5).
 */
export function fetchItems(query: ItemsListQuery = {}, signal?: AbortSignal): Promise<ItemsListResponse> {
  return apiClient.get<ItemsListResponse>("/items", { ...query }, signal);
}

/**
 * `GET /items/:tagId` — the QR destination. `404` for an unknown tag, `410` for a
 * disposed item seen by the public (both surface as `ApiError`; screens branch on
 * `error.status`, not on parsing the message).
 */
export function fetchItemByTagId(tagId: string, signal?: AbortSignal): Promise<Item> {
  return apiClient.get<Item>(`/items/${encodeURIComponent(tagId)}`, undefined, signal);
}

/** Body of `POST /items` — mirrors the backend's `createItemSchema` (items.ts). */
export interface CreateItemPayload {
  name: string;
  categoryId: string;
  department: string;
  building: string;
  floor: string;
  room: string;
  ownerId: string;
  purchaseCost: number;
  currentValue?: number | null;
  condition: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
}

/**
 * `POST /items` — Staff/Admin. The tag ID is generated server-side; responses
 * come back raw (unsanitized, since the creator is privileged).
 *
 * **`parentItemId` must never be sent** — the API rejects it with a 400 pointing
 * at the accessories endpoint (frontend-plan.md §7); the type deliberately omits
 * it so TypeScript makes the mistake unwritable.
 */
export function createItem(payload: CreateItemPayload): Promise<Item> {
  return apiClient.post<Item>("/items", payload);
}

/** `PUT /items/:id` — partial update; a disposed item answers 409 (terminal, F7.2). */
export function updateItem(id: string, payload: Partial<CreateItemPayload>): Promise<Item> {
  return apiClient.put<Item>(`/items/${encodeURIComponent(id)}`, payload);
}

/** `GET /items/:id/history` — Staff/Admin; disposed items included on purpose (F7.2). */
export function fetchItemHistory(
  id: string,
  query: { limit?: number; offset?: number; field?: string } = {},
  signal?: AbortSignal,
): Promise<ItemsHistoryResponse> {
  return apiClient.get<ItemsHistoryResponse>(`/items/${encodeURIComponent(id)}/history`, query, signal);
}

export type { EditLogEntry };

/**
 * `POST /items/:id/accessories` — the ONLY way to bundle (parentItemId has no
 * other writer; the API 400s if it appears on create/update). Accepts one id or
 * many; the server dedupes and re-parenting from another bundle is allowed.
 */
export function linkAccessories(parentId: string, accessoryItemIds: string[]): Promise<AccessoriesOutcome> {
  return apiClient.post<AccessoriesOutcome>(`/items/${encodeURIComponent(parentId)}/accessories`, {
    accessoryItemIds,
  });
}

/** `DELETE /items/:id/accessories/:accessoryId` — allowed even when disposed (fixing a bad bundle). */
export function unlinkAccessory(parentId: string, accessoryId: string): Promise<AccessoriesOutcome> {
  return apiClient.delete<AccessoriesOutcome>(
    `/items/${encodeURIComponent(parentId)}/accessories/${encodeURIComponent(accessoryId)}`,
  );
}

/** Response of both accessory endpoints — counts for the toast, ids for invalidation. */
export interface AccessoriesOutcome {
  item: { id: string; tagId: string; name: string };
  linkedItemIds?: string[];
  alreadyLinkedItemIds?: string[];
  unlinkedItemId?: string;
  editLogRowCount: number;
}

/** `POST /items/:id/tag/regenerate` — reissues the sticker's QR design; Tag ID unchanged (F3.5). */
export function regenerateTag(itemId: string): Promise<{ tagId: string; url: string; dataUrl: string }> {
  return apiClient.post(`/items/${encodeURIComponent(itemId)}/tag/regenerate`);
}

/** Re-export so form screens can resolve category names without a second import path. */
export type { Category };
