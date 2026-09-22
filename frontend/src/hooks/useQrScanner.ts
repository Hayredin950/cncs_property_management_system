import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";

export type ScannerState = "starting" | "scanning" | "unavailable";

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
 */
export function useQrScanner(elementId: string, onDecode: (text: string) => void) {
  const onDecodeRef = useRef(onDecode);

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
      closeScanner(scanner);
    };
  }, [elementId]);

  return { state, message };
}
