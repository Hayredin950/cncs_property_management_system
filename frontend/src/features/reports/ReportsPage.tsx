import { Download, FileBarChart, MonitorCheck, ScanLine } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { downloadDisposalsReport, downloadInventoryReport, downloadAuditReport, saveReport } from "../../api/reports";
import { useCategories } from "../../hooks/useCategories";
import { useItems } from "../../hooks/useItems";
import { toast } from "../../lib/toast";
import { ITEM_STATUSES, ITEM_STATUS_LABELS } from "../../types/enums";
import type { ItemStatus } from "../../types/enums";
import type { DisposalsReportQuery, InventoryReportQuery, ReportDownload } from "../../types/report";

/**
 * `/reports` (F10.1, F10.3) — the three CSV exports, each with exactly the
 * filters its endpoint supports:
 *
 * - **Inventory**: department, category, status, date range (registered).
 * - **Disposals**: department, date range (decided).
 * - **Audit**: the session id — one row per recorded scan/classification.
 *
 * Two rules this page exists to honour:
 *
 * 1. **Downloads go through `apiClient.blob()`** (see `api/reports.ts`), because
 *    the endpoints are behind `authenticate` — a plain `<a href>` would save a
 *    401 body under a `.csv` name.
 * 2. **Dates are UTC and `dateTo` includes the whole UTC day.** The inputs are
 *    labelled UTC for that reason; the server rejects a start-after-end range, so
 *    this page checks it first and says why rather than surfacing a raw 400.
 *
 * CSV only: F10.2's PDF is deliberately not built, and the page states it rather
 * than offering a disabled button.
 */
