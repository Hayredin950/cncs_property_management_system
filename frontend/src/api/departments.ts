import { apiClient } from "../lib/apiClient";

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

export interface DepartmentRoster {
  id: string;
  name: string;
  staffCount: number;
  department: {
    id: string;
    name: string;
  };
}

export interface DepartmentStaff {
  department: {
    id: string;
    name: string;
  };
  staff: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    itemCount: number;
  }[];
}

export interface InvitableUnit {
  id: string;
  name: string;
  code: string;
  hasActiveHead: boolean;
}

export async function getDepartments(): Promise<Department[]> {
  return apiClient.get<Department[]>("/departments");
}

export async function fetchInvitableUnits(): Promise<InvitableUnit[]> {
  // The endpoint answers with a **bare array** of units
  // (`[{ id, name, code, hasActiveHead }]`), not an object wrapping it. The
  // previous code read `response.units`, which is `undefined` for that shape —
  // React Query rejects `undefined` as query data, the hook throws, and the
  // whole `/admin/users` screen fails to render (the invite form and the
  // accounts list with it). The mock in the test suite returned the array
  // correctly, so the tests never caught it; only the real server did.
  const response = await apiClient.get<InvitableUnit[]>("/departments/invitable");
  return response;
}

export async function fetchDepartmentRoster(id: string): Promise<DepartmentRoster> {
  return apiClient.get<DepartmentRoster>(`/departments/${id}/roster`);
}

export async function fetchDepartmentStaff(id: string): Promise<DepartmentStaff> {
  return apiClient.get<DepartmentStaff>(`/departments/${id}/staff`);
}

