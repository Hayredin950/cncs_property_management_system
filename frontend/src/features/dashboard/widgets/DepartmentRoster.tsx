import { Users } from "lucide-react";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { useDepartmentRoster } from "../../../hooks/useDepartments";

export function DepartmentRoster() {
  const { data, isPending, isError } = useDepartmentRoster();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Department roster</h2>
      </div>

      {isPending ? (
        <div role="status" aria-label="Loading department roster">
          <SkeletonText lines={1} />
        </div>
      ) : isError ? (
        <p className="text-sm text-slate-500">Couldn't load department roster</p>
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
