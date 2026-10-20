import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { useSystemStatus } from "../../../hooks/useSystem";
import { formatDateUTC } from "../../../lib/formatters";

/** Seconds into a short, honest duration: "3h 12m", "12m 04s", "41s". */
function formatUptime(seconds: number | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "Unknown";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${String(Math.floor(seconds % 60)).padStart(2, "0")}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

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
            <span className="text-slate-600">Version:</span>
            <span className="font-medium text-slate-900">{data?.version ?? "Unknown"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Database:</span>
            <span className="font-medium text-slate-900">{data?.database ?? "Unknown"}</span>
          </div>
          {/* The API has always returned these two and the widget never showed
              them — the tile said "production, 1.0.0, connected" and left the
              administrator to guess how long the instance had been up and which
              revision was running. For a system tile, the uptime and the
              deployed revision are the two facts worth having. */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Uptime:</span>
            <span className="font-medium text-slate-900">{formatUptime(data?.uptime)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Last deploy:</span>
            <span className="font-medium text-slate-900">
              {data?.lastDeploy ? formatDateUTC(data.lastDeploy) : "Unknown"}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
