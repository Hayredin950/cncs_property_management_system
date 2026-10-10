import path from "node:path";
import dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
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
// Three levels up: this file is `backend/src/lib/` and the `.env` is at the
// repo root, next to `docker-compose.yaml`.
dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
