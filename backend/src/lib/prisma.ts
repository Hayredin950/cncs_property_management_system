import path from "node:path";
import dotenv from "dotenv";
import { Pool, type PoolClient } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { withConnectionRetry } from "./dbRetry.js";

/**
 * Load the repo-root `.env` before the client reads `DATABASE_URL`.
 *
 * Only the Prisma *CLI* was loading it, via `prisma.config.ts` — so `tsx
 * prisma/seed.ts` and `pnpm dev` started with no connection string and died on
 * "No database host or connection string was set", even though the README
 * documents both as working locally. Inside `docker compose` it never showed,
 * because compose injects `env_file: .env` itself, which is exactly the kind of
 * gap that only appears on a host where nothing injects anything.
 *
 * A missing file is silent, so a deployed environment is unaffected: the
 * platform's real variables are already in `process.env` and dotenv does not
 * overwrite them.
 */
dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });

/**
 * The connection pool, configured explicitly.
 *
 * With no options `pg`'s defaults are tuned for a same-host database and fight
 * this deployment in three ways:
 *
 *   - `idleTimeoutMillis` (10 s) retires a connection between two clicks, so a
 *     quiet app is *always* opening a new one — and a new connection to the Neon
 *     pooler is the thing that fails here (see `lib/dbRetry.ts`). Holding an idle
 *     connection for 30 s costs one pooled slot and removes most of the failures
 *     outright, because reusing a connection cannot fail to connect.
 *   - `keepAlive` is off, so a connection the network path has silently dropped
 *     is only discovered when a query is sent down it.
 *   - `connectionTimeoutMillis` is 0 (wait forever). A pooler that has stopped
 *     answering would hold the request open until the browser gave up, instead of
 *     failing into the retry below.
 *
 * `max: 8` is a deliberate ceiling: the Neon pooled endpoint caps client
 * connections well below a serverless fleet's natural appetite, and a small pool
 * that waits is better than a large one that is refused.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
});

/**
 * The pool with its two connection-acquiring methods retried.
 *
 * ── Why here, and not on the Prisma client ────────────────────────────────
 * The failure this guards against is at the socket, before any statement exists:
 * `connect()` to the pooled endpoint times out and the request that needed the
 * connection is rejected. Retrying at the query layer (`$extends`) also works,
 * but it retypes every `prisma.$transaction((tx) => …)` call site in the codebase
 * for no behavioural gain, and it still would not cover `BEGIN` — a transaction
 * acquires its connection by a different path. Retrying `connect()` covers both,
 * and is safe for both, because a `connect()` that failed means **nothing was
 * sent**: no statement ran, so a retry cannot duplicate a write.
 *
 * `query()` is wrapped for the same reason: `PrismaPg` runs every model operation
 * as `pool.query(...)`, which acquires a client internally, so this is the one
 * line that protects all of them.
 *
 * The two are the only methods wrapped. `end()`, `on()` and the counters pass
 * through untouched — `end()` because it must not be retried at shutdown, and the
 * rest because they are not connection acquisition.
 */
const retryingPool = new Proxy(pool, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver) as unknown;
    if (typeof value !== "function") return value;
    if (property !== "connect" && property !== "query") {
      // Bound to the real pool: the adapter calls `client.on(...)` and
      // `client.end()`, and neither may run with the Proxy as `this`.
      return (value as (...args: unknown[]) => unknown).bind(target);
    }

    const method = value as (...args: unknown[]) => unknown;
    return (...args: unknown[]) => {
      // `pg` accepts both `query(text, cb)` and `query(text): Promise`. A
      // callback-style call has no promise to retry, and calling back a second
      // time would be a bug, so those are passed through untouched. Prisma always
      // uses the promise form, which is the one this exists for.
      const last = args[args.length - 1];
      if (typeof last === "function") return method.apply(target, args);
      // `query`/`connect` both answer a thenable in this form — a `Query` for the
      // former, a `Promise` for the latter — so awaiting the call is what
      // `withConnectionRetry` needs to see a rejection it can act on.
      return withConnectionRetry(() => Promise.resolve(method.apply(target, args)), {
        // Logged because a retry is invisible otherwise: it is the difference
        // between "a slow request" and "the pool is failing to connect and we are
        // covering for it". One line per retry, none when the connection works.
        onRetry: ({ attempt, delayMs, error }) => {
          const code = (error as { code?: string } | null)?.code ?? "unknown";
          console.warn(`[db] ${String(property)} failed (${code}); retry ${attempt} in ${delayMs}ms`);
        },
      });
    };
  },
}) as Pool;

/**
 * A pool that has gone idle and lost its connection emits `error` on the pool
 * itself, and an unhandled `error` event on an EventEmitter **throws** — which in
 * a long-running server is a process exit for one dropped socket. `PrismaPg`
 * attaches its own listener on the pool it is given, but it is registered inside
 * `adapter.connect()`, so this one keeps the process alive from the moment the
 * pool exists. It logs rather than swallows: a reconnecting pool is normal, a
 * pool erroring on every request is not.
 */
pool.on("error", (error: Error & { code?: string }) => {
  console.warn(`[db] idle connection error (${error.code ?? "unknown"}): ${error.message}`);
});

const adapter = new PrismaPg(retryingPool);
export const prisma = new PrismaClient({ adapter });

/** Re-exported so a caller that needs a checked-out client can name the type. */
export type { PoolClient };
