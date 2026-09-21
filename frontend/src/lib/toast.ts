import { toast as sonnerToast } from "sonner";

/**
 * Every mutation toasts (frontend-plan.md §8). Thin wrapper so call sites use
 * one vocabulary (`success`/`error`/`info`) instead of reaching into `sonner`
 * directly, and so the duration rule (§8 of the design doc: errors stay up
 * longer) lives in one place.
 */
export const toast = {
  success: (message: string) => sonnerToast.success(message, { duration: 5000 }),
  error: (message: string) => sonnerToast.error(message, { duration: 8000 }),
  info: (message: string) => sonnerToast(message, { duration: 5000 }),
};
