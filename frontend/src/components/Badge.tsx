import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * frontend-design-system.md §3.1's "50/600/700 rule": tinted background (`*-50`),
 * border on the tint (`*-200`), text at `*-700`. One tone per semantic colour —
 * never a bespoke hex value per badge.
 */
export type BadgeTone =
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "violet"
  | "orange";

const TONE_CLASSES: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  accent: "bg-accent-50 text-accent-700 border-accent-200",
  success: "bg-success-50 text-success-700 border-success-200",
  warning: "bg-warning-50 text-warning-700 border-warning-200",
  danger: "bg-danger-50 text-danger-700 border-danger-200",
  info: "bg-info-50 text-info-700 border-info-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
};

export interface BadgeProps {
  tone: BadgeTone;
  icon?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}

/** Colour + icon + text, always, in that order of redundancy (§3.4 — colour is never the only signal). */
export function Badge({ tone, icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
