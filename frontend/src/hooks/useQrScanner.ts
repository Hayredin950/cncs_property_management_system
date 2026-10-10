import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

export type ScannerState = "starting" | "scanning" | "unavailable";

/** The running camera's own zoom range, as its video track reports it. */
export interface ScannerZoom {
  min: number;
  max: number;
  step: number;
  /** Where the camera is now, clamped into `[min, max]`. */
  value: number;
}

/**
 * Closes a scanner without ever throwing.
 *
 * `Html5Qrcode.prototype.stop()` **throws a string synchronously** — not a
 * rejected promise — when the state machine isn't already SCANNING/PAUSED:
 *
 * ```js
 * if (!this.stateManagerProxy.isScanning()) {
 *     throw "Cannot stop, scanner is not running or paused.";
 * }
 * ```
 *
 * That is the normal case far more often than it sounds. `start()` opens its
 * transition synchronously but only marks the scanner SCANNING once the camera
 * has actually rendered, so any stop attempted while `start()` is still in
 * flight lands on NOT_STARTED. React runs the cleanup of StrictMode's throwaway
 * first mount *immediately* after mount (dev only), and a user who leaves the
 * page before the permission prompt resolves hits the same window. Because this
 * runs inside an effect cleanup, the throw bypasses every `.catch()` we could
 * chain and surfaces as the full-page "Unexpected Application Error!" screen —
 * exactly what an error boundary looks like when a cleanup blows up.
 *
 * So: check the state first, and keep the try/catch as the belt to that
 * braces. A scanner that never left NOT_STARTED has no rendered camera to
 * close; if `start()` resolves *after* cancellation, the caller's own handler
 * closes it then.
 */
function closeScanner(scanner: Html5Qrcode) {
  if (scanner.getState() === Html5QrcodeScannerState.NOT_STARTED) return;

  try {
    scanner.stop().then(
      () => {
        try {
          scanner.clear();
        } catch {
          // Already cleared, or a scan raced back into progress — harmless.
        }
      },
      () => {
        // Camera close failed; the stream is released by the browser anyway.
      },
    );
  } catch {
    // Lost the race between the state check and stop() (another transition was
    // in flight). Nothing further to clean up.
  }
}

/**
 * The camera's zoom range, or `null` when it has none.
 *
 * Read only once the camera is actually running: `getCapabilities()` needs a live
 * video track, and `zoom` is simply absent from it on most iPhones, which expose no
 * zoom at all. `null` is therefore a normal answer rather than a failure — the
 * scanner then renders without a zoom control instead of a dead one.
 *
 * Every step can also throw: `html5-qrcode` reaches the rendered camera through a
 * private accessor that throws a **string** when the state has already moved on
 * (`getRenderedCameraOrFail`), the same hazard `closeScanner` documents. A scanner
 * that lost that race reports no zoom, which is true enough.
 */
function readZoomRange(scanner: Html5Qrcode): ScannerZoom | null {
  try {
    if (scanner.getState() !== Html5QrcodeScannerState.SCANNING) return null;

    const feature = scanner.getRunningTrackCameraCapabilities().zoomFeature();
    if (!feature.isSupported()) return null;

    const min = feature.min();
    const max = feature.max();
    // A range with nowhere to go is not a control — some Android drivers report a
    // fixed zoom of 1..1, and `step` of 0 would freeze the slider as well.
    if (!(max > min)) return null;

    const step = feature.step() || (max - min) / 10;
    const value = feature.value() ?? min;

    return { min, max, step, value: Math.min(Math.max(value, min), max) };
  } catch {
    return null;
  }
}

/**
 * Wraps `html5-qrcode`'s imperative lifecycle (frontend-plan.md §2 — the SDS
 * names this library specifically, do not substitute).
 *
 * Camera access requires a secure context: `localhost` counts, a LAN IP over
 * plain HTTP does not (§7 — a documented demo-day failure mode). Detected up
 * front so the unavailable state reads as a permission/environment problem,
 * never a broken app.
 *
 * `onDecode` is read through a ref rather than listed as an effect dependency,
 * so passing a fresh inline callback on every render does not tear down and
 * restart the camera.
 *
 * ### Zoom
 *
 * `zoom`/`setZoom` drive the *camera* — the video track is re-constrained in place
 * — never the page. Pinching over the viewfinder used to scale the whole document,
 * which moved the controls and the manual tag field along with the video, and zoom
 * is reported as `null` on devices that have no camera zoom to offer (see
 * `readZoomRange`).
 */
export function useQrScanner(elementId: string, onDecode: (text: string) => void) {
  const onDecodeRef = useRef(onDecode);
  /** The running scanner, so zoom can reach it without re-running the effect. */
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [zoom, setZoom] = useState<ScannerZoom | null>(null);

  // Assign in a passive effect, not during render — the same callback identity
  // is kept without writing a ref while React is rendering (react-hooks/refs).
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  // Knowable synchronously at first render: a plain-HTTP LAN demo or a device
  // with no camera API starts in the unavailable state with no effect at all.
  const secureAndCapable =
    typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
  const [state, setState] = useState<ScannerState>(() => (secureAndCapable ? "starting" : "unavailable"));
  const [message, setMessage] = useState<string | null>(() =>
    secureAndCapable ? null : "Camera access needs a secure connection (HTTPS or localhost).",
  );

  useEffect(() => {
    let cancelled = false;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          if (!cancelled) onDecodeRef.current(decodedText);
        },
        () => {
          // Per-frame "no QR code found" — expected on nearly every frame
          // while the camera is pointed at anything else, not an error.
        },
      )
      .then(() => {
        if (cancelled) {
          // Unmounted while the camera was still starting (StrictMode's
          // discarded mount, or a fast navigation). It is SCANNING now, so
          // this is the point where it genuinely can — and must — be closed.
          closeScanner(scanner);
          return;
        }
        setState("scanning");
        // The camera is live, so its zoom range is knowable now and only now.
        setZoom(readZoomRange(scanner));
      })
      .catch(() => {
        if (!cancelled) {
          setState("unavailable");
          setMessage(
            "Camera permission was denied, or no camera is available — you can still type the tag ID below.",
          );
        }
      });

    return () => {
      cancelled = true;
      if (scannerRef.current === scanner) scannerRef.current = null;
      setZoom(null);
      closeScanner(scanner);
    };
  }, [elementId]);

  /**
   * Moves the camera's own zoom while it is running.
   *
   * Guarded on the scanner still being in SCANNING state, because the library's
   * private accessor throws a string synchronously once it isn't — the same
   * failure mode `closeScanner` exists for. Every failure past that point is
   * cosmetic and swallowed deliberately: a driver is allowed to reject a value it
   * advertised a moment earlier, and a scanner that keeps scanning is the correct
   * outcome either way. The reported `value` moves only once the camera accepted
   * it, so the control never claims a zoom that did not happen.
   */
  const setZoomLevel = useCallback((value: number) => {
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      if (scanner.getState() !== Html5QrcodeScannerState.SCANNING) return;
      const feature = scanner.getRunningTrackCameraCapabilities().zoomFeature();
      void feature.apply(value).then(
        () => setZoom((previous) => (previous ? { ...previous, value } : previous)),
        () => undefined,
      );
    } catch {
      // No longer running, or the camera refused the change mid-flight.
    }
  }, []);

  return { state, message, zoom, setZoom: setZoomLevel };
}
