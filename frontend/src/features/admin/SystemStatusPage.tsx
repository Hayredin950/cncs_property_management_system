import { Activity, Boxes, FileClock, Users } from "lucide-react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { SkeletonText } from "../../components/Skeleton";
import { useSystemStatistics, useSystemStatus } from "../../hooks/useSystem";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import { NetworkError } from "../../types/api";
import type { SystemStatistics } from "../../api/system";

/**
 * The System Admin's status page: the build facts, and the **shape** of the
 * college's register.
 *
 * The old page answered "is it up?" with three words. An administrator
 * looking at a system wants to know how much it holds and how it is being
 * used — how many accounts and how many are waiting, what the decisions were,
 * what the assets look like, whether the requests are moving.
 *
 * The graphs are drawn with plain CSS on purpose: a chart library is a
 * dependency and a bundle for four bars, and these bars are counts a person
 * reads once to know whether the college is being used.
 */
export function SystemStatusPage() {
  const status = useSystemStatus();
  const stats = useSystemStatistics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">System Status</h1>
        <p className="mt-1 text-sm text-slate-600">
          The build facts, and the shape of the college's register.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        {status.isPending ? (
          <div role="status" aria-label="Loading system status">
            <SkeletonText lines={3} />
          </div>
        ) : status.isError ? (
          <>
            {status.error instanceof NetworkError ? (
              <OfflineState onRetry={() => status.refetch()} />
            ) : (
              <p className="text-sm text-slate-500">
                Couldn't load the system status
                {status.error instanceof Error ? `: ${status.error.message}` : ""}.
              </p>
            )}
            <div>
              <Button size="sm" onClick={() => void status.refetch()}>
                Try again
              </Button>
            </div>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Environment" value={status.data?.environment ?? "Unknown"} />
            <Fact label="Version" value={status.data?.version ?? "Unknown"} mono />
            <Fact
              label="Uptime"
              value={formatUptime(status.data?.uptime)}
              hint="Of the instance serving this request"
            />
            <Fact
              label="Deployed"
              value={
                status.data?.builtAt
                  ? formatDateTimeUTC(status.data.builtAt) ?? "Unknown"
                  : "Not recorded"
              }
              hint={status.data?.startedAt ? `Instance since ${formatRelativeTime(status.data.startedAt)}` : undefined}
            />
            <Fact label="Database" value={status.data?.database ?? "Unknown"} />
          </div>
        )}
      </Card>

      {stats.isPending ? (
        <Card>
          <div role="status" aria-label="Loading system statistics">
            <SkeletonText lines={4} />
          </div>
        </Card>
      ) : stats.isError ? (
        <ErrorState
          heading="Couldn't load the system's statistics"
          body={stats.error instanceof Error ? stats.error.message : undefined}
          action={
            <Button size="sm" onClick={() => void stats.refetch()}>
              Try again
            </Button>
          }
        />
      ) : stats.data ? (
        <StatisticsGrid statistics={stats.data} />
      ) : null}
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** The four graphs. */
function StatisticsGrid({ statistics }: { statistics: SystemStatistics }) {
  const accounts = statistics.accounts;
  const accountTotal = Math.max(1, accounts.total);
  const monthMax = Math.max(1, ...accounts.perMonth.map((m) => m.count));
  const itemTotal = Math.max(1, statistics.items.total);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* The accounts, and how they arrived. */}
      <Card className="flex flex-col gap-4">
        <Heading icon={<Users className="h-4 w-4" />} title="Accounts" />
        <p className="text-3xl font-bold text-slate-900">{accounts.total}</p>
        <Bars
          items={Object.entries(accounts.byStatus).map(([label, count]) => ({ label, count }))}
          max={accountTotal}
          tone="brand"
        />
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            New accounts, last six months
          </p>
          <div className="flex items-end gap-2">
            {accounts.perMonth.map((month) => (
              <div key={month.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-slate-600">{month.count}</span>
                <div
                  className="w-full rounded-t bg-brand-500"
                  style={{ height: `${Math.max(4, (month.count / monthMax) * 64)}px` }}
                  title={`${month.month}: ${month.count}`}
                />
                <span className="text-[10px] text-slate-400">{month.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* The assets. */}
      <Card className="flex flex-col gap-4">
        <Heading icon={<Boxes className="h-4 w-4" />} title="Assets" />
        <p className="text-3xl font-bold text-slate-900">{statistics.items.total}</p>
        <Bars
          items={Object.entries(statistics.items.byStatus).map(([label, count]) => ({ label, count }))}
          max={itemTotal}
          tone="success"
        />
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">By department</p>
          <Bars
            items={statistics.items.byDepartment.slice(0, 6).map((row) => ({
              label: row.name,
              count: row.count,
            }))}
            max={itemTotal}
            tone="info"
          />
        </div>
      </Card>

      {/* The decisions. */}
      <Card className="flex flex-col gap-4">
        <Heading icon={<FileClock className="h-4 w-4" />} title="Decisions" />
        <Bars
          items={statistics.decisions.slice(0, 6).map((row) => ({
            label: row.action.replaceAll("_", " ").toLowerCase(),
            count: row.count,
          }))}
          max={Math.max(1, ...statistics.decisions.map((row) => row.count))}
          tone="accent"
        />
        {statistics.decisions.length === 0 && (
          <p className="text-sm text-slate-500">No decisions recorded yet.</p>
        )}
      </Card>

      {/* The work moving through the system. */}
      <Card className="flex flex-col gap-4">
        <Heading icon={<Activity className="h-4 w-4" />} title="In flight" />
        <Bars
          items={Object.entries(statistics.requests.byStatus).map(([label, count]) => ({ label, count }))}
          max={Math.max(1, ...Object.values(statistics.requests.byStatus))}
          tone="warning"
        />
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">By type</p>
          <Bars
            items={Object.entries(statistics.requests.byType).map(([label, count]) => ({ label, count }))}
            max={Math.max(1, ...Object.values(statistics.requests.byType))}
            tone="neutral"
          />
        </div>
      </Card>
    </div>
  );
}

function Heading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
      <span className="text-slate-400">{icon}</span>
      {title}
    </h2>
  );
}

const TONES = {
  brand: "bg-brand-500",
  success: "bg-success-500",
  info: "bg-brand-300",
  accent: "bg-accent-500",
  warning: "bg-warning-500",
  neutral: "bg-slate-400",
} as const;

/** A labelled bar per row, scaled to the largest of them. */
function Bars({
  items,
  max,
  tone,
}: {
  items: { label: string; count: number }[];
  max: number;
  tone: keyof typeof TONES;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs capitalize text-slate-600">
            {item.label.replaceAll("_", " ")}
          </span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
            <span
              className={`block h-3 rounded ${TONES[tone]}`}
              style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-600">
            {item.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Seconds into a short, honest duration. */
function formatUptime(seconds: number | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "Unknown";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${String(Math.floor(seconds % 60)).padStart(2, "0")}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
