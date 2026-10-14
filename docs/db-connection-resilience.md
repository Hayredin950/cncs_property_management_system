# Database connection resilience — the 500s the app was reporting

**Status: fixed and verified live, 14 Oct.** This note exists because one
infrastructure behaviour was reported from the running app as four separate
bugs, each on a different screen, and the next person to see a stray 500 from
this backend needs to know it is a known class of failure rather than start the
hunt over.

## Symptom

Clicking through the app as a Property Officer and as Staff, these answered
`500 {"error":"Internal server error"}`:

| Route | Screen |
|---|---|
| `GET /requests/:id` | the request review screen (`/requests/:id`) |
| `GET /audits/:id` | the audit report page (`/audit/:id/report`) |
| `GET /reports/audit/:id?format=csv\|pdf` | "Download audit CSV/PDF" |
| `GET /reports/inventory?format=csv` | "Download inventory CSV" |

and the audit history page showed an error toast while the list below it still
rendered.

Every one of them answered `200` on a second click. None of them was
reproducible from a test — the whole backend suite was green — and nothing was
wrong with the routes: `GET /requests/seed-req-0001`, for example, is a single
`prisma.request.findFirst` with a `select` that matches the schema exactly.

## Root cause

Transient failure to **establish a new TCP connection** to the Neon pooled
endpoint, surfaced to the client as a 500.

Measured on the development machine, against
`ep-…-pooler.c-6.us-east-2.aws.neon.tech:5432`:

```
8 fresh `pg.Client` connections, one at a time:
  0 ERR ETIMEDOUT (759 ms)
  1 ERR ETIMEDOUT (758 ms)
  2 ok  (2085 ms)
  3 ERR ETIMEDOUT (758 ms)
  …
```

- ~30–40% of **new** connections fail with `ETIMEDOUT` after a near-constant
  ~760 ms, then the next attempt succeeds.
- The failures are not per-IP: the hostname resolves to 3 IPv4 and 3 IPv6
  addresses and the timeouts land on each of them at random. Forcing
  `family: 4` changes nothing. Connection counts and concurrency do not matter —
  eight *sequential* single connections fail at the same rate.
- **Reused connections do not fail.** Through one `pg.Pool`, 58 of 60 sequential
  queries succeeded, and the only two failures were attempts 0 and 1 — the two
  that had to open a connection.

So the app's own behaviour was the amplifier:

1. `pg`'s default `idleTimeoutMillis` is 10 s, so between two clicks the only
   pooled connection was retired and the next request **always** had to open a
   new one — paying the failure rate above.
2. `pg`'s pool does not retry a failed connection attempt. It rejects the query
   that needed the connection.
3. `@prisma/adapter-pg` maps the socket error to `SocketTimeout`, Prisma raises
   `PrismaClientKnownRequestError` with `code: 'ETIMEDOUT'`, and
   `middleware/errorHandler.ts` — correct for a genuinely unrecognised error —
   answers 500 and logs `Unhandled error on GET …`.

Reproduced before the fix, 12 consecutive calls:

```
officer  /requests/seed-req-0001   {'500': 8, '200': 4}
staff    /requests/seed-req-0001   {'200': 12}
```

(The Staff run came second, on a pool that had finally warmed up — which is why
the same endpoint looked role-dependent in the bug report and is not.)

## Fix

`backend/src/lib/prisma.ts` — the pool is configured, and its two
connection-acquiring methods are retried:

- `idleTimeoutMillis: 30_000`, `keepAlive: true`, `connectionTimeoutMillis:
  15_000`, `max: 8`. A warm connection is one that cannot fail to connect, so the
  cheapest fix is to stop throwing them away.
- `connect()` and `query()` are wrapped in `withConnectionRetry`
  (`backend/src/lib/dbRetry.ts`): four attempts with 100/250/600 ms backoff,
  retrying **only** errors that prove nothing was sent — `ETIMEDOUT`,
  `ECONNREFUSED`, `ENETUNREACH`, `EHOSTUNREACH`, `EAI_AGAIN`, `ENOTFOUND`,
  `P1001`.

`ECONNRESET` and `P1002` are deliberately **not** retried: both can arrive after
the server executed the statement, and this backend writes approvals, edit-log
rows and token versions. A duplicated approval is worse than a 500 the user can
retry by hand. The failures measured here are all pre-connection.

A pool-level `error` listener also logs instead of exiting the process — an
unhandled `error` event on an EventEmitter throws, and a dropped idle socket must
not take the server down.

## Verification (live, after the fix)

Same server, same six endpoints, 15 calls each — 90 requests, **0 failures**, and
`0` unhandled errors in the log:

```
officer  /requests/seed-req-0001                              {'200': 15}
staff    /requests/seed-req-0001                              {'200': 15}
officer  /audits/ce9b00a4-58ef-444f-bc22-3d176ab23436         {'200': 15}
officer  /reports/inventory?format=csv                        {'200': 15}
officer  /reports/audit/ce9b00a4-…?format=pdf                 {'200': 15}
officer  /reports/disposals?format=csv                        {'200': 15}
```

The retry log shows it engaged, and the request still succeeded:

```
[db] query failed (ETIMEDOUT); retry 1 in 100ms
[db] query failed (ETIMEDOUT); retry 2 in 250ms
[db] query failed (ETIMEDOUT); retry 3 in 600ms
```

Cost when it does engage: the first request after a cold start took 11.2 s
(Neon wake-up plus retries) where a warm one takes ~1 s. That is the trade this
fix makes, and it is the right one for a screen that was previously returning a
500.

## What this does *not* fix

- **The network itself.** ~30–40% of new outbound connections to the pooler still
  time out on this machine. If a route is ever seen failing 500 four times in a
  row, that is not the retry failing — that is four sockets, and it is worth
  checking the network path and the Neon project's connection limits.
- **Where the pooler is rate-limiting connections rather than dropping them.**
  Untested; the retry covers it either way, at the cost of the request taking
  longer.
- **The UI half of the same report.** The audit report page can legitimately show
  a *cached* completion summary while the read-back that fills its per-item
  breakdown fails. That copy was rewritten (14 Oct) so the counts are never
  presented as suspect when only the breakdown is missing —
  `AuditReportPage.tsx`, and `describeDownloadFailure` in `api/reports.ts` for
  the export toasts, which used to report a failed download with the server's
  own "Internal server error" next to data that was fine.
