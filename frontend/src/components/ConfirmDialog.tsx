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
  /** `destructive` for reject/dispose, `primary` for approve or a re-render. */
  tone?: "primary" | "destructive";
  loading?: boolean;
}

/**
 * §8's specialised Dialog for consequential actions — approve, reject, dispose,
 * completing an audit. The primary button styles with the tone; the dialog must
 * not be dismissible by the confirm handler failing silently (loading keeps it
 * open and visible).
 *
 * Tag re-rendering uses this too, but with the default `primary` tone: it
 * rewrites the cached PNG without changing the Tag ID or its link, so nothing is
 * destroyed and a destructive style would overstate it.
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
