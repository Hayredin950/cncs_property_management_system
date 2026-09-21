import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

/**
 * frontend-design-system.md §8 — "Big number + label + optional trend icon.
 * Dashboard only." Tones reuse the Badge palette's semantic colours but at the
 * `-600` step (icon) rather than a tinted chip, since a StatCard is a large
 * surface, not a label.
 */
export type StatTone = "brand" | "accent" | "success" | "warning" | "danger" | "neutral";

const TONE_ICON: Record<StatTone, string> = {
  brand: "text-brand-600",
  accent: "text-accent-600",
  success: "text-success-600",
  warning: "text-warning-600",
  danger: "text-danger-600",
  neutral: "text-slate-500",
};

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: StatTone;
  /** When present the whole card becomes a link — e.g. the pending count → `/requests`. */
  to?: string;
  className?: string;
}

export function StatCard({ label, value, icon, tone = "neutral", to, className }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        {icon && (
          <span className={TONE_ICON[tone]} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <span className="tabular-nums text-3xl font-bold text-slate-900">{value}</span>
    </>
  );

  const base = cn(
    "flex flex-col gap-1 rounded-md border border-slate-200 bg-white p-4 shadow-sm",
    to && "transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
    className,
  );

  if (to) {
    return (
      <Link to={to} className={base}>
        {content}
      </Link>
    );
  }

  return <div className={base}>{content}</div>;
}
