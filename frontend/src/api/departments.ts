import { apiClient } from "../lib/apiClient";
import type { DepartmentOption } from "../types/user";

/**
 * `GET /departments` — public list of departments accepting self-registration.
 * Returns `[{ id, name, code }]` for active units with type DEPARTMENT and acceptsSelfReg = true.
 */
export async function fetchDepartments(): Promise<DepartmentOption[]> {
  return apiClient.get<DepartmentOption[]>("/departments");
}

export type { DepartmentOption };