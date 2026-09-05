import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => {
  return {
    prisma: {
      auditSession: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      auditItemResultRow: {
        create: vi.fn(),
      },
      item: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((cbOrPromises: unknown) => {
        if (Array.isArray(cbOrPromises)) {
          return Promise.all(cbOrPromises);
        }
        if (typeof cbOrPromises === "function") {
          return cbOrPromises(prisma);
        }
        return Promise.resolve(cbOrPromises);
      }),
    },
  };
});

function createToken(payload: { id: string; role: "ADMIN" | "STAFF" }) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("Audit Endpoints", () => {
  const adminToken = createToken({ id: "user-admin-1", role: "ADMIN" });
  const staffToken = createToken({ id: "user-staff-1", role: "STAFF" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /audits", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app)
        .post("/api/v1/audits")
        .send({ scopeType: "LOCATION", scopeValue: "Building A" });

      expect(res.status).toBe(401);
    });

    it("returns 400 when scopeType is missing", async () => {
      const res = await request(app)
        .post("/api/v1/audits")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ scopeValue: "Building A" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 201 and creates AuditSession on valid payload", async () => {
      const mockCreatedSession = {
        id: "session-123",
        scopeType: "LOCATION",
        scopeValue: "Building A / Room 101",
        runById: "user-staff-1",
        startedAt: new Date().toISOString(),
        completedAt: null,
        runBy: {
          id: "user-staff-1",
          fullName: "Staff User",
          email: "staff@example.com",
        },
      };

      vi.mocked(prisma.auditSession.create).mockResolvedValueOnce(mockCreatedSession as never);

      const res = await request(app)
        .post("/api/v1/audits")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          scopeType: "LOCATION",
          scopeValue: "Building A / Room 101",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("session-123");
      expect(res.body.scopeType).toBe("LOCATION");
      expect(prisma.auditSession.create).toHaveBeenCalledWith({
        data: {
          scopeType: "LOCATION",
          scopeValue: "Building A / Room 101",
          runById: "user-staff-1",
        },
        include: {
          runBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });
    });
  });

  describe("POST /audits/:id/scan", () => {
    const validItemId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const sessionId = "session-123";

    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .send({ itemId: validItemId, result: "FOUND" });

      expect(res.status).toBe(401);
    });

    it("returns 400 when itemId is not a valid UUID", async () => {
      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: "invalid-uuid", result: "FOUND" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 400 when result is invalid enum value", async () => {
      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId, result: "BROKEN" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 404 when audit session does not exist", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId, result: "FOUND" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Audit session not found");
    });

    it("returns 404 when item does not exist", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
      } as never);
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId, result: "FOUND" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Item not found");
    });

    it("returns 201 and records scan result when session and item exist", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
      } as never);
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({
        id: validItemId,
        name: "Test Laptop",
      } as never);

      const mockResultRow = {
        id: "scan-row-1",
        auditSessionId: sessionId,
        itemId: validItemId,
        result: "FOUND",
        scannedAt: new Date().toISOString(),
        item: { id: validItemId, name: "Test Laptop" },
      };

      vi.mocked(prisma.auditItemResultRow.create).mockResolvedValueOnce(mockResultRow as never);
      vi.mocked(prisma.item.update).mockResolvedValueOnce({ id: validItemId } as never);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId, result: "FOUND" });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("scan-row-1");
      expect(res.body.result).toBe("FOUND");
      expect(prisma.auditItemResultRow.create).toHaveBeenCalled();
      expect(prisma.item.update).toHaveBeenCalled();
    });
  });
});
