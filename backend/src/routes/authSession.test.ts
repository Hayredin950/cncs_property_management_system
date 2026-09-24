import argon2 from "argon2";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createToken } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => {
  const client = {
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { prisma: client };
});

beforeEach(() => {
  vi.clearAllMocks();
});

/** A user row as `authenticate` reads it (role + tokenVersion only). */
function authRow(tokenVersion: number, role: "ADMIN" | "STAFF" = "STAFF") {
  return { role, tokenVersion };
}

describe("token revocation (`ver` vs User.tokenVersion)", () => {
  it("rejects a token whose version no longer matches the account", async () => {
    // authenticate reads the row and finds version 2, while the token says 1 —
    // which is what a password change (or an admin reset) produces.
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(authRow(2) as never);

    const stale = createToken({ id: "staff-1", role: "STAFF", ver: 1 });
    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${stale}`)
      .send({ currentPassword: "Whatever123", newPassword: "Whatever456" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("accepts a token whose version matches", async () => {
    vi.mocked(prisma.user.findUnique)
      // authenticate
      .mockResolvedValueOnce(authRow(5) as never)
      // handler: wrong current password, so the request stops after auth
      .mockResolvedValueOnce({
        id: "staff-1",
        fullName: "Demo Staff",
        email: "staff@cncs.aau.edu.et",
        passwordHash: await argon2.hash("RightPassword1", { type: argon2.argon2id }),
        role: "STAFF",
        createdAt: new Date(),
        tokenVersion: 5,
        mustChangePassword: false,
      } as never);

    const fresh = createToken({ id: "staff-1", role: "STAFF", ver: 5 });
    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${fresh}`)
      .send({ currentPassword: "WrongPassword9", newPassword: "Whatever456" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Current password is incorrect");
  });
});

describe("POST /auth/change-password", () => {
  it("changes the password, clears mustChangePassword and issues a fresh token", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(authRow(0) as never)
      .mockResolvedValueOnce({
        id: "staff-1",
        fullName: "Demo Staff",
        email: "staff@cncs.aau.edu.et",
        passwordHash: await argon2.hash("TempPassword1", { type: argon2.argon2id }),
        role: "STAFF",
        createdAt: new Date(),
        tokenVersion: 0,
        mustChangePassword: true,
      } as never);

    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: "staff-1",
      fullName: "Demo Staff",
      email: "staff@cncs.aau.edu.et",
      role: "STAFF",
      createdAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1,
    } as never);

    const token = createToken({ id: "staff-1", role: "STAFF", ver: 0 });
    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "TempPassword1", newPassword: "BrandNewPass1" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.mustChangePassword).toBe(false);

    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as {
      data: { passwordHash: string; mustChangePassword: boolean; tokenVersion: number };
    };
    expect(call.data.mustChangePassword).toBe(false);
    // Bumping the version is what logs the *other* sessions out.
    expect(call.data.tokenVersion).toBe(1);
    expect(call.data.passwordHash).not.toBe("BrandNewPass1");
  });

  it("requires a new password of at least 8 characters", async () => {
    const token = createToken({ id: "staff-1", role: "STAFF" });
    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Whatever123", newPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("8 characters");
  });
});
