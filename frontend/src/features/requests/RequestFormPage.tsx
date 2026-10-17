import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { BuildingPicker } from "../../components/BuildingPicker";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DepartmentPicker } from "../../components/DepartmentPicker";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { Textarea } from "../../components/Textarea";
import { useItems } from "../../hooks/useItems";
import { useRequests } from "../../hooks/useRequests";
import { useCreateRequest } from "../../hooks/useRequestMutations";
import { useTransferRecipients } from "../../hooks/useTransferRecipients";
import { ApiError } from "../../types/api";
import { REQUEST_TYPES, REQUEST_TYPE_LABELS, REQUEST_STATUS_LABELS } from "../../types/enums";
import type { TransferRecipient } from "../../api/users";

/**
 * Mirrors the backend's `createRequestSchema` + `superRefine` (routes/requests.ts):
 * TRANSFER must name a new location, department and/or owner, DISPOSAL must name neither.
 */
const requestSchema = z
  .object({
    type: z.enum(REQUEST_TYPES),
    itemId: z.string().min(1, "Pick an item"),
    reason: z
      .string()
      .trim()
      .min(10, "Reason must be at least 10 characters")
      .max(1000, "Reason must be at most 1000 characters"),
    newLocationDepartment: z.string().trim().max(200).optional(),
    newLocationBuilding: z.string().trim().max(200).optional(),
    newLocationFloor: z.string().trim().max(200).optional(),
    newLocationRoom: z.string().trim().max(200).optional(),
    newOwnerId: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const namesLocation = Boolean(
      value.newLocationDepartment?.trim() ||
        value.newLocationBuilding?.trim() ||
        value.newLocationFloor?.trim() ||
        value.newLocationRoom?.trim(),
    );
    const namesOwner = Boolean(value.newOwnerId?.trim());

    if (value.type === "TRANSFER" && !namesLocation && !namesOwner) {
      ctx.addIssue({
        code: "custom",
        message: "A transfer must change the department, location, or owner",
        path: ["newLocationDepartment"],
      });
    }
    if (value.type === "DISPOSAL" && (namesLocation || namesOwner)) {
      ctx.addIssue({
        code: "custom",
        message: "A disposal must not include transfer fields",
        path: ["type"],
      });
    }
  });

type RequestFormValues = z.infer<typeof requestSchema>;

