import { Download, FileBarChart, FileText, MonitorCheck, ScanLine, Package } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { downloadDisposalsReport, downloadInventoryReport, downloadAuditReport, downloadAuditEvidencePack, saveReport } from "../../api/reports";
import { useCategories } from "../../hooks/useCategories";
import { useDepartments } from "../../hooks/useDepartments";
import { useAuditsList } from "../../hooks/useAudits";
import { toast } from "../../lib/toast";
import { ITEM_STATUSES, ITEM_STATUS_LABELS } from "../../types/enums";
import type { ItemStatus } from "../../types/enums";
import type {
  DisposalsReportQuery,
  InventoryReportQuery,
  ReportDownload,
  ReportFormat,
} from "../../types/report";

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoriesQuery = useCategories();
  const departmentsQuery = useDepartments();
  const auditsQuery = useAuditsList({ page: 1 });

  const activeTab = searchParams.get("tab") || "inventory";

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
  const [evidencePack, setEvidencePack] = useState({ dateFrom: "", dateTo: "" });

  const departmentOptions = (departmentsQuery.data ?? []).map((d) => ({ value: d.name, label: d.name }));
  const categoryOptions = (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const auditOptions = (auditsQuery.data?.audits ?? []).map((a) => ({
    value: a.id,
    label: `${a.scopeValue || a.scopeType} (${a.id.slice(0, 8)}...)`,
  }));

  const datePresets = [
    { value: "", label: "Custom" },
    { value: "today", label: "Today" },
    { value: "this-week", label: "This week" },
    { value: "this-month", label: "This month" },
    { value: "last-30-days", label: "Last 30 days" },
    { value: "this-year", label: "This year" },
  ];

  function setTab(tab: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  }

  function applyDatePreset(preset: string, target: "inventory" | "disposals" | "evidence") {
    const now = new Date();
    let dateFrom = "";
    let dateTo = "";

    if (preset === "today") {
      const fromStr = now.toISOString().split("T")[0];
      if (fromStr) dateFrom = fromStr;
      const toStr = now.toISOString().split("T")[0];
      if (toStr) dateTo = toStr;
    } else if (preset === "this-week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const from = new Date(now.setDate(diff));
      const fromStr = from.toISOString().split("T")[0];
      if (fromStr) dateFrom = fromStr;
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      const toStr = to.toISOString().split("T")[0];
      if (toStr) dateTo = toStr;
    } else if (preset === "this-month") {
      const fromStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      if (fromStr) dateFrom = fromStr;
      const toStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      if (toStr) dateTo = toStr;
    } else if (preset === "last-30-days") {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fromStr = from.toISOString().split("T")[0];
      if (fromStr) dateFrom = fromStr;
      const toStr = now.toISOString().split("T")[0];
      if (toStr) dateTo = toStr;
    } else if (preset === "this-year") {
      const fromStr = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      if (fromStr) dateFrom = fromStr;
      const toStr = new Date(now.getFullYear(), 11, 31).toISOString().split("T")[0];
      if (toStr) dateTo = toStr;
    }

    if (target === "inventory") {
      setInventory({ ...inventory, dateFrom, dateTo });
    } else if (target === "disposals") {
      setDisposals({ ...disposals, dateFrom, dateTo });
    } else if (target === "evidence") {
      setEvidencePack({ ...evidencePack, dateFrom, dateTo });
    }
  }

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

  function rangeError(from: string, to: string): string | null {
    if (from && to && from > to) return "The start date must be on or before the end date.";
    return null;
  }

  function handleInventory(format: ReportFormat) {
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
    void run(`inventory-${format}`, () => downloadInventoryReport(query, format));
  }

  function handleDisposals(format: ReportFormat) {
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
    void run(`disposals-${format}`, () => downloadDisposalsReport(query, format));
  }

  function handleEvidencePack(format: ReportFormat) {
    const invalid = rangeError(evidencePack.dateFrom, evidencePack.dateTo);
    if (invalid) {
      setError(invalid);
      toast.error(invalid);
      return;
    }
    if (!evidencePack.dateFrom || !evidencePack.dateTo) {
      setError("Both date fields are required for the evidence pack");
      toast.error("Both date fields are required for the evidence pack");
      return;
    }
    void run(`evidence-pack-${format}`, () =>
      downloadAuditEvidencePack({ dateFrom: evidencePack.dateFrom, dateTo: evidencePack.dateTo }, format)
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every export is available as CSV or PDF, downloaded with your session&apos;s credentials. Date filters are
          UTC, and the end date includes the whole day.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab("inventory")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "inventory"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Inventory
        </button>
        <button
          onClick={() => setTab("disposals")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "disposals"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Disposals
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "audit"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Audit session
        </button>
        <button
          onClick={() => setTab("evidence")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "evidence"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Evidence pack
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}

      {activeTab === "inventory" && (
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
              options={departmentOptions}
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
            <Select
              label="Date preset"
              value=""
              onChange={(event) => applyDatePreset(event.target.value, "inventory")}
              options={datePresets}
              placeholder="Quick select"
            />
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
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileText className="h-4 w-4" />}
              loading={pendingKey === "inventory-pdf"}
              onClick={() => handleInventory("pdf")}
            >
              Download inventory PDF
            </Button>
            <Button
              type="button"
              leftIcon={<Download className="h-4 w-4" />}
              loading={pendingKey === "inventory-csv"}
              onClick={() => handleInventory("csv")}
            >
              Download inventory CSV
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "disposals" && (
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
              options={departmentOptions}
              placeholder="All departments"
            />
            <Select
              label="Date preset"
              value=""
              onChange={(event) => applyDatePreset(event.target.value, "disposals")}
              options={datePresets}
              placeholder="Quick select"
            />
            <div />
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
            <div />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileText className="h-4 w-4" />}
              loading={pendingKey === "disposals-pdf"}
              onClick={() => handleDisposals("pdf")}
            >
              Download disposals PDF
            </Button>
            <Button
              type="button"
              leftIcon={<Download className="h-4 w-4" />}
              loading={pendingKey === "disposals-csv"}
              onClick={() => handleDisposals("csv")}
            >
              Download disposals CSV
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "audit" && (
        <Card role="region" aria-label="Audit session" className="flex flex-col gap-4">
          <SectionHeading icon={<ScanLine className="h-4 w-4" aria-hidden="true" />} title="Audit session" />
          <p className="text-sm text-slate-600">
            One row per scan — the item, the result, and when it was recorded (F9.3).
          </p>
          <Select
            label="Session"
            value={auditId}
            onChange={(event) => setAuditId(event.target.value)}
            options={auditOptions}
            placeholder="Select an audit session"
            hint="Only completed sessions can be exported."
          />
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileText className="h-4 w-4" />}
              loading={pendingKey === "audit-pdf"}
              disabled={!auditId}
              onClick={() => {
                if (!auditId) return;
                void run(`audit-pdf`, () => downloadAuditReport(auditId, "pdf"));
              }}
            >
              Download audit PDF
            </Button>
            <Button
              type="button"
              leftIcon={<Download className="h-4 w-4" />}
              loading={pendingKey === "audit-csv"}
              disabled={!auditId}
              onClick={() => {
                if (!auditId) return;
                void run(`audit-csv`, () => downloadAuditReport(auditId, "csv"));
              }}
            >
              Download audit CSV
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "evidence" && (
        <Card role="region" aria-label="Evidence pack" className="flex flex-col gap-4">
          <SectionHeading icon={<Package className="h-4 w-4" aria-hidden="true" />} title="Evidence pack" />
          <p className="text-sm text-slate-600">
            Evidence photos for items marked MISSING in the selected date range.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Date preset"
              value=""
              onChange={(event) => applyDatePreset(event.target.value, "evidence")}
              options={datePresets}
              placeholder="Quick select"
            />
            <div />
            <Input
              label="From"
              type="date"
              value={evidencePack.dateFrom}
              onChange={(event) => setEvidencePack({ ...evidencePack, dateFrom: event.target.value })}
              hint="UTC"
            />
            <Input
              label="To"
              type="date"
              value={evidencePack.dateTo}
              onChange={(event) => setEvidencePack({ ...evidencePack, dateTo: event.target.value })}
              hint="UTC"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileText className="h-4 w-4" />}
              loading={pendingKey === "evidence-pack-pdf"}
              onClick={() => handleEvidencePack("pdf")}
            >
              Download evidence pack PDF
            </Button>
            <Button
              type="button"
              leftIcon={<Download className="h-4 w-4" />}
              loading={pendingKey === "evidence-pack-csv"}
              onClick={() => handleEvidencePack("csv")}
            >
              Download evidence pack CSV
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-100 text-brand-600">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
    </div>
  );
}
