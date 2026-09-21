import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { useRegisterUser } from "../../hooks/useAuthMutations";
import { ApiError } from "../../types/api";

const formSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(["ADMIN", "STAFF"]),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * `/admin/users` (F1.3). The backend supports **create only** — no list,
 * update, role-change, or deactivate endpoint (gap G2, frontend-plan.md §12) —
 * so the page states that plainly instead of rendering an empty "manage" table
 * that would pretend otherwise. A duplicate email answers 409 with the
 * server's own message.
 */
export function AdminUsersPage() {
  const registerMutation = useRegisterUser();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { role: "STAFF" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await registerMutation.mutateAsync(values);
      reset({ fullName: "", email: "", password: "", role: "STAFF" });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.status === 409 ? err.message : `${err.message}`);
      } else {
        setServerError("Couldn't reach the server.");
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Staff and admin accounts are created here by an admin — there is no self sign-up.
        </p>
      </div>

      <div className="rounded-md border border-info-200 bg-info-50 px-4 py-3 text-sm text-info-700">
        Accounts can be <strong>created</strong> here, but not listed, edited, or deactivated — the backend has no
        user-management endpoints (recorded as gap G2). Share the credentials with the person directly.
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input label="Full name" error={errors.fullName?.message} {...register("fullName")} required />
          <Input label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register("email")} required />
          <Input
            label="Temporary password"
            type="password"
            autoComplete="new-password"
            hint="The person can't change it themselves yet (no update endpoint) — set a real one and share it securely."
            error={errors.password?.message}
            {...register("password")}
            required
          />
          <Select
            label="Role"
            options={[
              { value: "STAFF", label: "Staff" },
              { value: "ADMIN", label: "Admin" },
            ]}
            error={errors.role?.message}
            {...register("role")}
            required
          />

          {serverError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {serverError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" leftIcon={<UserPlus className="h-4 w-4" />} loading={isSubmitting}>
              Create account
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
