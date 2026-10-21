import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { OfflineState } from "../../components/ErrorState";
import { SkeletonText } from "../../components/Skeleton";
import { useSystemStatus } from "../../hooks/useSystem";
import { NetworkError } from "../../types/api";

export function SystemStatusPage() {
  const { data, isPending, isError, error, refetch } = useSystemStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">System Status</h1>
        <p className="mt-1 text-sm text-slate-600">System health and deployment information</p>
      </div>

      {isPending ? (
        <Card>
          <div role="status" aria-label="Loading system status">
            <SkeletonText lines={3} />
          </div>
        </Card>
      ) : isError ? (
        /* A failure here is a failure to reach the server, and every other
           screen in the app says so with an offline state and a way to try
           again. This one just said "couldn't load" and left the administrator
           with nothing to do. */
        <Card className="flex flex-col gap-4">
          {error instanceof NetworkError ? (
            <OfflineState />
          ) : (
            <p className="text-sm text-slate-500">
              Couldn't load the system status
              {error instanceof Error ? `: ${error.message}` : ""}.
            </p>
          )}
          <div>
            <Button size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
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
              <span className="text-slate-600">Database:</span>
              <span className="font-medium text-slate-900">{data?.database ?? "Unknown"}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
