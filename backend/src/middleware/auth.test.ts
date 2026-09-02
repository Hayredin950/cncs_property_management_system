import type { Response } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
  type AuthenticatedRequest,
} from "./auth.js";

process.env.JWT_SECRET = "test_secret";

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("authenticate", () => {
  it("rejects requests with no Authorization header", () => {
    const req = { headers: {} } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches req.user for a valid token", () => {
    const token = jwt.sign({ id: "user-1", role: "STAFF" }, "test_secret");
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(req.user).toEqual({ id: "user-1", role: "STAFF" });
    expect(next).toHaveBeenCalled();
  });

  it("rejects an invalid token", () => {
    const req = { headers: { authorization: "Bearer garbage" } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("blocks a role not in the allowed list", () => {
    const req = { user: { id: "u1", role: "STAFF" } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    requireRole(["ADMIN"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a role in the allowed list", () => {
    const req = { user: { id: "u1", role: "ADMIN" } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    requireRole(["ADMIN"])(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe("optionalAuthenticate", () => {
  it("allows requests with no Authorization header and doesn't set req.user", () => {
    const req = { headers: {} } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    optionalAuthenticate(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("attaches req.user for a valid token", () => {
    const token = jwt.sign({ id: "user-1", role: "STAFF" }, "test_secret");
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    optionalAuthenticate(req, res, next);

    expect(req.user).toEqual({ id: "user-1", role: "STAFF" });
    expect(next).toHaveBeenCalled();
  });

  it("allows requests with an invalid token and doesn't set req.user", () => {
    const req = { headers: { authorization: "Bearer garbage" } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    optionalAuthenticate(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
