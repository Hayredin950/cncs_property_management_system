import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes, useId } from "react";
import { cn } from "../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  /** Rendered as a disabled first option — e.g. "All categories". */
  placeholder?: string;
  hint?: string;
  error?: string;
}

/**
 * Native `<select>` (frontend-design-system.md §8): the OS picker on mobile, a
 * styled shell on desktop. Used for closed, small enumerations — Condition,
 * Request type, Category. Free-text/open-ended pickers (Department) get their
 * own component, not this one.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, hint, error, id, className, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const showHint = Boolean(hint) && !error;
  const hintId = showHint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hintId, errorId) || undefined}
          className={cn(
            "h-11 w-full appearance-none rounded-md border bg-white px-3 pr-9 text-base text-slate-900",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-600",
            "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
            error ? "border-danger-600" : "border-slate-300",
            className,
          )}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled={rest.required}>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>
      {showHint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
});