/** `/requests/new` — file a TRANSFER or DISPOSAL (F6.1, F7.1). */
export function RequestFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createMutation = useCreateRequest();
  const [serverError, setServerError] = useState<string | null>(null);

  // Custodian mode: POOL (department pool) or STAFF (specific staff searched by name)
  const [custodianMode, setCustodianMode] = useState<"POOL" | "STAFF">("POOL");
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<TransferRecipient | null>(null);

  // ?item=<tagId> preselects the item when arriving from an item's page.
  const presetTag = searchParams.get("item") ?? "";

  const itemsQuery = useItems({ page: 1, limit: 100 });
  const itemOptions = useMemo(
    () =>
      (itemsQuery.data?.data ?? []).map((item) => ({
        value: item.id,
        label: `${item.name} (${item.tagId})`,
      })),
    [itemsQuery.data],
  );

  const preset = (itemsQuery.data?.data ?? []).find((item) => item.tagId === presetTag);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      type: "TRANSFER",
      itemId: "",
      reason: "",
      newLocationDepartment: "",
      newLocationBuilding: "",
      newLocationFloor: "",
      newLocationRoom: "",
      newOwnerId: "",
    },
  });

  const selectedItemId = watch("itemId");
  const selectedItem = useMemo(
    () => (itemsQuery.data?.data ?? []).find((item) => item.id === selectedItemId),
    [itemsQuery.data, selectedItemId],
  );

  // Query active requests to detect whether this item is already in an active transfer/disposal workflow
  const requestsQuery = useRequests({ limit: 100 });
  const existingActiveRequest = useMemo(() => {
    if (!selectedItemId) return null;
    return (requestsQuery.data?.requests ?? []).find(
      (r) =>
        r.item.id === selectedItemId &&
        ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2", "WAITLISTED"].includes(r.status),
    );
  }, [requestsQuery.data, selectedItemId]);

  const isPendingClaim = selectedItem?.status === "PENDING_CLAIM";
  const isBlocked = Boolean(existingActiveRequest || isPendingClaim);

  const destinationDepartment = watch("newLocationDepartment");
  // Query transfer recipients strictly via search query to prevent bulk staff directory leaks
  const recipientsQuery = useTransferRecipients(staffSearch, destinationDepartment || undefined);

  /**
   * `?item=<tagId>` preselects the item
   */
  const presetItemId = preset?.id ?? "";
  useEffect(() => {
    if (presetItemId && !getValues("itemId")) {
      setValue("itemId", presetItemId);
    }
  }, [presetItemId, getValues, setValue]);

  const type = watch("type");

  async function onSubmit(values: RequestFormValues) {
    setServerError(null);
    try {
      const payload = {
        type: values.type,
        itemId: values.itemId,
        reason: values.reason.trim(),
        ...(values.type === "TRANSFER"
          ? {
              ...(values.newLocationDepartment?.trim()
                ? { newLocationDepartment: values.newLocationDepartment.trim() }
                : {}),
              ...(values.newLocationBuilding?.trim()
                ? { newLocationBuilding: values.newLocationBuilding.trim() }
                : {}),
              ...(values.newLocationFloor?.trim()
                ? { newLocationFloor: values.newLocationFloor.trim() }
                : {}),
              ...(values.newLocationRoom?.trim()
                ? { newLocationRoom: values.newLocationRoom.trim() }
                : {}),
              ...(values.newOwnerId?.trim() ? { newOwnerId: values.newOwnerId.trim() } : {}),
            }
          : {}),
      };
      await createMutation.mutateAsync(payload);
      navigate("/requests");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError(`${err.message} You can open the Requests queue to view and manage existing requests.`);
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">File a request</h1>
        <p className="mt-1 text-sm text-slate-500">
          Transfers and disposals are applied only after designated review and approvals.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Select
            label="Request type"
            options={REQUEST_TYPES.map((t) => ({ value: t, label: REQUEST_TYPE_LABELS[t] }))}
            error={errors.type?.message}
            {...register("type")}
            required
          />
          <Select
            label="Item"
            options={itemOptions}
            placeholder={itemsQuery.isPending ? "Loading items…" : "Select an item"}
            error={errors.itemId?.message}
            {...register("itemId")}
            required
          />

          {selectedItem && (
            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Current Assignment: </span>
              <span>
                Department: <strong>{selectedItem.department || "Unassigned"}</strong> · Location:{" "}
                <strong>
                  {[selectedItem.building, selectedItem.floor, selectedItem.room]
                    .filter(Boolean)
                    .join(" · ") || "N/A"}
                </strong>
              </span>
            </div>
          )}

          {/* Warning banner when item already has an active request or is in transfer process */}
          {existingActiveRequest && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-amber-950">
                    Active request already in progress for this item
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Status: <strong>{REQUEST_STATUS_LABELS[existingActiveRequest.status]}</strong>. You must withdraw this request before a new transfer or disposal can be filed.
                  </p>
                </div>
                <Link
                  to={`/requests/${existingActiveRequest.id}`}
                  className="shrink-0 rounded bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-300"
                >
                  View & Withdraw →
                </Link>
              </div>
            </div>
          )}

          {isPendingClaim && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold text-amber-950">
                Item is currently awaiting claim confirmation (PENDING_CLAIM)
              </p>
              <p className="mt-1 text-xs text-amber-800">
                The item has been transferred and is waiting for the recipient to accept custody. It cannot be transferred or requested until claimed or reverted.
              </p>
            </div>
          )}

          {/* Rendered for both types on purpose to preserve validation parity with the server */}
          <fieldset className="flex flex-col gap-4 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">
              New department, location & custodian
              {type === "DISPOSAL" ? " — leave blank for a disposal" : ""}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <DepartmentPicker
                label="Destination Department"
                value={watch("newLocationDepartment") || ""}
                onChange={(val) => {
                  setValue("newLocationDepartment", val, { shouldDirty: true, shouldValidate: true });
                }}
                error={errors.newLocationDepartment?.message}
              />
              <BuildingPicker
                label="Building"
                value={watch("newLocationBuilding") || ""}
                onChange={(val) => {
                  setValue("newLocationBuilding", val, { shouldDirty: true, shouldValidate: true });
                }}
                error={errors.newLocationBuilding?.message}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Floor"
                placeholder="e.g. 2nd Floor"
                error={errors.newLocationFloor?.message}
                {...register("newLocationFloor")}
              />
              <Input
                label="Room"
                placeholder="e.g. Lab 204"
                error={errors.newLocationRoom?.message}
                {...register("newLocationRoom")}
              />
            </div>

            {/* Custodian Selection: Pool vs Specific Staff Member (Search by name to prevent directory leak) */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <label className="text-sm font-medium text-slate-700">New Custodian Assignment</label>
              <div className="flex items-center gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="custodianMode"
                    value="POOL"
                    checked={custodianMode === "POOL"}
                    onChange={() => {
                      setCustodianMode("POOL");
                      setValue("newOwnerId", "", { shouldDirty: true, shouldValidate: true });
                      setSelectedStaff(null);
                    }}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Department pool (unassigned custodian)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="custodianMode"
                    value="STAFF"
                    checked={custodianMode === "STAFF"}
                    onChange={() => setCustodianMode("STAFF")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Assign to specific staff member</span>
                </label>
              </div>

              {custodianMode === "STAFF" && (
                <div className="mt-2 flex flex-col gap-2">
                  {selectedStaff ? (
                    <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50/50 p-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-900">{selectedStaff.fullName}</p>
                        <p className="text-xs text-brand-700">
                          {selectedStaff.role.replace("_", " ")}
                          {selectedStaff.departmentName ? ` · ${selectedStaff.departmentName}` : ""} ({selectedStaff.email})
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setSelectedStaff(null);
                          setValue("newOwnerId", "", { shouldDirty: true, shouldValidate: true });
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Input
                        label="Search staff by full name"
                        placeholder="Type staff member's name (at least 2 letters)..."
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        hint="For privacy, staff members can only be found by typing their full name."
                      />
                      {staffSearch.trim().length >= 2 && (
                        <div className="rounded-md border border-slate-200 bg-white p-2 shadow-sm max-h-48 overflow-y-auto">
                          {recipientsQuery.isPending ? (
                            <p className="p-2 text-xs text-slate-500">Searching active staff…</p>
                          ) : (recipientsQuery.data ?? []).length > 0 ? (
                            <ul className="flex flex-col divide-y divide-slate-100">
                              {(recipientsQuery.data ?? []).map((staff) => (
                                <li key={staff.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left p-2 hover:bg-brand-50 rounded transition-colors"
                                    onClick={() => {
                                      setSelectedStaff(staff);
                                      setValue("newOwnerId", staff.id, { shouldDirty: true, shouldValidate: true });
                                      if (staff.departmentName && !getValues("newLocationDepartment")) {
                                        setValue("newLocationDepartment", staff.departmentName, {
                                          shouldDirty: true,
                                          shouldValidate: true,
                                        });
                                      }
                                    }}
                                  >
                                    <p className="text-sm font-medium text-slate-900">{staff.fullName}</p>
                                    <p className="text-xs text-slate-500">
                                      {staff.role.replace("_", " ")}
                                      {staff.departmentName ? ` · ${staff.departmentName}` : ""} ({staff.email})
                                    </p>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="p-2 text-xs text-slate-500">
                              No active staff found matching &quot;{staffSearch}&quot;.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {errors.newOwnerId && (
                    <p className="text-xs text-danger-600">{errors.newOwnerId.message}</p>
                  )}
                </div>
              )}
            </div>
          </fieldset>

          {type === "DISPOSAL" && (
            <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700">
              Disposal is permanent. An approved disposal removes the item from browse, keeps it in history
              and reports, and can&apos;t be undone.
            </p>
          )}

          <Textarea
            label="Reason"
            hint="10–1000 characters. Say why — the reviewer approves based on this."
            error={errors.reason?.message}
            {...register("reason")}
            required
          />

          {serverError && (
            <div className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              <p role="alert">{serverError}</p>
              {serverError.includes("Requests") && (
                <Link
                  to="/requests"
                  className="mt-1 inline-block font-medium underline underline-offset-4"
                >
                  View requests →
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Link to="/requests">
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={createMutation.isPending}>
              Submit request
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
