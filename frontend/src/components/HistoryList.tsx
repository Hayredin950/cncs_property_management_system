import { History } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { EditLogEntry } from "../types/history";
import { formatDateTimeUTC, formatRelativeTime } from "../lib/formatters";
import { Button } from "./Button";
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
 * How many change groups the list shows before the reader asks for the rest.
 *
 * Three, because that is roughly what fits on a phone screen next to the item,
 * and because the question this panel is usually opened to answer — "what changed
 * just now, and who did it?" — is answered by the most recent one or two.
 */
const PREVIEW_GROUPS = 3;

/**
 * Item history (SRS F2.3, F6.3), **grouped by exact `editedAt`** (frontend-plan.md
 * §7): rows written by one approval share an exact timestamp — that correlation
 * is what turns "17 rows changed" into "admin approved this transfer, and its 3
 * accessories came along". ItemEditLog has no requestId column, so the timestamp
 * is the only key that reconstructs one decision.
 *
 * ### Why the recent few, not a collapsed accordion
 *
 * An item that has been moved, repaired and re-valued a dozen times produces a long
 * history, and a wall of it pushes the accessories and the tag sticker off the
 * screen. So the list opens with the **three most recent groups** and a single
 * "show all" control reveals the rest.
 *
 * The alternative — a `<details>`-style accordion that starts closed — was
 * rejected: this panel exists to make changes *visible*, and something that is
 * hidden until clicked is invisible in exactly the case that matters (checking
 * whether the move someone promised actually happened). Newest-first preview keeps
 * the answer on screen while still capping the height.
 *
 * Groups are the unit, not rows: a transfer with three accessories is one decision
 * and should not be able to occupy three of the three slots.
 */
export function HistoryList({ entries, loading = false }: HistoryListProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

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

  const visible = expanded ? groups : groups.slice(0, PREVIEW_GROUPS);
  const hidden = groups.length - visible.length;
  const collapsible = groups.length > PREVIEW_GROUPS;

  return (
    <div className="flex flex-col gap-3">
      <ol id={listId} className="flex flex-col gap-3">
        {visible.map((group) => (
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
                  /*
                    `overflow-wrap: anywhere` is load-bearing: these values are not
                    all short labels. A `photoUrl` is a full Cloudinary link and an
                    `ownerId` reads "Full Name (uuid)" — each one unbroken token as far
                    as the line-breaking algorithm is concerned, so without this the
                    text runs out of the card and over whatever sits to its right.
                    `anywhere` rather than `break-word` because it also counts toward
                    the box's min-content width, which is what a flex or grid parent
                    measures when it decides the card is allowed to be that wide.
                  */
                  <li key={entry.id} className="text-sm text-slate-600 [overflow-wrap:anywhere]">
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

      {collapsible && (
        <Button
          variant="outline"
          size="sm"
          fullWidth
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? "Show fewer" : `Show all ${groups.length} changes (${hidden} older)`}
        </Button>
      )}
    </div>
  );
}
