import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * §11's copy bank: "no items yet" and "no items match these filters" are two
 * different `EmptyState`s with two different messages — never the same generic
 * one (§8 of frontend-plan.md).
 */
export function EmptyState({ icon, heading, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border border-dashed border-slate-300 bg-white px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-slate-400" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{heading}</h3>
      {body && <p className="max-w-sm text-sm text-slate-500">{body}</p>}
      {action}
    </div>
  );
}
