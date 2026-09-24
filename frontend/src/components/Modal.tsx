import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { IconButton } from "./IconButton";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog — usually the same text as the title. */
  title: string;
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * §8 Dialog: focus-trapped, `Esc` closes, focus returns to the triggering
 * element on close (captured on open), and the first focusable element inside
 * receives focus. Click-outside closes — the ConfirmDialog copies that carry
 * the specific consequence sit inside forms where accidental dismissal is the
 * safer outcome, so the plan's "confirm discard if dirty" rule has no surface
 * here yet.
 */
export function Modal({ open, onClose, title, children, size = "sm", className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  /*
    `onClose` is almost always an inline arrow, so it is a new function on every
    render. Keeping it in a ref lets the effect below depend on `open` alone.

    That is not a micro-optimisation — it was a bug. With `onClose` in the dep
    array the effect re-ran on every render, and since its cleanup restores focus
    to the trigger, each keystroke inside a dialog moved focus out of the field:
    typing "Notebooks" into a rename dialog registered only the "N", because the
    rest of the characters were dispatched to the button focus had jumped to.
  */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && active === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    // The backdrop is pointer- and keyboard-closable: click-through dismissal
    // plus an explicit keydown for Space/Enter when the overlay itself holds
    // focus (jsx-a11y: a click handler needs a keyboard path).
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "w-full rounded-md bg-white p-5 shadow-lg",
          size === "sm" ? "max-w-sm" : "max-w-lg",
          className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <IconButton icon={<X className="h-4 w-4" />} label="Close dialog" size="sm" variant="ghost" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
