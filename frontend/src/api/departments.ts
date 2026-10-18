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
  const response = await apiClient.get<{ units: InvitableUnit[] }>("/departments/invitable");
  return response.units;
}

export async function fetchDepartmentRoster(id: string): Promise<DepartmentRoster> {
  return apiClient.get<DepartmentRoster>(`/departments/${id}/roster`);
}

export async function fetchDepartmentStaff(id: string): Promise<DepartmentStaff> {
  return apiClient.get<DepartmentStaff>(`/departments/${id}/staff`);
}

