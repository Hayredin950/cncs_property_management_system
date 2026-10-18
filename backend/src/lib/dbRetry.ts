/**
 * Bounded retry for the one database failure that is not a bug: a connection
 * that never got established.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * Nothing in the app is wrong when `connect()` to the pooled Neon endpoint times
 * out — measured on this project's own machine, roughly a third of *new* outbound
 * TCP connections to `…-pooler…neon.tech:5432` fail with `ETIMEDOUT` about 760 ms
 * in, then succeed on the next attempt (see `docs/db-connection-resilience.md`).
 * `pg`'s pool does not retry: the failed attempt rejects the query that needed a
 * connection, `@prisma/adapter-pg` maps the socket error to `SocketTimeout`, and
 * the route answers **500 "Internal server error"** for what is a transient
 * network event.
 *
 * That single behaviour was reported from the live app as four separate bugs —
 * `GET /requests/:id`, `GET /audits/:id` (the audit report page), the audit
 * history page's export button, and every CSV/PDF export — each of which answered
 * 500 on a cold pool and 200 on the next click. Verified before this file existed:
 * 8 of 12 consecutive `GET /requests/seed-req-0001` calls answered 500, all of
 * them `code: 'ETIMEDOUT'` logged by `middleware/errorHandler.ts`.
 *
 * ── Which errors are retried, and why the list is short ───────────────────
 * Only errors that prove the statement **never reached the server**:
 *
 *   - `ETIMEDOUT`, `ECONNREFUSED`, `ENETUNREACH`, `EHOSTUNREACH` — the TCP
 *     handshake to the pooler did not complete.
 *   - `EAI_AGAIN`, `ENOTFOUND` — name resolution failed (a transient resolver
 *     blip is the same class of event).
 *   - Prisma's `P1001` ("Can't reach database server") — the same failure as
 *     Prisma reports it when the adapter did not map a socket code.
 *
 * `ECONNRESET` and `P1002` are deliberately **absent**. Both can arrive after the
 * server acknowledged — or even executed — the statement, so retrying them could
 * apply a write twice. This project's routes write approvals, edit-log rows and
 * token versions; a duplicated approval is worse than a 500 the user can retry
 * themselves. The failures measured here are all pre-connection, and those are
 * the only ones this helper will touch.
 *
 * Retrying a **read** after `ECONNRESET` would be safe, but the retry lives on the
 * Prisma client (see `lib/prisma.ts`), where an operation's read/write nature is
 * not knowable from the error alone. Erring toward "the user sees a 500 and can
 * click again" is the correct trade.
 */

/** Socket/Prisma codes that mean the server was never reached. */
export const TRANSIENT_CONNECTION_CODES: ReadonlySet<string> = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "P1001",
]);

/**
 * Walks the `cause` chain as well as the error itself.
 *
 * Prisma wraps the driver's error (`PrismaClientKnownRequestError` carrying the
 * socket `code`, which is what the log showed), but the adapter's own
 * `DriverAdapterError` puts the original on `cause`, and a future Prisma release
 * could pick either. Reading both costs nothing and stops this helper from
 * silently becoming a no-op after an upgrade.
 */
function codesIn(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  // Bounded: a self-referencing `cause` must not spin.
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") codes.push(candidate.code);
    current = candidate.cause;
  }
  return codes;
}

function messagesIn(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { message?: unknown; cause?: unknown };
    if (typeof candidate.message === "string") messages.push(candidate.message);
    current = candidate.cause;
  }
  return messages;
}

/** True when the error proves no statement reached the database. */
export function isTransientConnectionError(error: unknown): boolean {
  if (codesIn(error).some((code) => TRANSIENT_CONNECTION_CODES.has(code))) {
    return true;
  }
  return messagesIn(error).some((msg) =>
    msg.includes("Connection terminated due to connection timeout")
  );
}

export interface ConnectionRetryOptions {
  /**
   * Total attempts, including the first. Four attempts leaves ~2.6% of requests
   * failing at the measured ~40% per-attempt rate (0.4⁴), against ~40% with no
   * retry at all.
   */
  attempts?: number;
  /** Delay before each retry, indexed by attempt number — so it can grow linearly. */
  delaysMs?: readonly number[];
  /** Injected by the tests so they do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry, for a log line. Never called for a non-transient error. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const DEFAULT_ATTEMPTS = 4;
const DEFAULT_DELAYS_MS = [100, 250, 600] as const;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Runs `run` and, while it fails with a transient connection error, tries again.
 *
 * Anything that is not a transient connection error propagates on the first throw
 * — a validation failure, a unique-constraint conflict or a business-rule
 * `HttpError` must keep its own status and is never delayed or repeated.
 *
 * The last error is rethrown unchanged, so `errorHandler` still logs the real
 * `code` and still answers 500 when every attempt fails.
 */
export async function withConnectionRetry<T>(
  run: () => Promise<T>,
  options: ConnectionRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const canRetry = attempt < attempts && isTransientConnectionError(error);
      if (!canRetry) throw error;

      // `noUncheckedIndexedAccess`: a shortened `delaysMs` falls back to the last
      // value rather than to `undefined`.
      const delayMs = delays[attempt - 1] ?? delays[delays.length - 1] ?? 0;
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
