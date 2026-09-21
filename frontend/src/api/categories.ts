import { apiClient } from "../lib/apiClient";
import type { Category } from "../types/category";

/** `GET /categories` — public; used for the category filter/select everywhere. */
export function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  return apiClient.get<Category[]>("/categories", undefined, signal);
}
