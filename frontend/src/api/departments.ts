import { apiClient } from "../lib/apiClient";
import type { DepartmentOption } from "../types/user";

/**
 * `GET /departments` — public list of departments accepting self-registration.
 * Returns `[{ id, name, code }]` for active units with type DEPARTMENT and acceptsSelfReg = true.
 */
export async function fetchDepartments(): Promise<DepartmentOption[]> {
  return apiClient.get<DepartmentOption[]>("/departments");
}

/**
 * A unit as the invite form sees it (`GET /departments/invitable`).
 *
 * `hasActiveHead` is what the server will refuse the invite on, sent up front so
 * the picker can mark a unit that already has a working head instead of the
 * administrator finding out from a 400 after filling the form in.
 */
export interface InvitableUnit {
  id: string;
  name: string;
  code: string;
  hasActiveHead: boolean;
}

/**
 * `GET /departments/invitable` — the departments a head invite may name (T6).
 *
 * Not `GET /departments`: that lists the units open to self-registration, while an
 * invite is most needed where a unit has no working head. Requires `ACCOUNT_INVITE`
 * (System Admin), so it is only ever called from the accounts screen.
 */
export function fetchInvitableUnits(signal?: AbortSignal): Promise<InvitableUnit[]> {
  return apiClient.get<InvitableUnit[]>("/departments/invitable", undefined, signal);
}

/**
 * `GET /departments/:id/roster` — one unit's staff count, for the Department
 * Head's dashboard tile.
 *
 * The route answers 403 unless the caller is reading its **own** unit (or is an
 * administrator), so the only caller passes the signed-in user's own
 * `departmentId`. `department` is echoed back rather than left to the client so a
 * tile can name the unit it is counting.
 */
export interface DepartmentRoster {
  department: { id: string; name: string };
  staffCount: number;
}

/**
 * `GET /departments/:id/roster` — the roster snapshot for one department.
 */
export function fetchDepartmentRoster(
  departmentId: string,
  signal?: AbortSignal,
): Promise<DepartmentRoster> {
  return apiClient.get<DepartmentRoster>(
    `/departments/${encodeURIComponent(departmentId)}/roster`,
    undefined,
    signal,
  );
}

export type { DepartmentOption };