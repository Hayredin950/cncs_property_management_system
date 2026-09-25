import { CameraOff, Loader2 } from "lucide-react";
import { useId } from "react";
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
 *
 * ### Zoom belongs to the camera, not the page
 *
 * Pinching over the viewfinder used to scale the whole document: the video grew,
 * but so did every control around it, and the manual tag field slid off the screen
 * mid-scan. So the viewport opts out of page-level pinch (`touch-action`) and the
 * zoom control below it re-constrains the *video track* instead — the viewfinder
 * rescales in place and nothing else moves. The control appears only when the
 * running camera reports a real zoom range (`ScannerZoom`), which on iPhones it
 * generally does not: a missing control is honest, a dead one is not.
 */
export function QrScanner({ elementId, onDecode, className }: QrScannerProps) {
  const { state, message, zoom, setZoom } = useQrScanner(elementId, onDecode);
  const zoomId = useId();

  return (
    <div className={className}>
      <div
        id={elementId}
        /*
          `pan-x pan-y` rather than `none`: the page still scrolls normally under a
          finger that lands on the video, but the browser no longer treats a pinch
          here as a page zoom. Written as an arbitrary property because the two
          Tailwind `touch-pan-*` utilities each set the same declaration outright,
          and the winner would depend on stylesheet order.
        */
        className="overflow-hidden rounded-md bg-slate-900 [touch-action:pan-x_pan-y]"
        style={{ minHeight: state === "unavailable" ? 0 : 280 }}
      />
      {state === "scanning" && zoom && (
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor={zoomId} className="text-sm font-medium text-slate-700">
            Camera zoom
          </label>
          <input
            id={zoomId}
            type="range"
            min={zoom.min}
            max={zoom.max}
            step={zoom.step}
            value={zoom.value}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-2 flex-1 cursor-pointer accent-accent-600"
            aria-describedby={`${zoomId}-hint`}
          />
          {/* Read back without a unit: `zoom` is a multiplier on most Android
              cameras and a raw step value on others, so a "×" here would be a
              claim about the device that the device never made. */}
          <span className="w-8 text-right text-sm tabular-nums text-slate-500" aria-hidden="true">
            {zoom.value}
          </span>
          <p id={`${zoomId}-hint`} className="sr-only">
            Zooms the camera view only. The page itself does not zoom.
          </p>
        </div>
      )}
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
