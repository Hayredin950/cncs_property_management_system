import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQrScanner } from "../hooks/useQrScanner";

/**
 * Regression tests for the crash this hook used to cause on `/scan` and
 * `/audit/:id/scan`: React Router's bare "Unexpected Application Error!
 * Cannot stop, scanner is not running or paused." screen.
 *
 * The library's `stop()` throws a **string synchronously** when its state
 * machine isn't already SCANNING/PAUSED, and that is the normal state while
 * `start()` is still in flight — which is exactly when StrictMode's throwaway
 * first mount unmounts, and when a user navigates away before the permission
 * prompt resolves. A synchronous throw from an effect cleanup bypasses every
 * promise `.catch()` in the chain, so the mock reproduces the library's
 * behaviour rather than a tidier version of it.
 */
const h5 = vi.hoisted(() => {
  const NOT_STARTED = 1;
  const SCANNING = 2;

  interface StartHandle {
    resolve(): void;
    reject(error: unknown): void;
  }

  const instances: FakeScanner[] = [];
  const pendingStarts: StartHandle[] = [];

  interface ZoomRange {
    min: number;
    max: number;
    step: number;
  }

  class FakeScanner {
    state = NOT_STARTED;
    stopCalls = 0;
    /** `null` models the devices that expose no `zoom` capability — most iPhones. */
    zoomRange: ZoomRange | null = { min: 1, max: 8, step: 0.5 };
    /** Every value handed to the track, in order. */
    appliedZoom: number[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_elementId: string) {}

    /**
     * `html5-qrcode`'s own feature API, including the part that matters here:
     * `zoomFeature()` reaches the rendered camera through an accessor that throws
     * a string when the scanner is not running.
     */
    getRunningTrackCameraCapabilities() {
      if (this.state !== SCANNING) {
        throw "Scanning is not in running state, call this API only when QR code scanning using camera is in running state.";
      }
      const range = this.zoomRange;
      return {
        zoomFeature: () => ({
          isSupported: () => range !== null,
          min: () => (range as ZoomRange).min,
          max: () => (range as ZoomRange).max,
          step: () => (range as ZoomRange).step,
          value: () => this.appliedZoom.at(-1) ?? (range as ZoomRange).min,
          apply: (value: number) => {
            this.appliedZoom.push(value);
            return Promise.resolve();
          },
        }),
      };
    }

    /** Mirrors `Html5Qrcode.prototype.stop` — synchronous throw, not a rejection. */
    stop(): Promise<void> {
      this.stopCalls += 1;
      if (this.state === NOT_STARTED) {
        throw "Cannot stop, scanner is not running or paused.";
      }
      this.state = NOT_STARTED;
      return Promise.resolve();
    }

    clear() {
      // The real `clearElement` throws if a scan is somehow ongoing; nothing to
      // emulate here beyond not throwing on the happy path.
    }

    getState() {
      return this.state;
    }

    start(): Promise<void> {
      instances.push(this);
      return new Promise<void>((resolve, reject) => {
        pendingStarts.push({
          resolve: () => {
            // Matches the library: the transition to SCANNING executes only
            // once the camera has rendered, i.e. as this promise settles.
            this.state = SCANNING;
            resolve();
          },
          reject,
        });
      });
    }
  }

  return { FakeScanner, instances, pendingStarts, NOT_STARTED, SCANNING };
});

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: h5.FakeScanner,
  Html5QrcodeScannerState: { UNKNOWN: 0, NOT_STARTED: 1, SCANNING: 2, PAUSED: 3 },
}));

