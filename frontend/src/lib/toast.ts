import { toast as sonnerToast } from "sonner";

/**
 * Every mutation toasts (frontend-plan.md §8). Thin wrapper so call sites use
 * one vocabulary (`success`/`error`/`info`) instead of reaching into `sonner`
 * directly, and so the duration rule (§8 of the design doc: errors stay up
 * longer) lives in one place.
 *
 * ### Why `id` exists
 *
 * Without one, every call is a *new* toast: sonner stacks them until the stack
 * runs off the screen. That is fine for a form that saves once and wrong for
 * anything a user triggers repeatedly in a second — the audit walkthrough is the
 * case that forced this. Passing the same `id` twice makes the second call
 * **replace** the first in place, so a stream of scan events reads as one line
 * that keeps current instead of a column of near-identical messages a novice has
 * to parse (`AuditScanPage`).
 */
export interface ToastOptions {
  /**
   * The stack slot to occupy. Same id twice = the newer message replaces the
   * older one, whether or not the variant changed.
   */
  id?: string | undefined;
}

/** Spreads `id` only when it is set — an explicit `id: undefined` is a type error under `exactOptionalPropertyTypes`. */
function withId(options?: ToastOptions): { id?: string } {
  return options?.id ? { id: options.id } : {};
}

export const toast = {
  success: (message: string, options?: ToastOptions) =>
    sonnerToast.success(message, { duration: 5000, ...withId(options) }),
  error: (message: string, options?: ToastOptions) =>
    sonnerToast.error(message, { duration: 8000, ...withId(options) }),
  info: (message: string, options?: ToastOptions) =>
    sonnerToast(message, { duration: 5000, ...withId(options) }),
};

/**
 * The one toast slot an audit walkthrough is allowed to occupy.
 *
 * Success, duplicate and failure all raise into this same slot, keyed by session
 * so two audits open in two tabs don't overwrite each other's message. A scan
 * that succeeds, an item already counted, and a tag that matches nothing are
 * three readings of one event — "what just happened at the camera?" — so they
 * belong in one place, not three.
 */
export function scanToastSlot(auditId: string): string {
  return `audit-scan:${auditId}`;
}
