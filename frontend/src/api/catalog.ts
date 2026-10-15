import { apiClient } from "../lib/apiClient";

export interface CatalogItem {
  id: string;
  name: string;
  tagId: string;
  category: {
    id: string;
    name: string;
  };
  locationBuilding: string;
  status: string;
}

/**
 * §9.1: GET /catalog - Staff restricted catalog browse
 * Returns items with limited fields: name, category, building, status
 * Excludes cost, custodian, exact room
 */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  return apiClient.get<CatalogItem[]>("/catalog");
}
