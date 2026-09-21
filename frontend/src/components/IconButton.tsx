import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import type { ButtonSize, ButtonVariant } from "./Button";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-600",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400",
  outline: "border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:ring-brand-600",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400",
  destructive: "bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-600",
  link: "text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-600",
};

/** Square, always ≥44px below `lg` (§8/§12) — the icon alone is never the accessible name. */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-14 w-14",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Required, not optional — an icon-only control has no other accessible name. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  loading = false,
  disabled,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
    </button>
  );
}
