import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, HelpCircle, MapPinOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LockedDepartmentPicker } from "../../components/DepartmentPicker";
import { useCreateAuditSession } from "../../hooks/useAudits";
import { saveWalkthrough } from "../../lib/auditWalkthrough";

/**
 * `/audit/new` (F9.1) — start a physical inventory audit.
 *
 * Scope is department-only on purpose: the backend's completion endpoint answers
 * `400 Unsupported scopeType` for anything else, so offering another scope would
 * create sessions that can never be finished. The picker is the **locked** one —
 * completion matches `scopeValue` against `Item.department` exactly and
 * case-sensitively, so free text here silently zeroes an audit's scope (gap G9).
 */

const auditSchema = z.object({
  department: z.string().trim().min(1, "Choose the department this audit covers"),
});

type AuditFormValues = z.infer<typeof auditSchema>;

export function AuditNewPage() {
  const navigate = useNavigate();
  const createMutation = useCreateAuditSession();

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AuditFormValues>({
    resolver: zodResolver(auditSchema),
    defaultValues: { department: "" },
  });

  const department = watch("department");

  async function onSubmit(values: AuditFormValues) {
    try {
      const session = await createMutation.mutateAsync({
        scopeType: "DEPARTMENT",
        scopeValue: values.department,
      });
      // Seed the walkthrough so a reload on the scan page still knows its scope.
      saveWalkthrough(session.id, { scopeValue: values.department, scanned: [] });
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
          Walk the department and scan each item. Nothing is written to the item records until you complete the
          audit.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">How an audit is classified</h2>
        <ul className="flex flex-col gap-3 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900">Found</strong> — an active item in this department
              that you scanned.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900">Missing</strong> — an active item in this department
              you didn't scan.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-slate-900">Wrong location</strong> — an item you scanned that
              isn't in this department.
            </span>
          </li>
        </ul>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <LockedDepartmentPicker
          label="Department to audit"
          value={department}
          onChange={(value) => setValue("department", value, { shouldValidate: true })}
          error={errors.department?.message}
        />

        <div className="flex justify-end">
          <Button type="submit" loading={createMutation.isPending} disabled={!department}>
            Start audit
          </Button>
        </div>
      </form>
    </div>
  );
}
