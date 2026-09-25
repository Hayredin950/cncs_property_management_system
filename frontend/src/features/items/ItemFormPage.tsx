import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { DepartmentPicker } from "../../components/DepartmentPicker";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { PhotoField } from "../../components/PhotoField";
import { Select } from "../../components/Select";
import { Skeleton } from "../../components/Skeleton";
import { Textarea } from "../../components/Textarea";
import { useCategories } from "../../hooks/useCategories";
import { useCreateItem, useUpdateItem } from "../../hooks/useItemMutations";
import { useItemById } from "../../hooks/useItems";
import { useUsers } from "../../hooks/useUsers";
import { ApiError, NetworkError } from "../../types/api";
import type { UserSummary } from "../../types/user";
import { CONDITIONS, CONDITION_LABELS } from "../../types/enums";

/**
 * Mirrors the backend's `createItemSchema` (routes/items.ts) exactly — same
 * required fields, same minimums, same photo-source check (`isPhotoSource`, which
 * accepts an absolute URL or a site-relative path) — so the only way to see the
 * server's validation error is a real edge case (design doc §10.6).
 * `parentItemId` is deliberately absent: the API 400s on it and points at the
 * accessories endpoint.
 */
const itemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  categoryId: z.string().min(1, "Category is required"),
  department: z.string().trim().min(1, "Department is required"),
  building: z.string().trim().min(1, "Building is required"),
  floor: z.string().trim().min(1, "Floor is required"),
  room: z.string().trim().min(1, "Room is required"),
  ownerId: z.string().min(1, "Owner is required"),
  purchaseCost: z.coerce.number({ message: "Purchase cost must be a number" }).positive("Purchase cost must be positive"),
  currentValue: z
    .union([z.literal(""), z.coerce.number().positive("Current value must be positive")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : (v as number))),
  condition: z.enum(CONDITIONS),
  brand: z.string().trim().max(200).optional().or(z.literal("")),
  model: z.string().trim().max(200).optional().or(z.literal("")),
  serialNumber: z.string().trim().max(200).optional().or(z.literal("")),
  photoUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || isPhotoSource(value), {
      message: "Enter a full URL (https://…) or a path beginning with /",
    })
    .optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

type ItemFormValues = z.input<typeof itemSchema>;

/**
 * A photo source is either an absolute URL or a path on *this* site.
 *
 * The relative form is not a convenience — it is the correct one for the seeded
 * demo photos, which live in the frontend's `public/photos/` and are therefore
 * served from the app's own origin. Storing `http://localhost:5173/…` would bake
 * the dev host into the database and 404 the moment the app moved, the same way
 * a changed `PUBLIC_BASE_URL` kills every printed QR sticker (see
 * `public/photos/CREDITS.md`). `//host/path` is rejected because a browser reads
 * it as protocol-relative, i.e. as a remote host, not a local path.
 */
function isPhotoSource(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** `/items/new` and `/items/:id/edit` — one form, two modes (F2.1, F2.3, F2.4). */
export function ItemFormPage({ mode }: { mode: "create" | "edit" }) {
  return mode === "create" ? <CreateItemForm /> : <EditItemForm />;
}

/**
 * The request body both modes send.
 *
 * `ownerId` is a *parameter* rather than read from the form because the two modes
 * mean different things by it, and reading the field blindly got one of them wrong:
 *
 *   - **create** passes `values.ownerId` — the custodian the user actually picked,
 *     or the signed-in user when they left the dropdown alone (`defaultValues`
 *     seeds it). It used to pass `user.id` here, which silently overrode the
 *     dropdown: the select showed a custodian and the item was registered to
 *     whoever happened to be signed in. A picker that cannot pick is worse than no
 *     picker.
 *   - **edit** passes the item's own stored owner. Reassignment is an approved
 *     TRANSFER (`PUT /items/:id` refuses `ownerId` outright), so the form sends it
 *     back unchanged rather than inviting an edit that the server would reject.
 */
function toPayload(values: ItemFormValues, ownerId: string) {
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    department: values.department.trim(),
    building: values.building.trim(),
    floor: values.floor.trim(),
    room: values.room.trim(),
    ownerId,
    purchaseCost: Number(values.purchaseCost),
    // zod's `z.coerce.number()` types its *input* as an opaque object, so this
    // narrows explicitly rather than trusting the inferred union: empty string
    // and undefined both mean "no current value" to the API, never 0.
    currentValue:
      values.currentValue == null || values.currentValue === ""
        ? null
        : Number(values.currentValue),
    condition: values.condition,
    brand: values.brand ? values.brand : null,
    model: values.model ? values.model : null,
    serialNumber: values.serialNumber ? values.serialNumber : null,
    photoUrl: values.photoUrl ? values.photoUrl : null,
    notes: values.notes ? values.notes : null,
  };
}

