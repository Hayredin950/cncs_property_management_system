import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, HelpCircle, MapPinOff } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { fetchItems } from "../../api/items";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LockedDepartmentPicker } from "../../components/DepartmentPicker";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { useCreateAuditSession } from "../../hooks/useAudits";
import { saveWalkthrough } from "../../lib/auditWalkthrough";

/**
 * `/audit/new` (F9.1) — start a physical inventory audit.
 *
 * Scope can be a **department** or a **building** now. Building support was
 * added alongside the read-back: the completion endpoint used to answer
 * `400 Unsupported scopeType` for anything but DEPARTMENT, which made the
 * limitation the UI's problem. Both scopes match their item column
 * case-insensitively server-side, so a value typed in a different case still
 * lands in the same audit.
 */

const auditSchema = z.object({
  scopeType: z.enum(["DEPARTMENT", "BUILDING"]),
  scopeValue: z.string().trim().min(1, "Choose what this audit covers"),
});

type AuditFormValues = z.infer<typeof auditSchema>;

export function AuditNewPage() {
  const navigate = useNavigate();
  const createMutation = useCreateAuditSession();

  const {
    handleSubmit,
    watch,
    setValue,
    register,
    formState: { errors },
  } = useForm<AuditFormValues>({
    resolver: zodResolver(auditSchema),
    defaultValues: { scopeType: "DEPARTMENT", scopeValue: "" },
  });

  const scopeType = watch("scopeType");
  const scopeValue = watch("scopeValue");

  // Buildings are free text on items and there is no buildings endpoint, so the
  // suggestions are derived from the register (best effort), while the audit
  // itself still matches exactly-but-case-insensitively on the server.
  const itemsQuery = useQuery({
    queryKey: ["items", "audit-building-suggestions"],
    queryFn: ({ signal }) => fetchItems({ page: 1, limit: 100 }, signal),
  });
  const buildingSuggestions = useMemo(
    () =>
      Array.from(new Set((itemsQuery.data?.data ?? []).map((item) => item.building)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [itemsQuery.data],
  );

  function switchScope(nextType: "DEPARTMENT" | "BUILDING") {
    setValue("scopeType", nextType, { shouldValidate: false });
    setValue("scopeValue", "", { shouldValidate: false });
  }

  async function onSubmit(values: AuditFormValues) {
    try {
      const session = await createMutation.mutateAsync({
        scopeType: values.scopeType,
        scopeValue: values.scopeValue,
      });
      // Seed the walkthrough so a reload on the scan page still knows its scope.
      saveWalkthrough(session.id, { scopeValue: values.scopeValue, scanned: [] });
      navigate(`/audit/${session.id}/scan`);
    } catch {
      // Toast already shown by the mutation; the form stays filled in.
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Start an audit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Walk the area and scan each item. Nothing is written to the item records until you complete the audit.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">How an audit is classified</h2>
        <ul className="flex flex-col gap-3 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900">Found</strong> — an active item in this scope that you
              scanned.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900">Missing</strong> — an active item in this scope you
              didn&apos;t scan.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900">Outside scope</strong> — an item you scanned that
              isn&apos;t in this scope.
            </span>
          </li>
        </ul>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Select
          label="Audit by"
          options={[
            { value: "DEPARTMENT", label: "Department" },
            { value: "BUILDING", label: "Building" },
          ]}
          value={scopeType}
          onChange={(event) => switchScope(event.target.value as "DEPARTMENT" | "BUILDING")}
          required
        />

        {scopeType === "DEPARTMENT" ? (
          <LockedDepartmentPicker
            label="Department to audit"
            value={scopeValue}
            onChange={(value) => setValue("scopeValue", value, { shouldValidate: true })}
            error={errors.scopeValue?.message}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Input
              label="Building to audit"
              list="audit-building-suggestions"
              autoComplete="off"
              placeholder="e.g. CNCS Building"
              error={errors.scopeValue?.message}
              {...register("scopeValue")}
            />
            <datalist id="audit-building-suggestions">
              {buildingSuggestions.map((building) => (
                <option key={building} value={building} />
              ))}
            </datalist>
            <p className="text-xs text-slate-500">
              Buildings come from the register. Matching ignores letter case.
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={createMutation.isPending} disabled={!scopeValue}>
            Start audit
          </Button>
        </div>
      </form>
    </div>
  );
}