function Harness() {
  const { state, message, zoom, setZoom } = useQrScanner("qr-reader", () => {});
  return (
    <div>
      <span data-testid="scanner-state">{state}</span>
      <span data-testid="scanner-zoom">{zoom ? `${zoom.min}-${zoom.max}:${zoom.value}` : "none"}</span>
      <button type="button" onClick={() => setZoom(3)}>
        zoom
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}

beforeEach(() => {
  h5.instances.length = 0;
  h5.pendingStarts.length = 0;
  // The public-path guard reads these synchronously at first render, so they
  // must be in place before the first `render()`.
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
});

afterEach(() => {
  // `delete` rather than reassign: jsdom's originals are getters on the
  // prototypes, and leaving a plain `undefined` would break other suites.
  Reflect.deleteProperty(window, "isSecureContext");
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("useQrScanner lifecycle", () => {
  it("does not stop a scanner that never reached SCANNING when the page unmounts", () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByTestId("scanner-state")).toHaveTextContent("starting");

    // The crash itself: before the fix this called `stop()`, which threw out of
    // the effect cleanup and replaced the whole app with React Router's default
    // error screen. Asserting on the call count is deterministic; asserting
    // "did not throw" would rely on how React reports cleanup errors.
    expect(() => unmount()).not.toThrow();
    expect(h5.instances[0]!.stopCalls).toBe(0);
  });

  it("closes the camera that finished starting after the page had already left", async () => {
    const { unmount } = render(<Harness />);
    unmount();

    // The camera promise from `getUserMedia` outlives the component.
    await act(async () => {
      h5.pendingStarts[0]!.resolve();
    });

    expect(h5.instances[0]!.stopCalls).toBe(1);
    expect(h5.instances[0]!.getState()).toBe(h5.NOT_STARTED);
  });

  it("survives StrictMode's mount → cleanup → mount without stopping mid-start", async () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    // Both mounts ran; the throwaway first mount's cleanup must not have
    // attempted a stop while its own start was pending.
    expect(h5.instances).toHaveLength(2);
    expect(h5.instances[0]!.stopCalls).toBe(0);

    await act(async () => {
      for (const start of h5.pendingStarts) start.resolve();
    });

    // The kept mount is scanning; the discarded one released its camera.
    expect(screen.getByTestId("scanner-state")).toHaveTextContent("scanning");
    expect(h5.instances[0]!.stopCalls).toBe(1);
  });

  it("falls back to manual entry on a denied camera, and still cleans up", async () => {
    render(<Harness />);

    await act(async () => {
      h5.pendingStarts[0]!.reject("NotAllowedError");
    });

    expect(screen.getByTestId("scanner-state")).toHaveTextContent("unavailable");
    expect(screen.getByText(/permission was denied/i)).toBeInTheDocument();

    // A rejected start leaves the state machine NOT_STARTED, so cleanup must
    // still not call stop().
    expect(() => screen.getByTestId("scanner-state")).not.toThrow();
  });
});

/**
 * Zoom re-constrains the video track in place, so the page around the viewfinder
 * stays put. Pinching over it used to scale the whole document instead, which
 * moved the scan controls and the manual tag field along with the video.
 */
describe("useQrScanner camera zoom", () => {
  it("reports the running camera's range and applies a change to the track", async () => {
    render(<Harness />);
    await act(async () => {
      h5.pendingStarts[0]!.resolve();
    });

    expect(screen.getByTestId("scanner-state")).toHaveTextContent("scanning");
    // Known only once the camera is live: the range comes off the video track.
    expect(screen.getByTestId("scanner-zoom")).toHaveTextContent("1-8:1");

    await act(async () => {
      screen.getByRole("button", { name: "zoom" }).click();
    });

    expect(h5.instances[0]!.appliedZoom).toEqual([3]);
    // The readout follows what the camera accepted, not what was asked for.
    expect(screen.getByTestId("scanner-zoom")).toHaveTextContent("1-8:3");
  });

  it("offers no zoom at all on a camera that has none", async () => {
    render(<Harness />);
    // Set before the camera finishes starting, which is when the range is read.
    h5.instances[0]!.zoomRange = null;

    await act(async () => {
      h5.pendingStarts[0]!.resolve();
    });

    expect(screen.getByTestId("scanner-state")).toHaveTextContent("scanning");
    // A missing control, not a dead one: iPhones expose no zoom to constrain.
    expect(screen.getByTestId("scanner-zoom")).toHaveTextContent("none");
  });

  it("ignores a zoom request while the scanner is not running", () => {
    render(<Harness />);

    // The library throws a *string* synchronously from its accessor here, and that
    // throw would land in a React event handler instead of being catchable by the
    // caller — the same hazard the lifecycle tests above cover for `stop()`.
    expect(() => screen.getByRole("button", { name: "zoom" }).click()).not.toThrow();
    expect(h5.instances[0]!.appliedZoom).toEqual([]);
  });
});
