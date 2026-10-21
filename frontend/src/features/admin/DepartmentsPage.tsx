import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { SkeletonText } from "../../components/Skeleton";
import { apiClient } from "../../lib/apiClient";
import { useActivateDepartmentHead } from "../../hooks/useAuthMutations";
import { useUsers } from "../../hooks/useUsers";
import type { UserSummary } from "../../types/user";

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
  acceptsSelfReg: boolean;
  college: string | null;
  head: { id: string; fullName: string; email: string } | null;
  staffCount: number;
}

/**
 * `/admin/departments` — the college's departments, and how to add one.
 *
 * A college's departments are not a fixed list forever: a new programme means
 * a new department, and the register has to be able to hold it. Before this,
 * adding one meant writing to the database by hand.
 */
export function DepartmentsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [acceptsSelfReg, setAcceptsSelfReg] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [appointing, setAppointing] = useState<DepartmentRow | null>(null);
  const [newHeadId, setNewHeadId] = useState("");

  const accountsQuery = useUsers(true);
  const activateHead = useActivateDepartmentHead();
  const accounts = accountsQuery.data ?? [];

  const departmentsQuery = useQuery({
    queryKey: ["departments", "admin"],
    queryFn: async (): Promise<DepartmentRow[]> =>
      apiClient.get<DepartmentRow[]>("/departments/admin"),
    retry: false,
  });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.post<{ department: { name: string } }>("/departments", {
        name: name.trim(),
        code: code.trim(),
        acceptsSelfReg,
      });
      setCreated(response.department.name);
      setAddOpen(false);
      setName("");
      setCode("");
      await departmentsQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the department.");
    } finally {
      setBusy(false);
    }
  }

  const departments = (departmentsQuery.data ?? []).filter((unit) => unit.type === "DEPARTMENT");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Departments</h1>
          <p className="mt-1 text-sm text-slate-600">
            The departments of the college, who heads each one, and whether their staff may ask
            for an account online.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
          Add a department
        </Button>
      </div>

      {created && (
        <p role="status" className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800">
          {created} has been added. It has no head yet — a request from it waits for a system
          administrator until one is appointed.
        </p>
      )}

      {departmentsQuery.isPending ? (
        <Card>
          <div role="status" aria-label="Loading departments">
            <SkeletonText lines={4} />
          </div>
        </Card>
      ) : departmentsQuery.isError ? (
        <ErrorState
          heading="Couldn't load the departments"
          body={departmentsQuery.error instanceof Error ? departmentsQuery.error.message : undefined}
        />
      ) : departments.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          heading="No departments yet"
          body="Add the college's first department to start registering assets against it."
        />
      ) : (
        <Card className="flex flex-col gap-0 p-0">
          <ul className="flex flex-col divide-y divide-slate-200">
            {departments.map((department) => (
              <li
                key={department.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {department.name}{" "}
                    <span className="tag-id text-xs text-slate-500">{department.code}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {department.head ? (
                      <>Head: {department.head.fullName}</>
                    ) : (
                      <>No head appointed</>
                    )}
                    {" · "}
                    {department.staffCount} staff
                    {" · "}
                    {department.acceptsSelfReg
                      ? "accepts online account requests"
                      : "does not accept online account requests"}
                  </p>
                </div>
                {!department.head && (
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-warning-200 bg-warning-50 px-2 py-1 text-xs text-warning-800">
                      Headless
                    </span>
                    {/* The handover. The unit's held items move to
                        "returned unverified" and the new head verifies them
                        one by one; the items the previous head held
                        personally are not moved to them — a role change never
                        moves personal custody. */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAppointing(department);
                        setNewHeadId("");
                      }}
                    >
                      Appoint a head
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={appointing !== null}
        onClose={() => setAppointing(null)}
        title={appointing ? `Appoint the head of ${appointing.name}` : "Appoint a head"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            The department's held items move to &quot;returned unverified&quot; and the new
            head verifies them one by one. The items the previous head held personally
            stay with them — a role change never moves personal custody.
          </p>
          <Select
            label="New head"
            value={newHeadId}
            onChange={(event) => setNewHeadId(event.target.value)}
            options={[
              { value: "", label: "Choose a person…" },
              ...accounts
                .filter(
                  (account: UserSummary) =>
                    account.accountStatus === "ACTIVE" &&
                    (account.role === "STAFF" || account.role === "DEPARTMENT_HEAD"),
                )
                .map((account: UserSummary) => ({
                  value: account.id,
                  label: `${account.fullName} (${account.email})`,
                })),
            ]}
          />
          {activateHead.isError && (
            <p role="alert" className="text-sm text-danger-700">
              {activateHead.error instanceof Error
                ? activateHead.error.message
                : "Couldn't appoint the head."}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAppointing(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={activateHead.isPending}
              disabled={!newHeadId || !appointing}
              onClick={() => {
                if (!appointing) return;
                activateHead.mutate(
                  { orgUnitId: appointing.id, newHeadId },
                  { onSuccess: () => setAppointing(null) },
                );
              }}
            >
              Appoint
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a department">
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            placeholder="Environmental Engineering"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Input
            label="Code"
            placeholder="ENVE"
            hint="Short and unique — the letters people will see on a tag."
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={acceptsSelfReg}
              onChange={(event) => setAcceptsSelfReg(event.target.checked)}
            />
            Staff of this department may ask for an account online
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} disabled={!name.trim() || !code.trim()} onClick={submit}>
              Add the department
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
