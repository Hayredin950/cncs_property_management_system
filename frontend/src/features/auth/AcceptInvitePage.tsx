import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { acceptInvite } from "../../api/auth";
import { useAuth } from "../../app/AuthContext";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { toast } from "../../lib/toast";
import { ApiError } from "../../types/api";

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "The two passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * `/accept-invite?token=…` — where an invited head, officer, auditor or system
 * admin chooses their own password (T6).
 *
 * Public, and deliberately so. The account an administrator invited exists, but
 * it is `PENDING_EMAIL_VERIFICATION` with a password nobody holds — not the
 * administrator, not this app, not the mail server that carried the link. This
 * page is the only place it is ever replaced, which is what makes "an
 * administrator never sets a password" a property of the system rather than a
 * promise about how administrators behave.
 *
 * Three states, and the copy for each is the point of the page:
 *
 *   - **no token** — the link was truncated, or someone typed the address. Says
 *     so and points at the person who can reissue it, rather than showing a form
 *     that will fail on submit.
 *   - **a rejected token** — the server's own message (expired, already used, not
 *     valid) is shown verbatim and the form is replaced, because retyping a
 *     password cannot fix any of the three. The next step is always "ask for a
 *     new link".
 *   - **a token that works** — the password fields, and no session until it
 *     succeeds. On success the account is `ACTIVE` and the response is a session,
 *     so the person lands signed in rather than being asked to type the password
 *     they just chose.
 */
export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  /** The link's own token. Absent means the address was reached without one. */
  const token = searchParams.get("token") ?? "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const result = await acceptInvite({
        token,
        password: values.password,
        // Asked here because nothing else knows it: the invitation names an email
        // and a post, so without this the account's name is its email address
        // until an administrator edits it.
        fullName: values.fullName,
      });
      // The server returns a session for the account it just activated, so this
      // device is signed in as the new account — no second sign-in.
      setSession(result.token, result.user);
      toast.success("Your password is set and you are signed in.");
      navigate("/dashboard", { replace: true });
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
        title="Set your password"
        description="You were invited to the CNCS Property Management System. Choose your own password to activate the account — nobody else has seen or set one."
      />

      {!token ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-900">This link is incomplete</h2>
          <p className="text-sm text-slate-600">
            The invitation link is missing its token, which usually means it was cut short when it
            was copied. Open the link exactly as it was sent, or ask the administrator who invited
            you to send a new one.
          </p>
          <Link to="/login" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <p className="flex items-start gap-2 rounded-sm border border-aau-gray-200 bg-aau-gray-100 px-3 py-2 text-xs text-aau-gray-600">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                Use the same link only once, and set a password you do not use anywhere else.
              </span>
            </p>

            <Input
              label="Your full name"
              autoComplete="name"
              hint="This is the name the college's records will show."
              {...(errors.fullName?.message ? { error: errors.fullName.message } : {})}
              {...register("fullName")}
            />
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters."
              {...(errors.password?.message ? { error: errors.password.message } : {})}
              {...register("password")}
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
                {/**
                  Every rejection here is a link problem, and the fix is always the
                  same one: a new link. Saying so next to the error is what stops the
                  person retrying the same dead link.
                */}
                <p className="mt-1 text-xs">
                  Ask the administrator who invited you to send a new invitation.
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
              Set my password and sign in
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
