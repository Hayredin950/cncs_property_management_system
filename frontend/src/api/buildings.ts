import { apiClient } from "../lib/apiClient";
import type { Building } from "../types/building";

/** `GET /buildings` — Property Officer only (`BUILDING_MANAGE`). */
export function fetchBuildings(signal?: AbortSignal): Promise<Building[]> {
  return apiClient.get<{ data: Building[] }>("/buildings", undefined, signal).then((page) => page.data);
}

/** `POST /buildings` — a duplicate code answers 409. */
export function createBuilding(input: {
  name: string;
  code: string;
  description?: string | undefined;
  address?: string | undefined;
}): Promise<Building> {
  return apiClient.post<Building>("/buildings", input);
}

/** `PUT /buildings/:id` — rename, re-code, or correct the address. */
export function updateBuilding(
  id: string,
  input: { name?: string | undefined; code?: string | undefined; description?: string | undefined; address?: string | undefined },
): Promise<Building> {
  return apiClient.put<Building>(`/buildings/${encodeURIComponent(id)}`, input);
}

/**
 * `DELETE /buildings/:id` — refused while items still reference the building
 * (409). Removing a building that holds items would orphan them.
 */
export function deleteBuilding(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete<{ id: string; deleted: boolean }>(`/buildings/${encodeURIComponent(id)}`);
}
