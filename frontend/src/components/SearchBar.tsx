import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { cn } from "../lib/cn";
import { IconButton } from "./IconButton";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

/**
 * Debounced (300ms), and syncs with an externally-changed `value` (e.g. the
 * browser's Back button restoring a URL-held filter) without re-triggering
 * `onChange` for that same restored value (frontend-design-system.md §8).
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search name or tag ID",
  className,
  debounceMs = 300,
}: SearchBarProps) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebounce(draft, debounceMs);
  const onChangeRef = useRef(onChange);

  // Assign in a passive effect, not during render (react-hooks/refs) — the
  // debounce effect below always runs after this one on a re-render, so it
  // never fires a stale callback.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onChangeRef.current(debounced);
  }, [debounced]);

  // Externally-changed `value` (e.g. the browser's Back button restoring a
  // URL-held filter) replaces the draft — derived during render via the
  // prev-state pattern rather than a setState-in-effect (react-hooks rule).
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft((current) => (current === value ? current : value));
  }

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-12 w-full rounded-md border border-slate-300 bg-white pl-10 text-base text-slate-900",
          "placeholder:text-slate-400",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-600",
          draft ? "pr-10" : "pr-3",
        )}
      />
      {draft && (
        <IconButton
          icon={<X className="h-4 w-4" />}
          label="Clear search"
          size="sm"
          variant="ghost"
          className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2"
          onClick={() => setDraft("")}
        />
      )}
    </div>
  );
}
