import { Boxes, TrendingUp, Users } from "lucide-react";
import { Card } from "../../../components/Card";
import { SkeletonText } from "../../../components/Skeleton";
import { WidgetError } from "./WidgetError";
import { useSystemStatistics } from "../../../hooks/useSystem";

/**
 * The shape of the college's register, on the System Admin's dashboard.
 *
 * The status page already draws these graphs; the dashboard had their data
 * available and showed none of it. A count in a table answers "how many"; a
 * column strip answers "is it growing", and that is the question an
 * administrator actually arrives with. The widget is deliberately the two
 * graphs that answer it — growth and mix — and links to the full four on the
 * status page rather than duplicating them here.
 *
 * The bars are plain CSS: a chart library is a dependency and a bundle for
 * counts a person reads once.
 */

const TONES = {
  brand: "bg-brand-500",
  success: "bg-success-500",
  accent: "bg-accent-500",
  warning: "bg-warning-500",
  neutral: "bg-slate-400",
} as const;

export function SystemUsage() {
  const { data, isPending, isError, refetch } = useSystemStatistics();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="text-slate-400">
            <Users className="h-4 w-4" />
          </span>
          Accounts
        </h2>

        {isPending ? (
          <div role="status" aria-label="Loading account usage">
            <SkeletonText lines={3} />
          </div>
        ) : isError ? (
          <WidgetError heading="Couldn't load account usage" onRetry={() => void refetch()} />
        ) : (
          <>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold tabular-nums text-slate-900">
                {data?.accounts.total ?? 0}
              </p>
              <p className="pb-1 text-sm text-slate-500">accounts</p>
            </div>

            <MonthColumns
              months={data?.accounts.perMonth ?? []}
              emptyMessage="No accounts have been created yet."
            />

            <Bars
              items={Object.entries(data?.accounts.byStatus ?? {}).map(([label, count]) => ({
                label,
                count,
              }))}
              tone="brand"
            />
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="text-slate-400">
            <Boxes className="h-4 w-4" />
          </span>
          Register
        </h2>

        {isPending ? (
          <div role="status" aria-label="Loading register usage">
            <SkeletonText lines={3} />
          </div>
        ) : isError ? (
          <WidgetError heading="Couldn't load register usage" onRetry={() => void refetch()} />
        ) : (
          <>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold tabular-nums text-slate-900">
                {data?.items.total ?? 0}
              </p>
              <p className="pb-1 text-sm text-slate-500">items in service</p>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                <TrendingUp className="h-3.5 w-3.5" />
                By status
              </p>
              <Bars
                items={Object.entries(data?.items.byStatus ?? {}).map(([label, count]) => ({
                  label,
                  count,
                }))}
                tone="success"
              />
            </div>

            {data && data.items.byDepartment.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  By department
                </p>
                <Bars
                  items={data.items.byDepartment.slice(0, 5).map((row) => ({
                    label: row.name,
                    count: row.count,
                  }))}
                  tone="neutral"
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/** One labelled bar per row, scaled to the largest of them. */
function Bars({
  items,
  tone,
}: {
  items: { label: string; count: number }[];
  tone: keyof typeof TONES;
}) {
  if (items.length === 0) return <p className="text-sm text-slate-500">Nothing recorded yet.</p>;
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs capitalize text-slate-600">
            {item.label.replaceAll("_", " ")}
          </span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
            <span
              className={`block h-full rounded ${TONES[tone]}`}
              style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-600">
            {item.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** New accounts per month, as columns — the growth strip. */
function MonthColumns({
  months,
  emptyMessage,
}: {
  months: { month: string; count: number }[];
  emptyMessage: string;
}) {
  if (months.length === 0) return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  const max = Math.max(1, ...months.map((month) => month.count));

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
        New accounts, last six months
      </p>
      <div className="flex items-end gap-2">
        {months.map((month) => (
          <div key={month.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs tabular-nums text-slate-600">{month.count}</span>
            <div
              className="w-full rounded-t bg-brand-500"
              style={{ height: `${Math.max(4, (month.count / max) * 64)}px` }}
              title={`${month.month}: ${month.count}`}
            />
            <span className="text-[10px] text-slate-400">{month.month.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
