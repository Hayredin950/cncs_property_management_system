import { Card } from "../../components/Card";
import { SkeletonText } from "../../components/Skeleton";
import { useSystemStatus } from "../../hooks/useSystem";

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function SystemStatusPage() {
  const { data, isPending, isError } = useSystemStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">System Status</h1>
        <p className="mt-1 text-sm text-slate-600">System health and deployment information</p>
      </div>

      {isPending ? (
        <Card>
          <div role="status" aria-label="Loading system status">
            <SkeletonText lines={5} />
          </div>
        </Card>
      ) : isError ? (
        <Card>
          <p className="text-sm text-slate-500">Couldn't load system status</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Environment:</span>
              <span className="font-medium text-slate-900">{data?.environment ?? "Unknown"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Version:</span>
              <span className="font-medium text-slate-900">{data?.version ?? "Unknown"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Last deploy:</span>
              <span className="font-medium text-slate-900">{data?.lastDeploy ?? "Unknown"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Uptime:</span>
              <span className="font-medium text-slate-900">
                {typeof data?.uptime === "number" ? formatUptime(data.uptime) : "Unknown"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Database:</span>
              <span className="font-medium text-slate-900">{data?.database ?? "Unknown"}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
