/**
 * A thrown error that already knows which HTTP status it should become.
 *
 * The point of this existing is the approval transaction: business rules are
 * checked *inside* `prisma.$transaction(...)`, and the only way to abort a
 * transaction (and roll back everything already written in it) is to throw.
 * Returning `res.status(409)` from inside the callback would send the response
 * but let the transaction commit. So the rules throw HttpError instead, and
 * `errorHandler` turns it back into the right status on the way out.
 */
export class HttpError extends Error {
  readonly status: number;
  /** Optional extra payload, serialized as `details` in the response body. */
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Factory so call sites read as a statement rather than a `new` expression:
 *   throw httpError(409, "Request has already been decided");
 */
export function httpError(status: number, message: string, details?: unknown): HttpError {
  return new HttpError(status, message, details);
}

/**
 * Structural check rather than `instanceof`. Vitest can load a module twice
 * (once through the mocked graph, once directly), which gives two distinct
 * HttpError classes and makes `instanceof` fail for no useful reason.
 */
export function isHttpError(err: unknown): err is HttpError {
  return (
    err instanceof Error &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}
