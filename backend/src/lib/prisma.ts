import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client.js";

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
 * Use PrismaNeon adapter only in development (long-running server).
 * In production (Vercel serverless), WebSockets aren't supported,
 * so use standard PrismaClient with the pooled connection string directly.
 */
const isProduction = process.env.NODE_ENV === "production";

let prisma: PrismaClient;

if (isProduction) {
  // Production: use pooled connection directly (no WebSocket adapter)
  prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });
} else {
  // Development: use Neon WebSocket adapter for better performance
  const { PrismaNeon } = await import("@prisma/adapter-neon");
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  prisma = new PrismaClient({ adapter });
}

export { prisma };
