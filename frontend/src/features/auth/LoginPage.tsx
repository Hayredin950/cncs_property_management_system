import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
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
 *
 * Wrapped in the portal's page banner so the sign-in screen reads as part of the
 * same AAU application as the pages behind it, rather than as a bare form
 * floating under the marketing header. The heading and field labels are unchanged
 * from the pre-rebrand version on purpose: `"Staff sign in"`, `"Email"`,
 * `"Password"` and `"Sign in"` are the exact strings the auth flow tests and the
 * `authFlow.test.tsx` route guards assert on.
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
    return <Navigate to={user.mustChangePassword ? "/change-password" : next} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      const authed = await login(values.email, values.password);
      toast.success("Signed in.");
      // A temporary password (set by an administrator) must be replaced before
      // the account can go anywhere else.
      navigate(authed.mustChangePassword ? "/change-password" : next, { replace: true });
    } catch (err) {
      // The server's own string, shown verbatim (frontend-plan.md §4) — a 401
      // here is deliberately "Invalid credentials", not a hint about which
      // field was wrong.
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Couldn't reach the server. Check your connection and try again.",
      );
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <PortalPageHeader
        title="Staff sign in"
        description="Use your CNCS property office account to manage the campus register."
      />

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
          <Button type="submit" fullWidth loading={isSubmitting} className="rounded-sm">
            Sign in
          </Button>
        </form>
      </Card>

      {/* There is no sign-up route, so saying so beats leaving the question open. */}
      <p className="flex items-start gap-2 rounded-sm border border-aau-gray-200 bg-aau-gray-100 px-3 py-2 text-xs text-aau-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <span>
          Accounts are created by a system administrator — there is no self-service sign-up.
          Ask the property office if you need access.
        </span>
      </p>

      <p className="text-center text-xs text-aau-gray-500">
        <Link to="/" className="underline-offset-4 hover:underline">
          ← Back to item lookup
        </Link>
      </p>
    </div>
  );
}
