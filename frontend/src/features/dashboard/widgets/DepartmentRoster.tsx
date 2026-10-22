import { Users, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { WidgetError } from "./WidgetError";
import { useAuth } from "../../../app/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchDepartmentRoster } from "../../../api/departments";

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
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["department-roster", user?.departmentId],
    queryFn: () => (user?.departmentId ? fetchDepartmentRoster(user.departmentId) : Promise.resolve(null)),
    enabled: !!user?.departmentId,
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Department roster</h2>
        {data?.department?.name && user?.departmentId && (
          <Link
            to={`/departments/${user.departmentId}`}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            {data.department.name}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {!user?.departmentId ? (
        <p className="text-sm text-slate-500">No department is set on your account</p>
      ) : isPending ? (
        <div role="status" aria-label="Loading department roster">
          <SkeletonText lines={1} />
        </div>
      ) : isError ? (
        <WidgetError heading="Couldn't load department roster" onRetry={() => void refetch()} />
      ) : (
        <Link
          to={`/departments/${user.departmentId}`}
          className="flex items-center gap-3 w-full p-2 hover:bg-slate-50 rounded-md transition-colors"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
            <Users className="h-5 w-5 text-brand-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold text-slate-900">{data?.staffCount ?? 0}</p>
            <p className="text-xs text-slate-600">staff member{data?.staffCount === 1 ? "" : "s"}</p>
          </div>
          <span className="text-slate-400">→</span>
        </Link>
      )}
    </Card>
  );
}
