import { cn } from "../lib/cn";

/**
 * §7: a skeleton matches the known shape of content about to arrive. Purely
 * decorative — `aria-hidden` so screen readers aren't spammed with empty divs;
 * the container using these should carry `role="status"` + a visually-hidden
 * "Loading…" label instead.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-slate-200", className)} />;
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn("h-4", index === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <Skeleton className="mb-3 aspect-[4/3] w-full" />
      <SkeletonText lines={2} />
    </div>
  );
}
