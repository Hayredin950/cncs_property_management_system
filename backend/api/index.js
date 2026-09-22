/**
 * Vercel serverless entry point.
 *
 * Vercel runs no long-lived process, so `src/server.ts` — which calls
 * `app.listen()` and is the entry for Docker and local dev — is not what gets
 * deployed here. This file hands the *same* Express app to Vercel's Node
 * runtime as a request handler, and `vercel.json` routes every path to it, so
 * the routes, middleware and error handler stay exactly as the tests exercise
 * them. Nothing about `src/app.ts` changes for this.
 *
 * It imports from `dist/`, not `src/`: `tsc` already emits a self-contained
 * build (it compiles `src/**`, including the Prisma client generated into
 * `src/generated/prisma`, into `dist/`), so pointing the function at compiled
 * output means Vercel never has to resolve the ESM `.js`-suffixed imports that
 * `nodenext` requires. `vercel.json`'s buildCommand compiles before packaging.
 */
import app from "../dist/app.js";

export default app;
