import { useHealth } from "../hooks/useHealth";
import { cn } from "../lib/cn";

/**
 * "Is the backend up?" as a visible answer instead of a demo-day guess. Three
 * states, all stated in words as well as colour — a dot alone fails the design
 * doc's "never colour-only" rule (§12).
 */
export function HealthIndicator({ className }: { className?: string }) {
  const health = useHealth();

  const online = health.isSuccess && health.data.status === "ok";
  const label = health.isPending ? "Checking system…" : online ? "System online" : "System unreachable";

  return (
    <p className={cn("flex items-center justify-center gap-2 text-xs text-slate-500", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 rounded-full",
          health.isPending ? "bg-slate-300" : online ? "bg-success-600" : "bg-danger-600",
        )}
      />
      <span role="status" aria-live="polite">
        {label}
      </span>
    </p>
  );
}
