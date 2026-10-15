import { describe, expect, it, vi } from "vitest";
import {
  isTransientConnectionError,
  TRANSIENT_CONNECTION_CODES,
  withConnectionRetry,
} from "./dbRetry.js";

/** A stand-in for the error the live API produced: `ETIMEDOUT`, empty message. */
function socketTimeout(): Error & { code: string } {
  const error = new Error("") as Error & { code: string };
  error.code = "ETIMEDOUT";
  return error;
}

/** The sleeps are injected so the suite asserts the schedule without waiting for it. */
function recorder() {
  const slept: number[] = [];
  return {
    slept,
    sleep: (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    },
  };
}

describe("isTransientConnectionError", () => {
  it("recognises a socket timeout", () => {
    expect(isTransientConnectionError(socketTimeout())).toBe(true);
  });

  it("reads the code off a wrapped cause, not only the error itself", () => {
    // `@prisma/adapter-pg` puts the driver error on `cause` when it maps it.
    const wrapped = new Error("driver error", { cause: socketTimeout() });
    expect(isTransientConnectionError(wrapped)).toBe(true);
  });

  it("does not treat a constraint failure as a connection problem", () => {
    // P2002 is the client's fault and a retry would only repeat the 409.
    const conflict = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    expect(isTransientConnectionError(conflict)).toBe(false);
  });

  it("leaves ECONNRESET out, because the statement may already have run", () => {
    expect(TRANSIENT_CONNECTION_CODES.has("ECONNRESET")).toBe(false);
    expect(TRANSIENT_CONNECTION_CODES.has("P1002")).toBe(false);
  });

  it("survives a self-referencing cause chain", () => {
    const loop = new Error("loop") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isTransientConnectionError(loop)).toBe(false);
  });

  it("is false for values that are not errors at all", () => {
    expect(isTransientConnectionError(undefined)).toBe(false);
    expect(isTransientConnectionError("ETIMEDOUT")).toBe(false);
    expect(isTransientConnectionError({ code: 42 })).toBe(false);
  });
});

describe("withConnectionRetry", () => {
  it("runs once and returns the value when the first attempt succeeds", async () => {
    const run = vi.fn().mockResolvedValue("rows");
    const { slept, sleep } = recorder();

    await expect(withConnectionRetry(run, { sleep })).resolves.toBe("rows");
    expect(run).toHaveBeenCalledTimes(1);
    expect(slept).toEqual([]);
  });

  it("retries a connection timeout and keeps the successful result", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(socketTimeout())
      .mockRejectedValueOnce(socketTimeout())
      .mockResolvedValue("rows");
    const { slept, sleep } = recorder();

    await expect(withConnectionRetry(run, { sleep })).resolves.toBe("rows");
    expect(run).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([100, 250]);
  });

  it("gives up after the configured attempts and rethrows the last error", async () => {
    const run = vi.fn().mockRejectedValue(socketTimeout());
    const { slept, sleep } = recorder();

    await expect(withConnectionRetry(run, { sleep })).rejects.toMatchObject({ code: "ETIMEDOUT" });
    // Four attempts, so three waits — the first attempt is not delayed.
    expect(run).toHaveBeenCalledTimes(4);
    expect(slept).toEqual([100, 250, 600]);
  });

  it("honours a caller's attempt count", async () => {
    const run = vi.fn().mockRejectedValue(socketTimeout());
    const { sleep } = recorder();

    await expect(withConnectionRetry(run, { attempts: 2, sleep })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("propagates a non-connection error immediately, without waiting", async () => {
    const conflict = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const run = vi.fn().mockRejectedValue(conflict);
    const { slept, sleep } = recorder();

    await expect(withConnectionRetry(run, { sleep })).rejects.toBe(conflict);
    expect(run).toHaveBeenCalledTimes(1);
    expect(slept).toEqual([]);
  });

  it("catches a synchronous throw the same way", async () => {
    const run = vi
      .fn()
      .mockImplementationOnce(() => {
        throw socketTimeout();
      })
      .mockResolvedValue("rows");
    const { sleep } = recorder();

    await expect(withConnectionRetry(run, { sleep })).resolves.toBe("rows");
  });

  it("reports each retry for the log, and nothing for the first attempt", async () => {
    const onRetry = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(socketTimeout()).mockResolvedValue("rows");
    const { sleep } = recorder();

    await withConnectionRetry(run, { sleep, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({ attempt: 1, delayMs: 100 });
  });

  it("falls back to the last delay when a caller supplies a shorter schedule", async () => {
    const run = vi.fn().mockRejectedValue(socketTimeout());
    const { slept, sleep } = recorder();

    await expect(
      withConnectionRetry(run, { attempts: 4, delaysMs: [50], sleep }),
    ).rejects.toThrow();
    expect(slept).toEqual([50, 50, 50]);
  });
});
