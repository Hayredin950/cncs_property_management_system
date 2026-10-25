import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { resetPassword } from "../../api/auth";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { toast } from "../../lib/toast";
import { ApiError } from "../../types/api";

const schema = z
  .object({
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "The two passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * `/reset-password?token=…` — where the account holder chooses a new password.
 *
 * The other half of F15 and of C10: an administrator can *trigger* a reset, but
 * this page is the only place a password is ever set, and only the person
 * holding the emailed link can open it. No token, an expired token and a used
 * token are three different sentences because the next step differs.
 *
 * Success signs every other session out (`tokenVersion` is bumped server-side),
 * so the person is sent to sign in again with the password they just chose.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const token = searchParams.get("token") ?? "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await resetPassword({ token, newPassword: values.newPassword });
      setDone(true);
      toast.success("Your password has been changed.");
      navigate("/login", { replace: true });
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
        title="Choose a new password"
        description="This link works once. Setting a new password signs out every other device on the account."
      />

      {!token ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-900">This link is incomplete</h2>
          <p className="text-sm text-slate-600">
            The reset link is missing its token, which usually means it was cut short when it was
            copied. Open the link exactly as it arrived, or{" "}
            <Link to="/forgot-password" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              ask for a new one
            </Link>
            .
          </p>
          <Link to="/login" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </Card>
      ) : done ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            Your password has been changed. Sign in with the new one.
          </p>
          <Link to="/login" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            Go to sign in
          </Link>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters."
              {...(errors.newPassword?.message ? { error: errors.newPassword.message } : {})}
              {...register("newPassword")}
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              {...(errors.confirmPassword?.message
                ? { error: errors.confirmPassword.message }
                : {})}
              {...register("confirmPassword")}
            />

            {formError && (
              <div role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
                <p>{formError}</p>
                <p className="mt-1 text-xs">
                  A link that has expired or already been used cannot be retried —{" "}
                  <Link
                    to="/forgot-password"
                    className="font-medium underline underline-offset-2"
                  >
                    ask for a new one
                  </Link>
                  .
                </p>
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              loading={isSubmitting}
              className="rounded-sm"
              leftIcon={<KeyRound className="h-4 w-4" />}
            >
              Set my new password
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
