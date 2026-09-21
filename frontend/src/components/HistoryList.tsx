import { History } from "lucide-react";
import { useMemo } from "react";
import type { EditLogEntry } from "../types/history";
import { formatDateTimeUTC, formatRelativeTime } from "../lib/formatters";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SkeletonText } from "./Skeleton";

export interface HistoryListProps {
  entries: EditLogEntry[];
  loading?: boolean;
}

interface EntryGroup {
  editedAt: string;
  editor: string;
  entries: EditLogEntry[];
}

/**
 * Item history (SRS F2.3, F6.3), **grouped by exact `editedAt`** (frontend-plan.md
 * §7): rows written by one approval share an exact timestamp — that correlation
 * is what turns "17 rows changed" into "admin approved this transfer, and its 3
 * accessories came along". ItemEditLog has no requestId column, so the timestamp
 * is the only key that reconstructs one decision.
 */
export function HistoryList({ entries, loading = false }: HistoryListProps) {
  const groups = useMemo<EntryGroup[]>(() => {
    const byTimestamp = new Map<string, EntryGroup>();
    for (const entry of entries) {
      const existing = byTimestamp.get(entry.editedAt);
      if (existing) {
        existing.entries.push(entry);
      } else {
        byTimestamp.set(entry.editedAt, {
          editedAt: entry.editedAt,
          editor: entry.editedBy.fullName,
          entries: [entry],
        });
      }
    }
    return Array.from(byTimestamp.values());
  }, [entries]);

  if (loading) return <SkeletonText lines={6} />;

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-8 w-8" />}
        heading="No edits recorded yet"
        body="Changes to this item — manual edits and approvals alike — will appear here."
      />
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {groups.map((group) => (
        <li key={group.editedAt}>
          <Card>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {group.entries.length} change{group.entries.length === 1 ? "" : "s"} by {group.editor}
              </p>
              <p className="text-xs text-slate-500" title={formatDateTimeUTC(group.editedAt) ?? undefined}>
                {formatRelativeTime(group.editedAt)}
              </p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {group.entries.map((entry) => (
                <li key={entry.id} className="text-sm text-slate-600">
                  <span className="font-medium text-slate-800">{entry.fieldChanged}</span>
                  {": "}
                  {entry.oldValue != null && (
                    <>
                      <span className="text-slate-400 line-through">{entry.oldValue}</span>
                      {" → "}
                    </>
                  )}
                  <span className="text-slate-900">{entry.newValue ?? "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ol>
  );
}
