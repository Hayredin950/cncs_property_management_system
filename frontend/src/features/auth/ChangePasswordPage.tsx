import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { changePassword } from "../../api/auth";
import { useAuth } from "../../app/AuthContext";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { toast } from "../../lib/toast";
import { ApiError } from "../../types/api";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "The two passwords don't match",
    path: ["confirmPassword"],
  })
  /*
    Mirrors the server's own refusal, so the answer arrives while the user is still
    looking at the field. On the forced screen especially: reusing the temporary
    password looked like a successful change, cleared the flag and left the account
    on the password an administrator chose.
  */
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: "Choose a password that differs from your current one",
    path: ["newPassword"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * `/change-password` — where a temporary password is replaced.
 *
 * One page, two entry points, because the work is identical:
 *
 *   - **forced**: an administrator reset the password and flagged the account
 *     `mustChangePassword`, so `RequireAuth` routes here and refuses to let the
 *     session reach any other screen until it is done;
 *   - **voluntary**: a signed-in user chose to change it.
 *
 * Submitting returns a fresh token (the server bumps `tokenVersion`, which logs
 * out every *other* session) — `setSession` installs it so this device stays
 * signed in, then the user continues to `next` or the dashboard.
 */
export function ChangePasswordPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const forced = Boolean(user?.mustChangePassword);
  const next = searchParams.get("next") || "/dashboard";

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const result = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setSession(result.token, result.user);
      toast.success("Password changed.");
      // `/login?next=…` is not preserved for the forced case, so `next` also
      // defaults sensibly here.
      navigate(next, { replace: true });
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
        title={forced ? "Choose a new password" : "Change your password"}
        description={
          forced
            ? "Your password was reset by an administrator. Set your own before continuing."
            : "Enter your current password, then choose a new one."
        }
      />

      {forced && (
        <p className="flex items-start gap-2 rounded-sm border border-aau-gray-200 bg-aau-gray-100 px-3 py-2 text-xs text-aau-gray-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          <span>Changing your password signs you out of every other device.</span>
        </p>
      )}

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            {...(errors.currentPassword?.message ? { error: errors.currentPassword.message } : {})}
            {...register("currentPassword")}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            {...(errors.newPassword?.message ? { error: errors.newPassword.message } : {})}
            {...register("newPassword")}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            {...(errors.confirmPassword?.message ? { error: errors.confirmPassword.message } : {})}
            {...register("confirmPassword")}
          />

          {formError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            fullWidth
            loading={isSubmitting}
            className="rounded-sm"
            leftIcon={<KeyRound className="h-4 w-4" />}
          >
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
