import { Building2, PackageSearch, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState";
import { IconButton } from "../../components/IconButton";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/Skeleton";
import { Textarea } from "../../components/Textarea";
import {
  useBuildings,
  useCreateBuilding,
  useDeleteBuilding,
  useUpdateBuilding,
} from "../../hooks/useBuildings";
import { ApiError } from "../../types/api";
import type { Building } from "../../types/building";

interface FormValues {
  name: string;
  code: string;
  address: string;
  description: string;
}

/**
 * `GET /items?building=…` matches the building's **name** (the register is
 * everybody's to read, so the filter cannot need an office's permission), so
 * the link into the filtered register is the name.
 */
function itemsHref(building: Building): string {
  return `/items?building=${encodeURIComponent(building.name)}`;
}

/**
 * `/admin/buildings` — the college's buildings, and who may manage them.
 *
 * The endpoint existed (`GET/POST/PUT/DELETE /buildings`, `BUILDING_MANAGE`) and
 * nothing reached it: the register's building filter and the item form both
 * took the building as free text, so a building could be spelled two ways and
 * the filter would miss half the items filed under it. The screen is where the
 * names are fixed once.
 *
 * Delete is refused while the building holds items — by the server, and
 * mirrored here as a disabled control with the reason on it. Removing a
 * building that items point at would orphan them.
 */
export function AdminBuildingsPage() {
  const buildingsQuery = useBuildings();
  const createMutation = useCreateBuilding();
  const updateMutation = useUpdateBuilding();
  const deleteMutation = useDeleteBuilding();

  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Building | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Building | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { name: "", code: "", address: "", description: "" } });

  async function onCreate(values: FormValues) {
    setCreateError(null);
    try {
      await createMutation.mutateAsync({
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        address: values.address.trim() || undefined,
        description: values.description.trim() || undefined,
      });
      reset({ name: "", code: "", address: "", description: "" });
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  function openEdit(building: Building) {
    setEditing(building);
    setEditError(null);
  }

  async function onSave() {
    if (!editing) return;
    const name = editing.name.trim();
    const code = editing.code.trim().toUpperCase();
    if (!name || !code) {
      setEditError("A building needs a name and a code");
      return;
    }
    setEditError(null);
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        name,
        code,
        address: editing.address?.trim() || undefined,
        description: editing.description?.trim() || undefined,
      });
      setEditing(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Buildings</h1>
        <p className="mt-1 text-sm text-slate-500">
          The buildings of the college. Every item is filed against one, so the names here are the
          names the register is filtered by.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onCreate)} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Building name"
              placeholder="e.g. Science Complex"
              error={errors.name?.message}
              {...register("name", { required: "Building name is required" })}
              required
            />
            <Input
              label="Code"
              placeholder="e.g. SCI"
              hint="Short and unique — it is what the item form shows."
              error={errors.code?.message}
              {...register("code", { required: "Building code is required" })}
              required
            />
          </div>
          <Input label="Address" placeholder="e.g. P.O. Box 236" {...register("address")} />
          <Textarea label="Description" placeholder="What is in this building." {...register("description")} />
          <div className="flex justify-end">
            <Button type="submit" leftIcon={<Plus className="h-4 w-4" />} loading={createMutation.isPending}>
              Add building
            </Button>
          </div>
          {createError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {createError}
            </p>
          )}
        </form>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Existing buildings</h2>

        {buildingsQuery.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading buildings">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : buildingsQuery.isError ? (
          <ErrorState
            heading="Couldn't load buildings"
            body={buildingsQuery.error instanceof Error ? buildingsQuery.error.message : undefined}
            action={
              <Button size="sm" onClick={() => buildingsQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (buildingsQuery.data ?? []).length === 0 ? (
          <Card className="flex items-center gap-3 text-sm text-slate-500">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            No buildings yet. Add the college&apos;s first building to start registering assets against
            it.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {(buildingsQuery.data ?? []).map((building) => {
              const inUse = building.itemCount > 0;
              return (
                <li key={building.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {building.name}{" "}
                        <span className="tag-id text-xs text-slate-500">{building.code}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {inUse
                          ? `${building.itemCount} item${building.itemCount === 1 ? "" : "s"}`
                          : "No items yet"}
                        {building.address ? ` · ${building.address}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link to={itemsHref(building)}>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<PackageSearch className="h-4 w-4" aria-hidden="true" />}
                        >
                          View items
                        </Button>
                      </Link>
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                        label={`Edit ${building.name}`}
                        onClick={() => openEdit(building)}
                      />
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        label={
                          inUse
                            ? `Cannot delete ${building.name} — ${building.itemCount} items still use it`
                            : `Delete ${building.name}`
                        }
                        disabled={inUse}
                        onClick={() => setDeleting(building)}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit "${editing.name}"` : "Edit building"}
      >
        {editing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSave();
            }}
            className="flex flex-col gap-4"
          >
            <Input
              label="Building name"
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              error={editError ?? undefined}
              required
            />
            <Input
              label="Code"
              value={editing.code}
              onChange={(event) => setEditing({ ...editing, code: event.target.value })}
              required
            />
            <Input
              label="Address"
              value={editing.address ?? ""}
              onChange={(event) => setEditing({ ...editing, address: event.target.value })}
            />
            <Textarea
              label="Description"
              value={editing.description ?? ""}
              onChange={(event) => setEditing({ ...editing, description: event.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={updateMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={updateMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        title={deleting ? `Delete "${deleting.name}"?` : "Delete building"}
        tone="destructive"
        loading={deleteMutation.isPending}
        confirmLabel="Delete building"
        body={
          <>
            <strong>{deleting?.name}</strong> will be removed from the list of buildings. It holds no
            items, so nothing else changes.
            <br />
            <br />
            This cannot be undone.
          </>
        }
      />
    </div>
  );
}
