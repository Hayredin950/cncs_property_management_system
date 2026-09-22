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

  class FakeScanner {
    state = NOT_STARTED;
    stopCalls = 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_elementId: string) {}

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
  const { state, message } = useQrScanner("qr-reader", () => {});
  return (
    <div>
      <span data-testid="scanner-state">{state}</span>
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
