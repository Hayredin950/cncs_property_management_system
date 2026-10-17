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

export interface InvitableUnit {
  id: string;
  name: string;
  code: string;
  hasActiveHead: boolean;
}

export async function getDepartments(): Promise<Department[]> {
  const response = await apiClient.get<{ departments: Department[] }>("/departments");
  return response.departments;
}

export async function fetchInvitableUnits(): Promise<InvitableUnit[]> {
  const response = await apiClient.get<{ units: InvitableUnit[] }>("/departments/invitable");
  return response.units;
}

export async function fetchDepartmentRoster(id: string): Promise<DepartmentRoster> {
  const response = await apiClient.get<{ roster: DepartmentRoster }>(`/departments/${id}/roster`);
  return response.roster;
}

