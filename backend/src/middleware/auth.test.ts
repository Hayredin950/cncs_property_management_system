import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { authenticate, AuthenticatedRequest, requireRole } from "./auth.js";

process.env.JWT_SECRET = "test_secret";

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("authenticate", () => {
  it("rejects requests with no Authorization header", () => {
    const req = { headers: {} } as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches req.user for a valid token", () => {
    const token = jwt.sign({ id: "user-1", role: "STAFF" }, "test_secret");
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(req.user).toEqual({ id: "user-1", role: "STAFF" });
    expect(next).toHaveBeenCalled();
  });

  it("rejects an invalid token", () => {
    const req = { headers: { authorization: "Bearer garbage" } } as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("blocks a role not in the allowed list", () => {
    const req = { user: { id: "u1", role: "STAFF" } } as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    requireRole(["ADMIN"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a role in the allowed list", () => {
    const req = { user: { id: "u1", role: "ADMIN" } } as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    requireRole(["ADMIN"])(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
