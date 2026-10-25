import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { requestPasswordReset } from "../../api/auth";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { ApiError } from "../../types/api";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email address").email("That is not an email address"),
});

type FormValues = z.infer<typeof schema>;

/**
 * `/forgot-password` — ask for a reset link.
 *
 * The server answers the same way whether or not the address has an account
 * (anti-enumeration), and this page repeats that answer unchanged rather than
 * inventing "we sent it" for an address it cannot know exists. The link goes to
 * the address itself; nobody at the college sees the token.
 */
export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await requestPasswordReset(values.email.trim());
      setSentTo(values.email.trim());
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
        title="Reset your password"
        description="Enter the email address on your account and we will send a link to choose a new password."
      />

      {sentTo ? (
        <Card className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              If <span className="font-medium">{sentTo}</span> has an account, a reset link is on its
              way. It works once and expires in an hour.
            </span>
          </p>
          <p className="text-xs text-slate-500">
            Nothing arrived? Check the address, then ask the Property Office for a new link. Account
            holders can only be sent a link — nobody at the college can see or set your password.
          </p>
          <Link
            to="/login"
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              {...(errors.email?.message ? { error: errors.email.message } : {})}
              {...register("email")}
            />

            {formError && (
              <div role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {formError}
              </div>
            )}

            <Button type="submit" fullWidth loading={isSubmitting} className="rounded-sm">
              Send the reset link
            </Button>

            <Link
              to="/login"
              className="text-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </form>
        </Card>
      )}
    </div>
  );
}
