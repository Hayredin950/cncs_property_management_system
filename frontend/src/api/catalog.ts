import { apiClient } from "../lib/apiClient";

export interface CatalogItem {
  id: string;
  name: string;
  tagId: string;
  category: {
    id: string;
    name: string;
  };
  building?: {
    name: string;
  };
  status: string;
  orgUnitId?: string;
}

/**
 * §9.1: GET /catalog - Staff restricted catalog browse
 * Returns items with limited fields: name, category, building, status
 * Excludes cost, custodian, exact room
 */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  return apiClient.get<CatalogItem[]>("/catalog");
}

/**
 * §9.1: GET /catalog/department - Department Head cross-department catalog
 * Returns items from other departments with limited fields: name, category, building, status
 * Excludes user's own department, cost, custodian, exact room
 */
export async function fetchDepartmentCatalog(): Promise<CatalogItem[]> {
  return apiClient.get<CatalogItem[]>("/catalog/department");
}
