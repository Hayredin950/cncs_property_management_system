import { apiClient } from "../lib/apiClient";

export interface Building {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  address?: string | null;
}

export interface BuildingsResponse {
  data: Building[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * `GET /buildings` — lists university buildings for dropdown selection.
 */
export async function fetchBuildings(signal?: AbortSignal): Promise<Building[]> {
  try {
    const res = await apiClient.get<BuildingsResponse | Building[]>("/buildings", { limit: 100 }, signal);
    if (Array.isArray(res)) return res;
    return res?.data ?? [];
  } catch {
    return [];
  }
}
