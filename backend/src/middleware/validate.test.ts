import express, { type Application, type Response } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "./errorHandler.js";
import {
  validateBody,
  validateQuery,
  validatedBody,
  validatedQuery,
  type ValidatedRequest,
} from "./validate.js";

/**
 * The one thing that must not drift: the 400 body. routes/auth.ts hand-rolled
 * `{ error: <first issue message>, details: <issues> }` and its tests assert on
 * that exact shape, so this middleware has to produce the same bytes rather than
 * a second, prettier error format.
 */

const bodySchema = z.object({
  reason: z.string().trim().min(10, "reason must be at least 10 characters"),
  count: z.number().int().optional(),
});

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function buildApp(): Application {
  const app = express();
  app.use(express.json());

  app.post("/body", validateBody(bodySchema), (req, res: Response) => {
    res.status(200).json({ received: validatedBody<z.infer<typeof bodySchema>>(req) });
  });

  app.get("/query", validateQuery(querySchema), (req, res: Response) => {
    res.status(200).json({
      received: validatedQuery<z.infer<typeof querySchema>>(req),
      // Express 5 makes req.query a getter with no setter, so the middleware must
      // not have tried to overwrite it.
      rawQueryLimit: req.query.limit,
    });
  });

  app.get("/unvalidated", (req, res: Response) => {
    res.status(200).json({ received: validatedBody<unknown>(req as ValidatedRequest) });
  });

  app.use(errorHandler);
  return app;
}

describe("validateBody", () => {
  it("passes the parsed value through on success", async () => {
    const res = await request(buildApp())
      .post("/body")
      .send({ reason: "  Moving to the new staff office  ", count: 2 });

    expect(res.status).toBe(200);
    // Trimmed by the schema: the handler sees normalised data, not raw input.
    expect(res.body.received).toEqual({ reason: "Moving to the new staff office", count: 2 });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("rejects with the same body shape routes/auth.ts writes by hand", async () => {
    const res = await request(buildApp()).post("/body").send({ reason: "too short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reason must be at least 10 characters");
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details[0].path).toEqual(["reason"]);
    expect(Object.keys(res.body).sort()).toEqual(["details", "error"]);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("reports the first issue when several fields are wrong", async () => {
    const res = await request(buildApp())
      .post("/body")
      .send({ reason: "short", count: "not a number" });

    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThan(1);
    expect(res.body.error).toBe(res.body.details[0].message);
  });
});

describe("validateQuery", () => {
  it("coerces, applies defaults, and leaves req.query untouched", async () => {
    const res = await request(buildApp()).get("/query?status=PENDING&limit=5");

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({ status: "PENDING", limit: 5 });
    // The raw getter still holds the string form — nothing was written back to it.
    expect(res.body.rawQueryLimit).toBe("5");
  });

  it("fills in defaults when the query string is empty", async () => {
    const res = await request(buildApp()).get("/query");

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({ limit: 20 });
  });

  it("rejects an out-of-range value with the standard body", async () => {
    const res = await request(buildApp()).get("/query?limit=9999");

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toEqual(["limit"]);
  });
});

describe("validatedBody", () => {
  it("is a 500, not an empty object, when the validator was never wired up", async () => {
    // Reaching a handler without its validator is a wiring bug. Handing back `{}`
    // would turn it into a confusing failure three lines later.
    const res = await request(buildApp()).get("/unvalidated");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.details).toBe("validateBody() did not run for this route");
  });
});
