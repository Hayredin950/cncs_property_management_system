import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";

export type ScannerState = "starting" | "scanning" | "unavailable";

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
        if (!cancelled) setState("scanning");
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
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {
          // Never started, or already stopped — nothing to clean up.
        });
    };
  }, [elementId]);

  return { state, message };
}
