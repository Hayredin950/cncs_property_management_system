import type { RequestHandler } from "express";
import type { z } from "zod";
import { httpError } from "../lib/httpError.js";
import type { AuthenticatedRequest } from "./auth.js";

/**
 * Request augmented with the output of a zod schema.
 *
 * Express 5 made `req.query` a lazily-computed getter with no setter, so the
 * usual "parse and overwrite req.query" trick throws at runtime. Validated
 * values therefore land on `req.validated` and are read back through the
 * accessors below.
 */
export interface ValidatedRequest extends AuthenticatedRequest {
  validated?:
    | {
        body?: unknown;
        query?: unknown;
      }
    | undefined;
}

/**
 * 400 body is deliberately byte-identical to the hand-rolled version in
 * routes/auth.ts:65-69 — `{ error: <first issue message>, details: <issues> }`.
 * Existing tests assert on that exact shape, and a second error format would
 * make the API inconsistent for the frontend.
 */
function rejectionBody(error: z.ZodError): { error: string; details: unknown } {
  const firstIssue = error.issues[0];
  return {
    error: firstIssue?.message ?? "Invalid request payload",
    details: error.issues,
  };
}

/** Validates and normalises `req.body`, storing the result on `req.validated.body`. */
export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(rejectionBody(parseResult.error));
      return;
    }
    const target = req as ValidatedRequest;
    target.validated = { ...target.validated, body: parseResult.data };
    next();
  };
}

/** Validates and normalises `req.query`, storing the result on `req.validated.query`. */
export function validateQuery<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parseResult = schema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json(rejectionBody(parseResult.error));
      return;
    }
    const target = req as ValidatedRequest;
    target.validated = { ...target.validated, query: parseResult.data };
    next();
  };
}

/**
 * Reads back what validateBody() stored. The generic is supplied by the call
 * site as `validatedBody<z.infer<typeof schema>>(req)` — the middleware can't
 * thread the type through Express's handler signature.
 *
 * Throws (→ 500) rather than returning undefined: reaching a handler without
 * its validator is a wiring bug, and silently handing back `{}` would turn it
 * into a confusing downstream failure.
 */
export function validatedBody<T>(req: ValidatedRequest): T {
  const value = req.validated?.body;
  if (value === undefined) {
    throw httpError(500, "Internal server error", "validateBody() did not run for this route");
  }
  return value as T;
}

/** Query-string counterpart of validatedBody(). */
export function validatedQuery<T>(req: ValidatedRequest): T {
  const value = req.validated?.query;
  if (value === undefined) {
    throw httpError(500, "Internal server error", "validateQuery() did not run for this route");
  }
  return value as T;
}
