import { FolderPlus, PackageSearch, Pencil, Trash2 } from "lucide-react";
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
import { useCategories } from "../../hooks/useCategories";
import {
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "../../hooks/useAuthMutations";
import type { Category } from "../../types/category";
import { ApiError } from "../../types/api";

interface FormValues {
  name: string;
}

/** `/items?categoryId=…` is the register's own filter, so the count is a link into it. */
function itemsHref(category: Category): string {
  return `/items?categoryId=${encodeURIComponent(category.id)}`;
}

/**
 * `/admin/categories` (F2.4) — create, rename and delete.
 *
 * The list is no longer a row of pills: each category shows how many items are
 * filed under it and links through to the register filtered to that category, so
 * "where is this used?" is one click rather than a guess.
 *
 * Delete is refused while a category is in use — by the server, and mirrored
 * here as a disabled control with the reason on it. That is not just politeness:
 * `Item.categoryId` is required, so removing a populated category would mean
 * destroying or orphaning items, and F7.2 forbids exactly that.
 */
export function AdminCategoriesPage() {
  const categoriesQuery = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { name: "" } });

  async function onCreate(values: FormValues) {
    setCreateError(null);
    try {
      await createMutation.mutateAsync(values.name.trim());
      reset({ name: "" });
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  function openEdit(category: Category) {
    setEditing(category);
    setEditName(category.name);
    setEditError(null);
  }

  async function onRename() {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      setEditError("Category name is required");
      return;
    }
    setEditError(null);
    try {
      await updateMutation.mutateAsync({ id: editing.id, name });
      setEditing(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
        <p className="mt-1 text-sm text-slate-500">
          Categories classify items everywhere — registration, filters, reports.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onCreate)} noValidate className="flex items-end gap-3">
          <Input
            label="New category name"
            placeholder="e.g. Projectors"
            error={errors.name?.message}
            {...register("name", { required: "Category name is required" })}
            className="flex-1"
            required
          />
          <Button type="submit" leftIcon={<FolderPlus className="h-4 w-4" />} loading={createMutation.isPending}>
            Add
          </Button>
        </form>
        {createError && (
          <p role="alert" className="mt-3 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {createError}
          </p>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Existing categories</h2>

        {categoriesQuery.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading categories">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : categoriesQuery.isError ? (
          <ErrorState
            heading="Couldn't load categories"
            body={categoriesQuery.error instanceof Error ? categoriesQuery.error.message : undefined}
            action={
              <Button size="sm" onClick={() => categoriesQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (categoriesQuery.data ?? []).length === 0 ? (
          <Card className="text-sm text-slate-500">No categories yet.</Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {(categoriesQuery.data ?? []).map((category) => {
              const inUse = category.itemCount > 0;
              return (
                <li key={category.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link
                        to={itemsHref(category)}
                        className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {category.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {inUse
                          ? `${category.itemCount} item${category.itemCount === 1 ? "" : "s"}`
                          : "No items yet"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link to={itemsHref(category)}>
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
                        label={`Rename ${category.name}`}
                        onClick={() => openEdit(category)}
                      />
                      {/*
                        The delete stays visible but disabled while the category
                        is in use, with the reason in the accessible name — hiding
                        it would leave an administrator wondering where it went.
                      */}
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        label={
                          inUse
                            ? `Cannot delete ${category.name} — ${category.itemCount} items still use it`
                            : `Delete ${category.name}`
                        }
                        disabled={inUse}
                        onClick={() => setDeleting(category)}
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
        title={editing ? `Rename "${editing.name}"` : "Rename category"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onRename();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Category name"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            error={editError ?? undefined}
            required
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
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        title={deleting ? `Delete "${deleting.name}"?` : "Delete category"}
        tone="destructive"
        loading={deleteMutation.isPending}
        confirmLabel="Delete category"
        body={
          <>
            <strong>{deleting?.name}</strong> will be removed from every category list. It has no items, so nothing
            else changes.
            <br />
            <br />
            This cannot be undone.
          </>
        }
      />
    </div>
  );
}
