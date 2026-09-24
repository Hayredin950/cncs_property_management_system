import { apiClient } from "../lib/apiClient";
import type { Category } from "../types/category";

/** `GET /categories` — public; used for the category filter/select everywhere. Carries `itemCount`. */
export function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  return apiClient.get<Category[]>("/categories", undefined, signal);
}

/** `POST /categories` — Admin only; duplicate name answers 409. */
export function createCategory(name: string): Promise<Category> {
  return apiClient.post<Category>("/categories", { name });
}

/** `PUT /categories/:id` — Admin only; rename. A duplicate name answers 409. */
export function updateCategory(id: string, name: string): Promise<Category> {
  return apiClient.put<Category>(`/categories/${encodeURIComponent(id)}`, { name });
}

/**
 * `DELETE /categories/:id` — Admin only, and refused while items still reference
 * the category (409). See the backend route: removing a populated category
 * would mean destroying or orphaning its items, which F7.2 forbids.
 */
export function deleteCategory(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiClient.delete<{ id: string; deleted: boolean }>(`/categories/${encodeURIComponent(id)}`);
}
