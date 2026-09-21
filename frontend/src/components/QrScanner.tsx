import { CameraOff, Loader2 } from "lucide-react";
import { useQrScanner } from "../hooks/useQrScanner";

export interface QrScannerProps {
  /** Must be unique on the page — `html5-qrcode` mounts into this element's id. */
  elementId: string;
  onDecode: (text: string) => void;
  className?: string;
}

/**
 * The camera viewport (frontend-design-system.md §10.3). Manual tag entry is a
 * sibling in the page that uses this, always visible alongside it — never
 * behind a "having trouble?" toggle (F4.1 requires both to resolve to the same
 * destination).
 */
export function QrScanner({ elementId, onDecode, className }: QrScannerProps) {
  const { state, message } = useQrScanner(elementId, onDecode);

  return (
    <div className={className}>
      <div
        id={elementId}
        className="overflow-hidden rounded-md bg-slate-900"
        style={{ minHeight: state === "unavailable" ? 0 : 280 }}
      />
      {state === "starting" && (
        <div className="flex items-center justify-center gap-2 rounded-md bg-slate-100 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Starting camera…
        </div>
      )}
      {state === "unavailable" && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <CameraOff className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="max-w-xs text-sm text-slate-600">{message}</p>
        </div>
      )}
    </div>
  );
}