/**
 * The custodian control (F2.1) — the one place an item's owner is decided.
 *
 * It used to offer exactly one option, the signed-in account, because a Staff
 * member has no way to enumerate accounts (G2). An **Admin** can (`GET /users` is
 * admin-only), and an admin is the person who actually registers an asset on
 * behalf of whoever holds it — so the list is every account for them, and just
 * themselves for Staff, with the hint saying which of the two it is instead of
 * leaving a one-option dropdown looking broken.
 *
 * This matters more than it looks: `PUT /items/:id` refuses `ownerId` (an owner
 * change is an approved TRANSFER), so registration is the *only* moment the
 * custodian can be set correctly without paperwork. Getting it wrong at the start
 * means a transfer request to fix a typo.
 */
function OwnerSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  const { user } = useAuth();
  // `GET /users` is Admin-only (gap G2), so a Staff registrar cannot enumerate
  // accounts — the request would only come back 403, which is why it is not sent.
  const canListAccounts = user?.role === "ADMIN";
  const usersQuery = useUsers(canListAccounts);

  /**
   * Who can hold the item, as far as this viewer can see.
   *
   * The signed-in account is always in the list even before `GET /users` answers:
   * a `<select>` whose `value` is not among its options renders blank, so a
   * custodian field that was seeded with "you" and had no matching option would
   * look empty on the one form that cannot be submitted without it.
   */
  const options = useMemo(() => {
    if (!user) return [];
    const accounts: UserSummary[] =
      canListAccounts && usersQuery.data ? usersQuery.data : [];
    const all = accounts.some((account) => account.id === user.id)
      ? accounts
      : [{ ...user, itemCount: 0 }, ...accounts];

    return all.map((account) => ({
      value: account.id,
      label: account.id === user.id ? `${account.fullName} (you)` : account.fullName,
    }));
  }, [canListAccounts, user, usersQuery.data]);

  return (
    <Select
      label="Owner (custodian)"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      options={options}
      hint={
        canListAccounts
          ? "Who will hold this item. Changing it after registration goes through an approved transfer request."
          : "Ownership is limited to your own account here — reassignment to someone else goes through an approved transfer request."
      }
      required
    />
  );
}

function CreateItemForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createMutation = useCreateItem();
  const categoriesQuery = useCategories();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    /*
      `ownerId` must be seeded, not left for the select to fill in on change.
      The owner control is a *controlled* select (`value`/`onChange`, not
      `register`), so an unset default means the field shows an option while
      react-hook-form still holds `undefined` — the form then blocked submit with
      zod's bare "Invalid input: expected string, received undefined" under it.
    */
    defaultValues: {
      condition: "GOOD",
      purchaseCost: "",
      currentValue: "",
      ownerId: user?.id ?? "",
    },
  });

  const photoUrl = watch("photoUrl");

  /**
   * A dropdown change has to mark the form dirty explicitly.
   *
   * `setValue` leaves `isDirty` alone unless asked, and the department picker is
   * the one control on this form that is not a registered input — so choosing a
   * department left Save greyed out and the form reading as unchanged until
   * something else was typed into somewhere else. `shouldValidate` too, so the
   * field's own error clears the way a typed input's would.
   */
  function setDepartment(value: string) {
    setValue("department", value, { shouldDirty: true, shouldValidate: true });
  }

  const categoryOptions = useMemo(
    () => (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );

  if (!user) return null;

  async function onSubmit(values: ItemFormValues) {
    try {
      const item = await createMutation.mutateAsync(toPayload(values, values.ownerId));
      navigate(`/item/${item.tagId}`);
    } catch {
      // Toast already shown by the mutation.
    }
  }

  return (
    <ItemFormShell
      title="Register an item"
      description="A tag ID is generated automatically when the item is saved."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <FormSection heading="Identity">
          <Input label="Name" error={errors.name?.message} {...register("name")} required />
          <Select
            label="Category"
            options={categoryOptions}
            placeholder={categoriesQuery.isPending ? "Loading categories…" : "Select a category"}
            error={errors.categoryId?.message}
            {...register("categoryId")}
            required
          />
        </FormSection>

        <FormSection heading="Location" columns>
          <DepartmentPicker value={watch("department") || ""} onChange={(v) => setDepartment(v)} error={errors.department?.message} />
          <Input label="Building" error={errors.building?.message} {...register("building")} required />
          <Input label="Floor" error={errors.floor?.message} {...register("floor")} required />
          <Input label="Room" error={errors.room?.message} {...register("room")} required />
        </FormSection>

        <FormSection heading="Ownership & value" columns>
          <OwnerSelect value={watch("ownerId") || ""} onChange={(v) => setValue("ownerId", v, { shouldDirty: true })} error={errors.ownerId?.message} />
          <Input label="Purchase cost (ETB)" type="number" step="0.01" min="0" error={errors.purchaseCost?.message} {...register("purchaseCost")} required />
          <Input label="Current value (ETB, optional)" type="number" step="0.01" min="0" error={errors.currentValue?.message} {...register("currentValue")} />
        </FormSection>

        <FormSection heading="Condition & specs">
          <Select
            label="Condition"
            options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
            error={errors.condition?.message}
            {...register("condition")}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Brand" error={errors.brand?.message} {...register("brand")} />
            <Input label="Model" error={errors.model?.message} {...register("model")} />
            <Input label="Serial number" error={errors.serialNumber?.message} {...register("serialNumber")} />
          </div>
          <PhotoField
            value={photoUrl ?? ""}
            onChange={(next) =>
              setValue("photoUrl", next, { shouldDirty: true, shouldValidate: true })
            }
            error={errors.photoUrl?.message}
          />
          <Textarea label="Notes" error={errors.notes?.message} {...register("notes")} />
        </FormSection>

        <div className="flex justify-end gap-3">
          <Link to="/items">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" loading={createMutation.isPending}>
            Register item
          </Button>
        </div>
      </form>
    </ItemFormShell>
  );
}

function EditItemForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Seeded from the item's own id now that `GET /items/:id` exists — the form no
  // longer needs the `?tag=` hand-off, so a bookmarked `/items/<uuid>/edit`
  // loads directly.
  const itemQuery = useItemById(id);

  if (itemQuery.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading item">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (itemQuery.isError) {
    return itemQuery.error instanceof NetworkError ? (
      <OfflineState />
    ) : (
      <ErrorState
        heading="Couldn't load this item"
        body={itemQuery.error instanceof Error ? itemQuery.error.message : undefined}
        action={
          <Button size="sm" onClick={() => itemQuery.refetch()}>Try again</Button>
        }
      />
    );
  }

  const item = itemQuery.data;
  const disposed = item.status === "DISPOSED";

  return <EditItemInner itemId={id ?? item.id} item={item} disposed={disposed} onDone={() => navigate(`/item/${item.tagId}`)} />;
}

function EditItemInner({
  itemId,
  item,
  disposed,
  onDone,
}: {
  itemId: string;
  item: Awaited<ReturnType<typeof useItemById>>["data"];
  disposed: boolean;
  onDone: () => void;
}) {
  const updateMutation = useUpdateItem(itemId);
  const categoriesQuery = useCategories();
  const { user } = useAuth();

  const [formError, setFormError] = useState<string | null>(null);

  const defaults = useMemo(
    () => ({
      name: item?.name ?? "",
      categoryId: item?.categoryId ?? "",
      department: item?.department ?? "",
      building: item?.building ?? "",
      floor: item?.floor ?? "",
      room: item?.room ?? "",
      ownerId: item?.ownerId ?? "",
      purchaseCost: item?.purchaseCost ?? "",
      currentValue: item?.currentValue ?? "",
      condition: item?.condition ?? "GOOD",
      brand: item?.brand ?? "",
      model: item?.model ?? "",
      serialNumber: item?.serialNumber ?? "",
      photoUrl: item?.photoUrl ?? "",
      notes: item?.notes ?? "",
    }),
    [item],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    values: defaults as ItemFormValues,
  });

  useEffect(() => {
    reset(defaults as ItemFormValues);
  }, [defaults, reset]);

  const photoUrl = watch("photoUrl");

  /** See `CreateItemForm`'s copy — a picker change must mark the form dirty. */
  function setDepartment(value: string) {
    setValue("department", value, { shouldDirty: true, shouldValidate: true });
  }

  const categoryOptions = useMemo(
    () => (categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );

  if (!item || !user) {
    return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  }

  async function onSubmit(values: ItemFormValues) {
    setFormError(null);
    try {
      // The API computes the edit-log diff server-side; the client sends the
      // full field set and lets `buildEditLogRows` decide what changed.
      // The item's own custodian, not the signed-in user's id: reassignment is a
      // transfer, so an edit must send the owner back unchanged. Sending the
      // editor's id here quietly reassigned every item anyone else touched, and
      // now that ownerId is transfer-only it would also refuse the save.
      await updateMutation.mutateAsync(toPayload(values, item?.ownerId ?? ""));
      onDone();
    } catch (err) {
      // 409 (disposed mid-edit) is the one server answer worth restating here.
      if (err instanceof ApiError && err.status === 409) {
        setFormError(err.message);
      }
    }
  }

  return (
    <ItemFormShell
      title={`Edit ${item.name}`}
      description={`Tag ${item.tagId} — every saved change writes an edit-history row.`}
      banner={
        disposed ? (
          <div className="flex items-start gap-2 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              This item was disposed and can't be edited. Disposal is terminal — the record is preserved as it
              was, and it remains visible in history and reports (F7.2).
            </span>
          </div>
        ) : undefined
      }
    >
      <fieldset disabled={disposed} className="flex flex-col gap-6 disabled:opacity-60">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
          <FormSection heading="Identity">
            <Input label="Name" error={errors.name?.message} {...register("name")} required />
            <Select
              label="Category"
              options={categoryOptions}
              placeholder="Select a category"
              error={errors.categoryId?.message}
              {...register("categoryId")}
              required
            />
          </FormSection>

          <FormSection heading="Location" columns>
            <DepartmentPicker
              value={watch("department") || ""}
              onChange={(v) => setDepartment(v)}
              error={errors.department?.message}
              disabled={disposed}
            />
            {/*
              Building, floor and room are `readOnly`, not `disabled`: the server
              compares the submitted body against the stored row, so unchanged
              values have to arrive with the request, and a disabled input can drop
              out of the submitted set. Moving an item is an approved TRANSFER
              request (SRS F6) — the rule `ownerId` below already followed, now
              applied to the other three transfer-only columns.
            */}
            <Input label="Building" error={errors.building?.message} {...register("building")} readOnly required />
            <Input label="Floor" error={errors.floor?.message} {...register("floor")} readOnly required />
            <Input label="Room" error={errors.room?.message} {...register("room")} readOnly required />
            {!disposed && (
              <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600 sm:col-span-2">
                Where this item is, and whose it is, can only change through an approved transfer.{" "}
                <Link
                  to={`/requests/new?item=${encodeURIComponent(item.tagId)}`}
                  className="font-medium text-brand-700 underline-offset-4 hover:underline"
                >
                  File a transfer request
                </Link>{" "}
                and an admin approves the move.
              </p>
            )}
          </FormSection>

          <FormSection heading="Ownership & value" columns>
            <Input label="Owner ID" error={errors.ownerId?.message} {...register("ownerId")} readOnly hint="Reassignment happens through an approved transfer request." />
            <Input label="Purchase cost (ETB)" type="number" step="0.01" error={errors.purchaseCost?.message} {...register("purchaseCost")} required />
            <Input label="Current value (ETB, optional)" type="number" step="0.01" error={errors.currentValue?.message} {...register("currentValue")} />
          </FormSection>

          <FormSection heading="Condition & specs">
            <Select
              label="Condition"
              options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
              error={errors.condition?.message}
              {...register("condition")}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Brand" error={errors.brand?.message} {...register("brand")} />
              <Input label="Model" error={errors.model?.message} {...register("model")} />
              <Input label="Serial number" error={errors.serialNumber?.message} {...register("serialNumber")} />
            </div>
            {/*
              Like the rest of the form, the photo is committed by Save: picking
              or photographing an image uploads it and stores the URL in the form,
              and nothing changes on the row until the user submits. That is why
              the picker needs no item id and reads the same in both modes.
            */}
            <PhotoField
              value={photoUrl ?? ""}
              onChange={(next) =>
                setValue("photoUrl", next, { shouldDirty: true, shouldValidate: true })
              }
              error={errors.photoUrl?.message}
              disabled={disposed}
            />
            <Textarea label="Notes" error={errors.notes?.message} {...register("notes")} />
          </FormSection>

          {formError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Link to={`/item/${item.tagId}`}>
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" loading={updateMutation.isPending} disabled={disposed || !isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </fieldset>
    </ItemFormShell>
  );
}

function ItemFormShell({
  title,
  description,
  banner,
  children,
}: {
  title: string;
  description: string;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {banner}
      {children}
    </div>
  );
}

function FormSection({ heading, columns, children }: { heading: string; columns?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{heading}</h2>
      <div className={columns ? "grid gap-4 sm:grid-cols-2" : "flex flex-col gap-4"}>{children}</div>
    </section>
  );
}
