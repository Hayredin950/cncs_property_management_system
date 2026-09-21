import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "../lib/cn";

/**
 * frontend-design-system.md §8/§12: every input has a visible, associated label
 * (never a placeholder used as the only label — hence `label` is required, not
 * optional), and text stays ≥16px (`text-base`) below `md` to avoid iOS auto-zoom.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leadingIcon, id, className, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const showHint = Boolean(hint) && !error;
  const hintId = showHint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hintId, errorId) || undefined}
          className={cn(
            "h-11 w-full rounded-md border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-600",
            "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
            leadingIcon ? "pl-10" : undefined,
            error ? "border-danger-600" : "border-slate-300",
            className,
          )}
          {...rest}
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