export function ReportsPage() {
  const navigate = useNavigate();
  const categoriesQuery = useCategories();
  const itemsQuery = useItems({ page: 1, limit: 100 });

  // One piece of state for whichever button is currently fetching — at most one
  // report downloads at a time, and the key drives that button's spinner.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inventory, setInventory] = useState({
    department: "",
    categoryId: "",
    status: "" as "" | ItemStatus,
    dateFrom: "",
    dateTo: "",
  });
  const [disposals, setDisposals] = useState({ department: "", dateFrom: "", dateTo: "" });
  const [auditId, setAuditId] = useState("");

  const departments = departmentsFrom(itemsQuery.data?.data ?? []);
  const categoryOptions = (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  async function run(key: string, fetcher: () => Promise<ReportDownload>) {
    setError(null);
    setPendingKey(key);
    try {
      const filename = await saveReport(fetcher);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't download the report";
      setError(message);
      toast.error(message);
    } finally {
      setPendingKey(null);
    }
  }

  /** Mirrors the server's `superRefine` so a bad range never reaches the API. */
  function rangeError(from: string, to: string): string | null {
    if (from && to && from > to) return "The start date must be on or before the end date.";
    return null;
  }

  function handleInventory() {
    const invalid = rangeError(inventory.dateFrom, inventory.dateTo);
    if (invalid) {
      setError(invalid);
      toast.error(invalid);
      return;
    }
    const query: InventoryReportQuery = {
      ...(inventory.department ? { department: inventory.department } : {}),
      ...(inventory.categoryId ? { categoryId: inventory.categoryId } : {}),
      ...(inventory.status ? { status: inventory.status } : {}),
      ...(inventory.dateFrom ? { dateFrom: inventory.dateFrom } : {}),
      ...(inventory.dateTo ? { dateTo: inventory.dateTo } : {}),
    };
    void run("inventory", () => downloadInventoryReport(query));
  }

  function handleDisposals() {
    const invalid = rangeError(disposals.dateFrom, disposals.dateTo);
    if (invalid) {
      setError(invalid);
      toast.error(invalid);
      return;
    }
    const query: DisposalsReportQuery = {
      ...(disposals.department ? { department: disposals.department } : {}),
      ...(disposals.dateFrom ? { dateFrom: disposals.dateFrom } : {}),
      ...(disposals.dateTo ? { dateTo: disposals.dateTo } : {}),
    };
    void run("disposals", () => downloadDisposalsReport(query));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every export is CSV, downloaded with your session&apos;s credentials. Date filters are UTC, and the end
          date includes the whole day.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}

      {/* Each export is its own named region: two of them filter by "Department",
          so without a region name a screen-reader user hears the same combo-box
          label twice with no way to tell which report it belongs to. */}
      <Card role="region" aria-label="Inventory" className="flex flex-col gap-4">
        <SectionHeading icon={<MonitorCheck className="h-4 w-4" aria-hidden="true" />} title="Inventory" />
        <p className="text-sm text-slate-600">
          One row per item — location, owner, value and condition. Disposed items are included (F7.2).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Department"
            value={inventory.department}
            onChange={(event) => setInventory({ ...inventory, department: event.target.value })}
            options={departments.map((name) => ({ value: name, label: name }))}
            placeholder="All departments"
            hint="Departments come from items already registered."
          />
          <Select
            label="Category"
            value={inventory.categoryId}
            onChange={(event) => setInventory({ ...inventory, categoryId: event.target.value })}
            options={categoryOptions}
            placeholder="All categories"
          />
          <Select
            label="Status"
            value={inventory.status}
            onChange={(event) => setInventory({ ...inventory, status: event.target.value as "" | ItemStatus })}
            options={ITEM_STATUSES.map((status) => ({ value: status, label: ITEM_STATUS_LABELS[status] }))}
            placeholder="In service and disposed"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Registered from"
              type="date"
              value={inventory.dateFrom}
              onChange={(event) => setInventory({ ...inventory, dateFrom: event.target.value })}
              hint="UTC"
            />
            <Input
              label="Registered to"
              type="date"
              value={inventory.dateTo}
              onChange={(event) => setInventory({ ...inventory, dateTo: event.target.value })}
              hint="UTC"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            leftIcon={<Download className="h-4 w-4" />}
            loading={pendingKey === "inventory"}
            onClick={handleInventory}
          >
            Download inventory CSV
          </Button>
        </div>
      </Card>

      <Card role="region" aria-label="Disposals" className="flex flex-col gap-4">
        <SectionHeading icon={<FileBarChart className="h-4 w-4" aria-hidden="true" />} title="Disposals" />
        <p className="text-sm text-slate-600">
          One row per approved disposal — who asked, who approved it, and why. Filtered by the decision date.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Department"
            value={disposals.department}
            onChange={(event) => setDisposals({ ...disposals, department: event.target.value })}
            options={departments.map((name) => ({ value: name, label: name }))}
            placeholder="All departments"
          />
          <Input
            label="Decided from"
            type="date"
            value={disposals.dateFrom}
            onChange={(event) => setDisposals({ ...disposals, dateFrom: event.target.value })}
            hint="UTC"
          />
          <Input
            label="Decided to"
            type="date"
            value={disposals.dateTo}
            onChange={(event) => setDisposals({ ...disposals, dateTo: event.target.value })}
            hint="UTC"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            leftIcon={<Download className="h-4 w-4" />}
            loading={pendingKey === "disposals"}
            onClick={handleDisposals}
          >
            Download disposals CSV
          </Button>
        </div>
      </Card>

      <Card role="region" aria-label="Audit session" className="flex flex-col gap-4">
        <SectionHeading icon={<ScanLine className="h-4 w-4" aria-hidden="true" />} title="Audit session" />
        <p className="text-sm text-slate-600">
          One row per recorded scan or classification for a session. Paste a session id, or open a session from the
          audit flow.
        </p>
        <Input
          label="Audit session ID"
          value={auditId}
          onChange={(event) => setAuditId(event.target.value)}
          placeholder="Paste the session id"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/audit/new")}>
            Start an audit
          </Button>
          <Button
            type="button"
            leftIcon={<Download className="h-4 w-4" />}
            loading={pendingKey === "audit"}
            disabled={!auditId.trim()}
            onClick={() => void run("audit", () => downloadAuditReport(auditId.trim()))}
          >
            Download audit CSV
          </Button>
        </div>
      </Card>

      <EmptyState
        icon={<FileBarChart className="h-8 w-8" />}
        heading="PDF exports aren't available"
        body="Only CSV is generated. A formatted PDF was marked a stretch item and deliberately not built — open the CSV in a spreadsheet instead."
      />
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {icon}
      {title}
    </h2>
  );
}

/** The known-department list is derived from `GET /items` — there is no departments endpoint (G9). */
function departmentsFrom(items: Array<{ department: string }>): string[] {
  return Array.from(new Set(items.map((item) => item.department)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
