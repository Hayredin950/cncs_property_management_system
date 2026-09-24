import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createRateLimiter } from "./rateLimit.js";

/**
 * The limiter is tested directly rather than through `POST /auth/login` so the
 * window and the per-IP key can be controlled exactly — going through the app
 * would need a different IP per case and would couple this to bcrypt timing.
 */
function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    status: vi.fn(function status(this: unknown) {
      return res;
    }),
    json: vi.fn(),
    headers,
  };
  return res as unknown as Response & { headers: Record<string, string> };
}

function makeReq(ip: string) {
  return { ip } as Request;
}

describe("createRateLimiter", () => {
  it("allows requests up to the limit and calls next for each", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    const res = makeRes();
    const next = vi.fn();

    limiter(makeReq("1.1.1.1"), res, next as unknown as NextFunction);
    limiter(makeReq("1.1.1.1"), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("answers 429 once the limit is exceeded, with Retry-After", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    const res = makeRes();
    const next = vi.fn();

    limiter(makeReq("2.2.2.2"), res, next as unknown as NextFunction);
    limiter(makeReq("2.2.2.2"), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: "Too many attempts. Please try again later." });
    expect(res.headers["Retry-After"]).toBeDefined();
  });

  it("counts each client separately", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    const next = vi.fn();

    limiter(makeReq("3.3.3.3"), makeRes(), next as unknown as NextFunction);
    limiter(makeReq("4.4.4.4"), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("resets the count once the window lapses", () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
      const next = vi.fn();

      limiter(makeReq("5.5.5.5"), makeRes(), next as unknown as NextFunction);
      vi.advanceTimersByTime(1500);
      limiter(makeReq("5.5.5.5"), makeRes(), next as unknown as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
