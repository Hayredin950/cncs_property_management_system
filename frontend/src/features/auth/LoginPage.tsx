import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { toast } from "../../lib/toast";
import { ApiError } from "../../types/api";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * `POST /auth/login` — public. There is no sign-up; account creation is
 * admin-only (`/admin/users`, Phase 2). A single "Email" field is enough for
 * every real account today, even though the backend also matches a custom `id`
 * (frontend-plan.md §4/§7).
 */
export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const next = searchParams.get("next") || "/dashboard";

  if (user) {
    return <Navigate to={next} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      await login(values.email, values.password);
      toast.success("Signed in.");
      navigate(next, { replace: true });
    } catch (err) {
      // The server's own string, shown verbatim (frontend-plan.md §4) — a 401
      // here is deliberately "Invalid credentials", not a hint about which
      // field was wrong.
      setFormError(err instanceof ApiError ? err.message : "Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center gap-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Staff sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Use your CNCS property office account.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            {...(errors.email?.message ? { error: errors.email.message } : {})}
            {...register("email")}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            {...(errors.password?.message ? { error: errors.password.message } : {})}
            {...register("password")}
          />
          {formError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {formError}
            </p>
          )}
          <Button type="submit" fullWidth loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </Card>

      <p className="text-center text-xs text-slate-400">
        <Link to="/" className="underline-offset-4 hover:underline">
          ← Back to item lookup
        </Link>
      </p>
    </div>
  );
}
