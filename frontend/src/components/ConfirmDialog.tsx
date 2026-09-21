import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /**
   * The specific consequence, not "Are you sure?" (frontend-plan.md §8): e.g.
   * "This will mark CNCS-DEMO-0003 as disposed and can't be undone."
   */
  body: ReactNode;
  confirmLabel?: string;
  /** `destructive` for reject/dispose/regenerate, `primary` for approve. */
  tone?: "primary" | "destructive";
  loading?: boolean;
}

/**
 * §8's specialised Dialog for irreversible actions — approve, reject, tag
 * regeneration, completing an audit. The primary button styles with the tone;
 * the dialog must not be dismissible by the confirm handler failing silently
 * (loading keeps it open and visible).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "primary",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-slate-600">{body}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
