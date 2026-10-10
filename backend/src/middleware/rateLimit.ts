import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per window per client. */
  max: number;
  /** Overrides the 429 body when a route wants a more specific message. */
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Above this many live keys, expired buckets are swept before inserting. */
const SWEEP_THRESHOLD = 10_000;

/**
 * A minimal fixed-window rate limiter, keyed by client IP.
 *
 * Written in-house rather than pulling in `express-rate-limit` for one route:
 * this app's only unauthenticated write is `POST /auth/login`, and a dependency
 * (plus its lockfile change) is not worth a counter. The algorithm is the plain
 * fixed window — reset the count when the window lapses — which is enough to
 * blunt password guessing and cannot be tricked into unbounded memory by a
 * unique `X-Forwarded-For` per request, because the key is `req.ip`.
 *
 * The store is per-process. Under a serverless/multi-instance deployment each
 * instance counts separately, so the effective limit is `max × instances` —
 * still far better than no limit, and honest about what it is. A shared store
 * (Redis) would be the upgrade if this ever needs to be exact.
 *
 * `req.ip` requires Express to trust the proxy only as far as configured; the
 * default (no trust) uses the socket address, which is the conservative choice.
 */
export function createRateLimiter({ windowMs, max, message }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? "unknown";

    if (buckets.size > SWEEP_THRESHOLD) {
      for (const [existingKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(existingKey);
      }
    }

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));

    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: message ?? "Too many attempts. Please try again later." });
      return;
    }

    next();
  };
}

/** Pass-through used where a limiter must be mounted but must not interfere (tests). */
export const noRateLimit: RequestHandler = (_req, _res, next) => next();
