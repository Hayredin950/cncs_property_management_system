import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

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
 * Use PrismaPg adapter with pooled connection string in ALL environments.
 * This works reliably in both development (long-running server) and production
 * (Vercel serverless).
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
