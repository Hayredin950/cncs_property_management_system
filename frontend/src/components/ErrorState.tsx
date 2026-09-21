import { AlertTriangle, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type ErrorStateTone = "danger" | "neutral";

const TONE_CLASSES: Record<ErrorStateTone, string> = {
  danger: "border-danger-200 bg-danger-50",
  neutral: "border-slate-300 bg-slate-50",
};

const ICON_TONE_CLASSES: Record<ErrorStateTone, string> = {
  danger: "text-danger-600",
  neutral: "text-slate-500",
};

export interface ErrorStateProps {
  icon?: ReactNode | undefined;
  heading: string;
  body?: string | undefined;
  action?: ReactNode | undefined;
  tone?: ErrorStateTone | undefined;
  className?: string | undefined;
}

/**
 * §8/§11 sub-variants (401/403/404/409/410/500/offline) are all this component
 * with different icon/heading/body/tone — never a bare browser-default error.
 */
export function ErrorState({ icon, heading, body, action, tone = "danger", className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border px-6 py-12 text-center",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <div className={ICON_TONE_CLASSES[tone]} aria-hidden="true">
        {icon ?? <AlertTriangle className="h-8 w-8" />}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{heading}</h3>
      {body && <p className="max-w-sm text-sm text-slate-600">{body}</p>}
      {action}
    </div>
  );
}

/** §11's exact offline copy — network failure is not the same UI as a 4xx/5xx. */
export function OfflineState({ className }: { className?: string }) {
  return (
    <ErrorState
      tone="neutral"
      icon={<WifiOff className="h-8 w-8" />}
      heading="You're offline"
      body="Showing the last data we loaded. Reconnect to refresh."
      className={className}
    />
  );
}
