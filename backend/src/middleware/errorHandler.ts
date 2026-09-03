import type { ErrorRequestHandler, RequestHandler } from "express";
import { isHttpError } from "../lib/httpError.js";

/**
 * Terminal 404. Registered as a bare `app.use(notFoundHandler)` — Express 5
 * removed the implicit-wildcard behaviour, and `app.all("*")` now throws at
 * startup ("Missing parameter name"), so the catch-all has to be middleware.
 */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route not found" });
};

/** body-parser tags malformed JSON with this `type` before Express sees it. */
function isBodyParseError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { type?: unknown; body?: unknown };
  return candidate.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err);
}

/**
 * The three Prisma constraint failures that are the *client's* fault, and the
 * status each deserves. Without this they all arrive as an unrecognised error
 * and answer 500 — so `POST /items` with a well-formed uuid for a category that
 * doesn't exist would report a server fault for a bad request.
 *
 * Messages are deliberately generic. Prisma's own text and its `meta.field_name`
 * name tables, columns and constraints; a route that wants to say which field
 * (`categoryId does not match an existing category`) checks for itself and gets
 * there first. This is the net underneath, not the primary path.
 */
const PRISMA_ERROR_STATUS: Readonly<Record<string, { status: number; error: string }>> = {
  P2002: { status: 409, error: "A record with that value already exists" },
  P2003: { status: 400, error: "A referenced record does not exist" },
  P2025: { status: 404, error: "Record not found" },
};

/**
 * Duck-typed rather than `instanceof Prisma.PrismaClientKnownRequestError`, for
 * the same reason `isBodyParseError` is: it keeps a value-level import of the
 * generated client out of the middleware, so errorHandler.test.ts can construct
 * a fixture without `prisma generate` having run.
 */
function prismaErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const candidate = err as { name?: unknown; code?: unknown };
  if (candidate.name !== "PrismaClientKnownRequestError") return null;
  return typeof candidate.code === "string" ? candidate.code : null;
}

/**
 * Central error handler. Must declare all four parameters — Express decides
 * something is an error handler by `fn.length === 4`, so dropping the unused
 * `next` silently downgrades this to ordinary middleware and every thrown
 * error becomes Express's default HTML 500 page.
 *
 * Response body stays `{ error: string }` (+ `details`) to match every
 * hand-written handler in this codebase.
 *
 * This is also where the logging lives. Phase 2's routers `next(err)` instead of
 * writing their own 500 (routes/tags.ts predates the handler and still does its
 * own), because a business rule that throws inside `prisma.$transaction` has to
 * keep its status code on the way out. Logging here rather than per-handler means
 * the method and URL are always in the line, which a per-handler string can't do.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Something already started writing — let Express tear the socket down
  // rather than trying to append a JSON body to a half-sent response.
  if (res.headersSent) {
    return next(err);
  }

  const route = `${req.method} ${req.originalUrl}`;

  // BEFORE the HttpError branch, not after. body-parser's SyntaxError carries
  // `status: 400` of its own, so the structural isHttpError() check matches it and
  // would answer with "Unterminated string in JSON at position 24" — a parser
  // internal, and not the documented `Invalid JSON body`.
  if (isBodyParseError(err)) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (isHttpError(err)) {
    // 4xx is the API working as designed and stays out of the log. A 5xx that
    // arrives as an HttpError is still a bug — usually a wiring mistake.
    if (err.status >= 500) {
      console.error(`${route} failed:`, err);
    }
    return res.status(err.status).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
  }

  // Anything unrecognised is a bug, not a client problem: log it in full,
  // return nothing specific (an ORM error message can name columns).
  const prismaCode = prismaErrorCode(err);
  const mapped = prismaCode ? PRISMA_ERROR_STATUS[prismaCode] : undefined;
  if (mapped) {
    // Logged at warn, unlike other 4xx: reaching here means a route skipped a
    // check it could have made, which is worth seeing in the log without being
    // an outage.
    console.warn(`${route} rejected by the database (${prismaCode})`);
    return res.status(mapped.status).json({ error: mapped.error });
  }

  console.error(`Unhandled error on ${route}:`, err);
  return res.status(500).json({ error: "Internal server error" });
};
