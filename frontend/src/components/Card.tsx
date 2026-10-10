import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** `radius-md`, `e1` elevation (frontend-design-system.md §5.2). */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-6", className)} {...rest} />
  );
}
