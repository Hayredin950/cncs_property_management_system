import { Users } from "lucide-react";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { useDepartmentRoster } from "../../../hooks/useDepartments";
import { useAuth } from "../../../app/AuthContext";

/**
 * The Department Head's "Department roster" tile — the staff count for the head's
 * own unit (`GET /departments/:id/roster`).
 *
 * The id is the signed-in user's `departmentId`, not an argument: the route only
 * answers for the caller's own unit, so this is the one roster the tile can show.
 * A head whose account carries no department id gets the empty-state line rather
 * than a request the server would reject.
 */
export function DepartmentRoster() {
  const { user } = useAuth();
  const { data, isPending, isError } = useDepartmentRoster(user?.departmentId);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Department roster</h2>
        {data?.department?.name && (
          <span className="text-sm text-slate-500">{data.department.name}</span>
        )}
      </div>

      {!user?.departmentId ? (
        <p className="text-sm text-slate-500">No department is set on your account</p>
      ) : isPending ? (
        <div role="status" aria-label="Loading department roster">
          <SkeletonText lines={1} />
        </div>
      ) : isError ? (
        <p className="text-sm text-slate-500">Couldn&apos;t load department roster</p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
            <Users className="h-5 w-5 text-brand-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data?.staffCount ?? 0}</p>
            <p className="text-xs text-slate-600">staff member{data?.staffCount === 1 ? "" : "s"}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
