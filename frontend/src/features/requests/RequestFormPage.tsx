import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { Textarea } from "../../components/Textarea";
import { useItems } from "../../hooks/useItems";
import { useCreateRequest } from "../../hooks/useRequestMutations";
import { ApiError } from "../../types/api";
import { REQUEST_TYPES, REQUEST_TYPE_LABELS } from "../../types/enums";

/**
 * Mirrors the backend's `createRequestSchema` + `superRefine` (routes/requests.ts):
 * TRANSFER must name a new location and/or owner, DISPOSAL must name neither —
 * the API 400s on the wrong combination, so the form must never offer it
 * (frontend-plan.md §7). Reason length 10–1000, matching the server.
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
    newLocationBuilding: z.string().trim().max(200).optional(),
    newLocationFloor: z.string().trim().max(200).optional(),
    newLocationRoom: z.string().trim().max(200).optional(),
    newOwnerId: z.string().trim().max(200).optional(),
    // A loan names when the item is due back; the server refuses a loan with
    // no due date, and refuses a date in the past.
    loanDueDate: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const namesLocation = Boolean(
      value.newLocationBuilding?.trim() || value.newLocationFloor?.trim() || value.newLocationRoom?.trim(),
    );
    const namesOwner = Boolean(value.newOwnerId?.trim());

    if (value.type === "TRANSFER" && !namesLocation && !namesOwner) {
      ctx.addIssue({
        code: "custom",
        message: "A transfer must change the location or the owner",
        path: ["newLocationBuilding"],
      });
    }
    if (value.type === "DISPOSAL" && (namesLocation || namesOwner)) {
      ctx.addIssue({
        code: "custom",
        message: "A disposal must not include transfer fields",
        path: ["type"],
      });
    }
    if (value.type === "LOAN") {
      if (namesLocation || namesOwner) {
        ctx.addIssue({
          code: "custom",
          message: "A loan must not include transfer fields",
          path: ["type"],
        });
      }
      if (!value.loanDueDate) {
        ctx.addIssue({
          code: "custom",
          message: "A loan must say when the item is due back",
          path: ["loanDueDate"],
        });
      } else if (Number.isNaN(Date.parse(value.loanDueDate)) || Date.parse(value.loanDueDate) <= Date.now()) {
        ctx.addIssue({
          code: "custom",
          message: "The due date must be in the future",
          path: ["loanDueDate"],
        });
      }
    }
    if (value.type !== "LOAN" && value.loanDueDate) {
      ctx.addIssue({
        code: "custom",
        message: "Only a loan has a due date",
        path: ["loanDueDate"],
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
    },
  });

  /**
   * `?item=<tagId>` preselects the item — but `defaultValues` is read on the
   * first render, when `GET /items` hasn't answered yet, so the preset is always
   * undefined by then and the select silently stayed empty. Applying it in an
   * effect is the only way the "file a request from this item" path can work.
   *
   * `!getValues("itemId")` matters: once the user has chosen an item by hand, a
   * late-arriving list must not overwrite that choice.
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
              ...(values.newLocationBuilding?.trim() ? { newLocationBuilding: values.newLocationBuilding.trim() } : {}),
              ...(values.newLocationFloor?.trim() ? { newLocationFloor: values.newLocationFloor.trim() } : {}),
              ...(values.newLocationRoom?.trim() ? { newLocationRoom: values.newLocationRoom.trim() } : {}),
              ...(values.newOwnerId?.trim() ? { newOwnerId: values.newOwnerId.trim() } : {}),
            }
          : {}),
        // A loan names when the item is due back.
        ...(values.type === "LOAN" && values.loanDueDate?.trim()
          ? { loanDueDate: values.loanDueDate.trim() }
          : {}),
      };
      await createMutation.mutateAsync(payload);
      navigate("/requests");
    } catch (err) {
      // The plan's one special case: a second PENDING request on the same item
      // answers 409 — link to it instead of dead-ending the user.
      if (err instanceof ApiError && err.status === 409) {
        setServerError(`${err.message} Open the Requests page to see the pending request.`);
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
          Transfers and disposals are applied only after an admin approves.
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

          {/* A loan asks a different question: not where it is going, but until
              when it is out. The due date is required, and the server refuses a
              date in the past. */}
          {type === "LOAN" && (
            <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-4">
              <label htmlFor="loanDueDate" className="text-sm font-medium text-slate-700">
                Due back on
              </label>
              <input
                id="loanDueDate"
                type="date"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                {...register("loanDueDate")}
              />
              <p className="text-xs text-slate-500">
                The loan clock starts when the borrower claims the item, not when it is approved.
              </p>
              {errors.loanDueDate?.message && (
                <p role="alert" className="text-xs text-danger-700">
                  {errors.loanDueDate.message}
                </p>
              )}
            </div>
          )}

          {/* Rendered for *both* types on purpose. The server rejects a DISPOSAL
              that names any transfer field with a 400, so the client mirrors that
             `superRefine` rather than hiding the fields: hiding them would let a
              user believe an invalid combination is fine, and would make the
              parity rule untestable from the UI. */}
          <fieldset className="flex flex-col gap-4 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">
              New location / owner{type === "DISPOSAL" ? " — leave blank for a disposal" : ""}
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Building" error={errors.newLocationBuilding?.message} {...register("newLocationBuilding")} />
              <Input label="Floor" error={errors.newLocationFloor?.message} {...register("newLocationFloor")} />
              <Input label="Room" error={errors.newLocationRoom?.message} {...register("newLocationRoom")} />
            </div>
            <Input
              label="New owner ID (optional)"
              hint="The user id of the new custodian — usually the person receiving the item."
              error={errors.newOwnerId?.message}
              {...register("newOwnerId")}
            />
          </fieldset>

          {type === "DISPOSAL" && (
            <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700">
              Disposal is permanent. An approved disposal removes the item from browse, keeps it in history and
              reports, and can't be undone.
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
              {serverError.includes("pending") && (
                <Link to="/requests" className="mt-1 inline-block font-medium underline underline-offset-4">
                  View requests →
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Link to="/requests">
              <Button variant="outline" type="button">Cancel</Button>
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
