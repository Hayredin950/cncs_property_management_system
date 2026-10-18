import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../../api/auth";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ApiError } from "../../types/api";

type VerificationState = "loading" | "success" | "error" | "missing_token";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerificationState>(token ? "loading" : "missing_token");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("missing_token");
      return;
    }

    let cancelled = false;

    async function runVerification() {
      try {
        const res = await verifyEmail(token!);
        if (!cancelled) {
          setUserEmail(res.email);
          setState("success");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof ApiError ? err.message : "Verification link is invalid or has expired.",
          );
          setState("error");
        }
      }
    }

    runVerification();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <PortalPageHeader
        title="Email Verification"
        description="Verify your institutional Addis Ababa University email address."
      />

      <Card>
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">Verifying your email...</h2>
            <p className="text-sm text-slate-600">Please wait while we validate your security token.</p>
          </div>
        )}

        {state === "missing_token" && (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-2 text-warning-700">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">Missing verification token</h2>
            </div>
            <p className="text-sm text-slate-600">
              The verification link appears to be incomplete. Please make sure you clicked the full URL
              from your institutional email notification.
            </p>
            <div className="mt-2 flex w-full flex-col gap-2">
              <Link to="/request-account" className="w-full">
                <Button fullWidth variant="outline">
                  Request an account
                </Button>
              </Link>
              <Link to="/login" className="w-full">
                <Button fullWidth variant="ghost">
                  Back to sign in
                </Button>
              </Link>
            </div>
          </div>
        )}

        {state === "success" && (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-900">Email Verified</h2>
            </div>
            <p className="text-sm text-slate-600">
              Your institutional email {userEmail ? <strong>({userEmail})</strong> : ""} has been successfully verified.
            </p>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              Your registration request has been forwarded to your <strong>Department Head</strong> for formal approval.
              You will receive an email notification once your access is approved.
            </div>
            <div className="mt-2 w-full">
              <Link to="/login" className="w-full">
                <Button fullWidth>Return to Sign In</Button>
              </Link>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-7 w-7 text-rose-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-900">Verification Failed</h2>
            </div>
            <p className="text-sm text-slate-600">
              {errorMessage || "The verification link is invalid, expired, or has already been used."}
            </p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Tip:</strong> If you did not receive your verification email, check your spam or junk folder.
              Verification tokens expire after 24 hours.
            </div>
            <div className="mt-2 flex w-full flex-col gap-2">
              <Link to="/request-account" className="w-full">
                <Button fullWidth variant="outline">
                  Submit a new request
                </Button>
              </Link>
              <Link to="/login" className="w-full">
                <Button fullWidth variant="ghost">
                  Back to sign in
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-sm border border-aau-gray-200 bg-aau-gray-100 px-3 py-2 text-xs text-aau-gray-600">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <span>
          Institutional emails from CNCS PMS may occasionally arrive in your spam folder. Add the sender to your safe list.
        </span>
      </div>
    </div>
  );
}
