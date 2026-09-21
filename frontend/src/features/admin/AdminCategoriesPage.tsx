import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { useCategories } from "../../hooks/useCategories";
import { useCreateCategory } from "../../hooks/useAuthMutations";
import { ApiError } from "../../types/api";

interface FormValues {
  name: string;
}

/**
 * `/admin/categories` (F2.4) — create-only, same G2-shaped reality as the
 * users page (no update/delete endpoints). Duplicate names answer 409 with the
 * server's message. The existing list is `GET /categories`, which does exist.
 */
export function AdminCategoriesPage() {
  const categoriesQuery = useCategories();
  const createMutation = useCreateCategory();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { name: "" } });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createMutation.mutateAsync(values.name.trim());
      reset({ name: "" });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
        <p className="mt-1 text-sm text-slate-500">
          Categories classify items everywhere — registration, filters, reports.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex items-end gap-3">
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
        {serverError && (
          <p role="alert" className="mt-3 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {serverError}
          </p>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Existing categories</h2>
        {categoriesQuery.isPending ? (
          <Card className="text-sm text-slate-500">Loading…</Card>
        ) : (categoriesQuery.data ?? []).length === 0 ? (
          <Card className="text-sm text-slate-500">No categories yet.</Card>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(categoriesQuery.data ?? []).map((category) => (
              <li
                key={category.id}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                {category.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
