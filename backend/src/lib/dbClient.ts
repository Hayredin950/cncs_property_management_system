import { Prisma } from "../generated/prisma/client.js";

/**
 * Anything that can run a query: the long-lived `prisma` singleton exported from
 * lib/prisma.ts, or the `tx` handle inside `prisma.$transaction(async (tx) => ...)`.
 *
 * `PrismaClient` is assignable to `Prisma.TransactionClient` (the latter is the
 * former minus `$transaction`/`$connect`/`$on`/`$extends`), so a single alias
 * covers both and services never care which one they were handed.
 */
export type DbClient = Prisma.TransactionClient;
