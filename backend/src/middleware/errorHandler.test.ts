import express, { type Application, type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { httpError } from "../lib/httpError.js";
import { errorHandler, notFoundHandler } from "./errorHandler.js";

/**
 * Without this middleware an error thrown anywhere becomes Express's default HTML
 * 500 page, and a client that always parses JSON gets an unhelpful crash. The
 * contract is `{ error: string }` (+ `details`) for everything, including the
 * cases Express itself generates.
 */

function buildApp(): Application {
  const app = express();
  app.use(express.json());

  app.post("/echo", (req, res: Response) => {
    res.status(200).json({ body: req.body });
  });

  app.get("/conflict", () => {
    throw httpError(409, "Request has already been decided");
  });

  app.get("/with-details", () => {
    throw httpError(404, "Item not found", ["item-9"]);
  });

  app.get("/wiring-bug", () => {
    throw httpError(500, "Internal server error", "validateBody() did not run for this route");
  });

  app.get("/boom", () => {
    throw new Error("Invalid `prisma.item.update()` invocation: column does not exist");
  });

  app.get("/async-boom", async () => {
    // Express 5 forwards a rejected promise from a handler automatically.
    await Promise.reject(new Error("connection terminated unexpectedly"));
  });

  /**
   * Shaped like a `PrismaClientKnownRequestError` rather than constructed from
   * one: the handler duck-types on `name` + `code`, which keeps a value-level
   * import of the generated client out of both the middleware and this test.
   */
  app.get("/prisma/:code", (req) => {
    const err = new Error("\nInvalid `prisma.item.create()` invocation:\nForeign key constraint");
    err.name = "PrismaClientKnownRequestError";
    Object.assign(err, {
      code: req.params.code,
      meta: { field_name: "Item_categoryId_fkey (index)" },
    });
    throw err;
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("gives an HttpError its own status and message", async () => {
    const res = await request(buildApp()).get("/conflict");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Request has already been decided" });
  });

  it("includes details when the error carries them", async () => {
    const res = await request(buildApp()).get("/with-details");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found", details: ["item-9"] });
  });

  it("keeps a 4xx out of the logs but records a 5xx", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await request(buildApp()).get("/conflict");
    expect(error).not.toHaveBeenCalled();

    await request(buildApp()).get("/wiring-bug");
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain("GET /wiring-bug");

    error.mockRestore();
  });

  it("turns malformed JSON into 400 rather than an HTML error page", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .set("Content-Type", "application/json")
      .send('{"reason": "unterminated');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON body" });
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("hides the detail of an unrecognised error behind a generic 500", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(buildApp()).get("/boom");

    expect(res.status).toBe(500);
    // An ORM message can name columns and constraints; log it, don't publish it.
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("prisma");
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain("GET /boom");

    error.mockRestore();
  });

  it("catches a rejected promise from an async handler", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(buildApp()).get("/async-boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });

    error.mockRestore();
  });

  it("maps the client's own constraint failures off 500", async () => {
    // A well-formed uuid for a category that does not exist is a bad request, not
    // a server fault. Without this branch every one of these read
    // "Internal server error", which sends the caller looking in the wrong place.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const duplicate = await request(buildApp()).get("/prisma/P2002");
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: "A record with that value already exists" });

    const dangling = await request(buildApp()).get("/prisma/P2003");
    expect(dangling.status).toBe(400);
    expect(dangling.body).toEqual({ error: "A referenced record does not exist" });

    const missing = await request(buildApp()).get("/prisma/P2025");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "Record not found" });

    warn.mockRestore();
  });

  it("never echoes the ORM's own text, which names tables and columns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await request(buildApp()).get("/prisma/P2003");

    expect(JSON.stringify(res.body)).not.toContain("Item_categoryId_fkey");
    expect(JSON.stringify(res.body)).not.toContain("prisma.item.create");

    warn.mockRestore();
  });

  it("still hides an unmapped Prisma code behind the generic 500", async () => {
    // P1001 is "can't reach the database" — an outage, and nothing the caller did.
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(buildApp()).get("/prisma/P1001");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});

describe("notFoundHandler", () => {
  it("answers an unknown route with JSON, not Express's HTML 404", async () => {
    const res = await request(buildApp()).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Route not found" });
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("also covers a known path with the wrong method", async () => {
    const res = await request(buildApp()).delete("/echo");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Route not found" });
  });
});
