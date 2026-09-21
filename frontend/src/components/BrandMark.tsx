import { cn } from "../lib/cn";

/**
 * Placeholder wordmark + mark (frontend-design-system.md §2) — no logo asset
 * exists yet (open question 8, frontend-plan.md §14). Inline SVG, single lockup,
 * used at every size.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4" fill="#2563eb" />
        <rect x="12" y="12" width="16" height="16" rx="4" fill="#0d9488" />
      </svg>
      <span className="text-base font-bold tracking-wide text-brand-700">
        CNCS<span className="ml-1 font-normal text-slate-500">Property</span>
      </span>
    </span>
  );
}
