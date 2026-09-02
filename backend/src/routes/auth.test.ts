import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => {
  return {
    prisma: {
      user: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

function createToken(payload: { id: string; role: "ADMIN" | "STAFF" }) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("POST /auth/register", () => {
  const adminToken = createToken({ id: "admin-1", role: "ADMIN" });
  const staffToken = createToken({ id: "staff-1", role: "STAFF" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication & Authorization", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).post("/auth/register").send({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
        role: "STAFF",
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Missing or malformed Authorization header");
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("returns 401 when Authorization header has an invalid token", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", "Bearer invalid-token")
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid or expired token");
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("returns 403 when authenticated as STAFF (Admin-only route)", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Insufficient permissions");
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("Input shape validation (before touching database)", () => {
    it("returns 400 when body is empty", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 400 when name/fullName is missing or whitespace", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "   ",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("returns 400 when email or ID is missing", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("returns 400 when password is empty", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "",
          role: "STAFF",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("returns 400 when role is invalid", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "password123",
          role: "SUPERADMIN",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("Conflict handling", () => {
    it("returns 409 when a user with that email already exists", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "existing-user-id",
        fullName: "Existing User",
        email: "test@example.com",
        passwordHash: "somehash",
        role: "STAFF",
        createdAt: new Date(),
      });

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New User",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("User with this email or ID already exists");
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 409 when a user with that ID already exists", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "EMP-001",
        fullName: "Existing User",
        email: "EMP-001",
        passwordHash: "somehash",
        role: "STAFF",
        createdAt: new Date(),
      });

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New User",
          id: "EMP-001",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("User with this email or ID already exists");
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 409 if database unique constraint triggers (P2002)", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockRejectedValueOnce({
        code: "P2002",
        message: "Unique constraint failed",
      });

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New User",
          email: "conflict@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("User with this email or ID already exists");
    });
  });

  describe("Successful registration", () => {
    it("successfully creates a user, hashes password with argon2id, and excludes password hash", async () => {
      const mockCreatedUser = {
        id: "new-uuid-1",
        fullName: "Abebe Kebede",
        email: "abebe@cncs.aau.edu.et",
        role: "STAFF" as const,
        createdAt: new Date("2026-09-02T10:00:00.000Z"),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as never);

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Abebe Kebede",
          email: "abebe@cncs.aau.edu.et",
          password: "SuperSecretPassword456!",
          role: "STAFF",
        });

      expect(res.status).toBe(201);

      // Verify Prisma create was called with argon2id hash and never plaintext password
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const createCallData = vi.mocked(prisma.user.create).mock.calls[0]?.[0]?.data;
      expect(createCallData).toBeDefined();
      expect(createCallData?.fullName).toBe("Abebe Kebede");
      expect(createCallData?.email).toBe("abebe@cncs.aau.edu.et");
      expect(createCallData?.role).toBe("STAFF");
      expect(createCallData?.passwordHash).toMatch(/^\$argon2id\$/);
      // Plaintext password must never be stored
      expect((createCallData as Record<string, unknown>).password).toBeUndefined();

      // Verify safe response excludes password and passwordHash
      expect(res.body.id).toBe("new-uuid-1");
      expect(res.body.fullName).toBe("Abebe Kebede");
      expect(res.body.email).toBe("abebe@cncs.aau.edu.et");
      expect(res.body.role).toBe("STAFF");
      expect(res.body.password).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it("accepts id instead of email and assigns it properly", async () => {
      const mockCreatedUser = {
        id: "STAFF-007",
        fullName: "Chaltu Desta",
        email: "STAFF-007",
        role: "STAFF" as const,
        createdAt: new Date(),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as never);

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Chaltu Desta",
          id: "STAFF-007",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(201);
      const createCallData = vi.mocked(prisma.user.create).mock.calls[0]?.[0]?.data;
      expect(createCallData?.id).toBe("STAFF-007");
      expect(createCallData?.email).toBe("STAFF-007");
    });

    it("accepts fullName instead of name", async () => {
      const mockCreatedUser = {
        id: "admin-2",
        fullName: "Marta Alamu",
        email: "marta@example.com",
        role: "ADMIN" as const,
        createdAt: new Date(),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as never);

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fullName: "Marta Alamu",
          email: "marta@example.com",
          password: "password123",
          role: "ADMIN",
        });

      expect(res.status).toBe(201);
      expect(res.body.fullName).toBe("Marta Alamu");
      expect(res.body.role).toBe("ADMIN");
    });
  });
});
