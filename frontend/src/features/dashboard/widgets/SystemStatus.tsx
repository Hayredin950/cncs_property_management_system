import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { useSystemStatus } from "../../../hooks/useSystem";

export function SystemStatus() {
  const { data, isPending, isError } = useSystemStatus();

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900">System status</h2>

      {isPending ? (
        <div role="status" aria-label="Loading system status">
          <SkeletonText lines={3} />
        </div>
      ) : isError ? (
        <p className="text-sm text-slate-500">Couldn't load system status</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Environment:</span>
            <span className="font-medium text-slate-900">{data?.environment ?? "Unknown"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Last deploy:</span>
            <span className="font-medium text-slate-900">{data?.lastDeploy ?? "Unknown"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Uptime:</span>
            <span className="font-medium text-slate-900">{data?.uptime ?? "Unknown"}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
