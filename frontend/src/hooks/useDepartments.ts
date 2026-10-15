import { useQuery } from "@tanstack/react-query";
import { fetchDepartmentRoster } from "../api/departments";

/**
 * The Department Head's "Department roster" tile (`GET /departments/:id/roster`).
 *
 * Two faults, both silent, and both the same kind the other tiles had. It called
 * `/api/v1/departments/roster` — a path no route declares; the real one is
 * `/departments/:id/roster` — with a bare, root-relative `fetch` carrying no
 * `Authorization` header. Every failure, including the 404 that unreachable path
 * produced, became `{ staffCount: 0 }`, so the tile reported an empty department
 * whatever the register held.
 *
 * The id comes from the signed-in head's own `departmentId`: the route refuses a
 * head reading any unit but its own, so there is only one roster this tile may
 * ask for. The query is **disabled** without an id rather than sending
 * `/departments/undefined/roster` — a missing department is a fact about the
 * account, not a request to fail at.
 */
export function useDepartmentRoster(departmentId: string | undefined) {
  return useQuery({
    queryKey: ["departments", "roster", departmentId],
    queryFn: ({ signal }) => fetchDepartmentRoster(departmentId as string, signal),
    enabled: Boolean(departmentId),
    retry: false,
  });
}
