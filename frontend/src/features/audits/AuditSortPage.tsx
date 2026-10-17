import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  HelpCircle,
  Lock,
  MapPinOff,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { Skeleton } from "../../components/Skeleton";
import { StatCard } from "../../components/StatCard";
import { useAuditSession, useFinalizeAudit, useSortAuditItem } from "../../hooks/useAudits";
import { cn } from "../../lib/cn";
import { formatDateTimeUTC } from "../../lib/formatters";
import type { AuditItemResult } from "../../types/enums";

type TabFilter = "ALL" | "NOT_LOCATED" | "NOT_ACCESSIBLE" | "CHECK_AGAIN" | "MISSING" | "FOUND";

export function AuditSortPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const sessionQuery = useAuditSession(id);
  const sortMutation = useSortAuditItem(id);
  const finalizeMutation = useFinalizeAudit(id);

  const [activeTab, setActiveTab] = useState<TabFilter>("NOT_LOCATED");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states for sorting an item
  const [selectedItem, setSelectedItem] = useState<{
    itemId: string;
    tagId: string;
    name: string;
    targetResult: "NOT_ACCESSIBLE" | "CHECK_AGAIN" | "MISSING";
  } | null>(null);

  const [sortReason, setSortReason] = useState("");
  const [sortNote, setSortNote] = useState("");
  const [checkAgainDays, setCheckAgainDays] = useState(7);

  // Finalize confirmation modal
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  const session = sessionQuery.data;
  const rows = session?.rows ?? [];

  const counts = useMemo(() => {
    return {
      found: rows.filter((r) => r.result === "FOUND").length,
      notLocated: rows.filter((r) => r.result === "NOT_LOCATED" || r.result === "PENDING").length,
      notAccessible: rows.filter((r) => r.result === "NOT_ACCESSIBLE").length,
      checkAgain: rows.filter((r) => r.result === "CHECK_AGAIN").length,
      missing: rows.filter((r) => r.result === "MISSING").length,
      mismatch: rows.filter((r) => r.result === "LOCATION_MISMATCH").length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Tab filter
      if (activeTab === "NOT_LOCATED" && r.result !== "NOT_LOCATED" && r.result !== "PENDING") {
        return false;
      }
      if (activeTab === "NOT_ACCESSIBLE" && r.result !== "NOT_ACCESSIBLE") return false;
      if (activeTab === "CHECK_AGAIN" && r.result !== "CHECK_AGAIN") return false;
      if (activeTab === "MISSING" && r.result !== "MISSING") return false;
      if (activeTab === "FOUND" && r.result !== "FOUND") return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTag = r.item.tagId?.toLowerCase().includes(query);
        const matchesName = r.item.name?.toLowerCase().includes(query);
        const matchesRoom = r.item.room?.toLowerCase().includes(query);
        return matchesTag || matchesName || matchesRoom;
      }

      return true;
    });
  }, [rows, activeTab, searchQuery]);

  if (sessionQuery.isLoading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6" role="status" aria-label="Loading sorting workbench">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit session</h1>
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8 text-danger-600" />}
          heading="Audit session not found"
          body="The requested audit session could not be found."
          action={
            <Link to="/audits">
              <Button size="sm">Back to audit list</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isCompleted = session.completed || session.status === "COMPLETED" || session.status === "ACKNOWLEDGED";

  function openSortModal(
    itemId: string,
    tagId: string,
    name: string,
    targetResult: "NOT_ACCESSIBLE" | "CHECK_AGAIN" | "MISSING",
  ) {
    setSelectedItem({ itemId, tagId, name, targetResult });
    if (targetResult === "NOT_ACCESSIBLE") {
      setSortReason("Office or room locked");
    } else if (targetResult === "CHECK_AGAIN") {
      setSortReason("Holder away / returning next week");
      setCheckAgainDays(7);
    } else {
      setSortReason("Thorough search conducted - item not located");
    }
    setSortNote("");
  }

  async function handleSortSubmit() {
    if (!selectedItem) return;
    try {
      await sortMutation.mutateAsync({
        itemId: selectedItem.itemId,
        result: selectedItem.targetResult,
        sortReason,
        sortNote: sortNote || null,
        checkAgainDays: selectedItem.targetResult === "CHECK_AGAIN" ? checkAgainDays : null,
      });
      setSelectedItem(null);
    } catch {
      // Toast handles error
    }
  }

  async function handleFinalize() {
    try {
      const result = await finalizeMutation.mutateAsync();
      navigate(`/audit/${id}/report`, { state: { summary: result } });
    } catch {
      // Toast handles error
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Post-Audit Sorting Workbench</h1>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
              )}
            >
              {session.status || "SORTING"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Scope: <strong className="text-slate-800">{session.scopeValue || session.scopeType}</strong> · Started{" "}
            {formatDateTimeUTC(session.startedAt)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/audit/${id}/scan`}>
            <Button variant="outline" size="sm">
              Back to scan walk
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => setFinalizeConfirmOpen(true)}
            disabled={isCompleted || finalizeMutation.isPending}
            loading={finalizeMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Finalize & Lock Report
          </Button>
        </div>
      </div>

      {/* Exclusions Notice Banner */}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-950">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-indigo-900">Scope Snapshot & Exclusion Controls Active</span>
            <p className="text-indigo-800">
              {session.snapshotTotalCount ?? rows.length} in-scope items were frozen at session start. Terminal states
              (Lost, Disposed, Voided) are permanently excluded.{" "}
              {session.excludedAuditorCount !== undefined && session.excludedAuditorCount > 0 && (
                <strong className="font-medium underline decoration-indigo-300">
                  {session.excludedAuditorCount} auditor-held item(s) were excluded to avoid self-audit conflict of
                  interest.
                </strong>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Found" value={counts.found} tone="success" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard
          label="Unsorted (Not Located)"
          value={counts.notLocated}
          tone={counts.notLocated > 0 ? "warning" : "neutral"}
          icon={<HelpCircle className="h-5 w-5" />}
        />
        <StatCard
          label="Not Accessible"
          value={counts.notAccessible}
          tone="neutral"
          icon={<Lock className="h-5 w-5" />}
        />
        <StatCard label="Check Again" value={counts.checkAgain} tone="neutral" icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Missing" value={counts.missing} tone="danger" icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard
          label="Outside Scope"
          value={counts.mismatch}
          tone="danger"
          icon={<MapPinOff className="h-5 w-5" />}
        />
      </div>

      {/* Main Sorting Card */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: "NOT_LOCATED", label: `Unsorted (${counts.notLocated})` },
                { id: "NOT_ACCESSIBLE", label: `Not Accessible (${counts.notAccessible})` },
                { id: "CHECK_AGAIN", label: `Check Again (${counts.checkAgain})` },
                { id: "MISSING", label: `Missing (${counts.missing})` },
                { id: "FOUND", label: `Found (${counts.found})` },
                { id: "ALL", label: `All (${rows.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search tag or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-slate-300 py-1.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Item List */}
        {filteredRows.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-8 w-8 text-slate-400" />}
            heading="No items in this category"
            body={
              activeTab === "NOT_LOCATED"
                ? "All items have been accounted for or categorized!"
                : "No items match your active filter."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Sort Detail</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.itemId} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{row.item.name}</div>
                      <div className="font-mono text-xs text-slate-500">{row.item.tagId}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      <div>
                        {row.item.building || "Campus"} · Room {row.item.room || "N/A"}
                      </div>
                      <div className="text-slate-400">{row.item.department}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge result={row.result} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {row.sortReason ? (
                        <div>
                          <span className="font-semibold text-slate-800">{row.sortReason}</span>
                          {row.checkAgainDays && (
                            <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                              Retry in {row.checkAgainDays}d
                            </span>
                          )}
                          {row.sortNote && <div className="italic text-slate-400">{row.sortNote}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!isCompleted && row.result !== "FOUND" && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              openSortModal(row.itemId, row.item.tagId, row.item.name, "NOT_ACCESSIBLE")
                            }
                            className="rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                            title="Locked room or holder away"
                          >
                            Inaccessible
                          </button>
                          <button
                            type="button"
                            onClick={() => openSortModal(row.itemId, row.item.tagId, row.item.name, "CHECK_AGAIN")}
                            className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            title="Retry inspection in a few days"
                          >
                            Check Again
                          </button>
                          <button
                            type="button"
                            onClick={() => openSortModal(row.itemId, row.item.tagId, row.item.name, "MISSING")}
                            className="rounded px-2 py-1 text-xs font-medium text-danger-700 hover:bg-danger-100"
                            title="Mark as Missing (investigation)"
                          >
                            Missing
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Sort Item Modal Dialog */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Categorize:{" "}
              {selectedItem.targetResult === "NOT_ACCESSIBLE"
                ? "Not Accessible"
                : selectedItem.targetResult === "CHECK_AGAIN"
                  ? "Check Again Later"
                  : "Mark Missing"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Item: <strong>{selectedItem.name}</strong> ({selectedItem.tagId})
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">Reason</label>
                {selectedItem.targetResult === "NOT_ACCESSIBLE" && (
                  <select
                    value={sortReason}
                    onChange={(e) => setSortReason(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  >
                    <option value="Office or room locked">Office or room locked</option>
                    <option value="Custodian away / on travel">Custodian away / on travel</option>
                    <option value="Stored in high-security vault">Stored in high-security vault</option>
                    <option value="Laboratory experiment in progress">Laboratory experiment in progress</option>
                    <option value="Other inaccessible reason">Other inaccessible reason</option>
                  </select>
                )}
                {selectedItem.targetResult === "CHECK_AGAIN" && (
                  <select
                    value={sortReason}
                    onChange={(e) => setSortReason(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  >
                    <option value="Holder away / returning next week">Holder away / returning next week</option>
                    <option value="Keyholder unavailable today">Keyholder unavailable today</option>
                    <option value="Equipment scheduled for return">Equipment scheduled for return</option>
                    <option value="Re-check scheduled">Re-check scheduled</option>
                  </select>
                )}
                {selectedItem.targetResult === "MISSING" && (
                  <select
                    value={sortReason}
                    onChange={(e) => setSortReason(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-danger-900"
                  >
                    <option value="Thorough search conducted - item not located">
                      Thorough search conducted - item not located
                    </option>
                    <option value="No record of physical presence in assigned room">
                      No record of physical presence in assigned room
                    </option>
                    <option value="Custodian denies possession">Custodian denies possession</option>
                  </select>
                )}
              </div>

              {selectedItem.targetResult === "CHECK_AGAIN" && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Retry Window (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={checkAgainDays}
                    onChange={(e) => setCheckAgainDays(parseInt(e.target.value, 10) || 7)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Auditor will be prompted to revisit this item within {checkAgainDays} days.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Additional Note (Optional)
                </label>
                <textarea
                  value={sortNote}
                  onChange={(e) => setSortNote(e.target.value)}
                  placeholder="Enter any contextual details..."
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  rows={2}
                />
              </div>

              {selectedItem.targetResult === "MISSING" && (
                <div className="rounded-md bg-danger-50 p-3 text-xs text-danger-700">
                  <strong className="font-semibold">Notice:</strong> Marking an item Missing will officially notify
                  Property Officers to initiate asset loss and recovery procedures.
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedItem(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleSortSubmit()} loading={sortMutation.isPending}>
                Save Status
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Dialog */}
      <ConfirmDialog
        open={finalizeConfirmOpen}
        onClose={() => setFinalizeConfirmOpen(false)}
        onConfirm={() => void handleFinalize()}
        title="Finalize & Lock Audit Report?"
        body={
          <div className="flex flex-col gap-2">
            <p>
              Finalizing assigns a sequential report number (e.g. <code>AUD-2026-0001</code>) and permanently freezes the
              audit snapshot.
            </p>
            <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">
              <div>Found: {counts.found}</div>
              <div>Not Accessible: {counts.notAccessible}</div>
              <div>Check Again: {counts.checkAgain}</div>
              <div>Confirmed Missing: {counts.missing}</div>
              <div>Unsorted (Not Located): {counts.notLocated}</div>
            </div>
            {counts.missing > 0 && (
              <p className="mt-2 text-xs font-semibold text-danger-700">
                Property Officers will receive formal notifications regarding the {counts.missing} missing item(s).
              </p>
            )}
          </div>
        }
        confirmLabel="Finalize & Lock"
        loading={finalizeMutation.isPending}
      />
    </div>
  );
}

function StatusBadge({ result }: { result: AuditItemResult }) {
  switch (result) {
    case "FOUND":
      return <span className="rounded bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">Found</span>;
    case "NOT_LOCATED":
    case "PENDING":
      return (
        <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Not Located</span>
      );
    case "NOT_ACCESSIBLE":
      return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Inaccessible</span>;
    case "CHECK_AGAIN":
      return <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Check Again</span>;
    case "MISSING":
      return <span className="rounded bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700">Missing</span>;
    case "LOCATION_MISMATCH":
      return <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">Wrong Loc</span>;
    default:
      return <span className="text-xs text-slate-500">{result}</span>;
  }
}
