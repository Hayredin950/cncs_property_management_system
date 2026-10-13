import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { requestAccount } from "../../api/auth";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { ApiError } from "../../types/api";
import type { AccountRequestResponse } from "../../types/user";
import type { DepartmentOption } from "../../api/departments";

const requestSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  department: z.string().trim().min(1, "Department is required"),
});

type RequestFormValues = z.infer<typeof requestSchema>;

/**
 * `POST /auth/account-requests` — public. Anyone may ask; nobody gets in by asking.
 * On success there is no token and no sign-in — only a confirmation that the request
 * is waiting for a system administrator.
 */
export function RequestAccountPage() {
  const { user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<AccountRequestResponse | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormValues>({ resolver: zodResolver(requestSchema) });

  if (user) {
    return <Navigate to={user.mustChangePassword ? "/change-password" : "/dashboard"} replace />;
  }

  useEffect(() => {
    async function loadDepartments() {
      try {
        const res = await fetch("/api/v1/departments");
        if (res.ok) {
          const data = await res.json();
          setDepartments(data);
        }
      } catch {
        // Silently fail - form will show empty select
      } finally {
        setDepartmentsLoading(false);
      }
    }
    loadDepartments();
  }, []);

  async function onSubmit(values: RequestFormValues) {
    setFormError(null);
    try {
      const result = await requestAccount(values);
      setSubmitted(result);
    } catch (err) {
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
        title="Request an account"
        description="Ask for access to the CNCS property register. A system administrator must approve before you can sign in."
      />

      {submitted ? (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <CheckCircle2 className="h-8 w-8 text-brand-600" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Request submitted</h2>
              <p className="mt-1 text-sm text-slate-600">
                {submitted.message}. You will be able to sign in once a system administrator
                approves the request for <strong>{submitted.request.email}</strong>.
              </p>
            </div>
            <Link
              to="/login"
              className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="Full name"
              autoComplete="name"
              error={errors.fullName?.message}
              {...register("fullName")}
              required
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
              required
            />
            {departmentsLoading ? (
              <Input
                label="Department"
                placeholder="Loading departments..."
                disabled
                required
              />
            ) : (
              <Select
                label="Department"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder="Select your department"
                error={errors.department?.message}
                {...register("department")}
                required
              />
            )}
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters. This is the password you will use after approval."
              error={errors.password?.message}
              {...register("password")}
              required
            />
            {formError && (
              <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {formError}
              </p>
            )}
            <Button type="submit" fullWidth loading={isSubmitting} className="rounded-sm">
              Submit request
            </Button>
          </form>
        </Card>
      )}

      <p className="flex items-start gap-2 rounded-sm border border-aau-gray-200 bg-aau-gray-100 px-3 py-2 text-xs text-aau-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <span>
          Submitting a request does not create a signed-in session. Access starts only after a
          system administrator approves it.
        </span>
      </p>

      <p className="text-center text-xs text-aau-gray-500">
        <Link to="/login" className="underline-offset-4 hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
