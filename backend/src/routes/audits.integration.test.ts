import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

process.env.JWT_SECRET = "test_jwt_secret";

// NOTE: like every other route test in this project, Prisma is mocked here.
// This file is not a real database integration test — see docs/phase-1.md
// "Known gaps" — it exercises the route + middleware + validation stack
// end to end, which is the same convention Phase 1 and Phase 2 tests use.
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
    },
  };
});

function createToken(payload: { id: string; role: "ADMIN" | "STAFF" }) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("Audit Flow (POST /audits & POST /audits/:id/scan)", () => {
  const staffToken = createToken({ id: "staff-user-001", role: "STAFF" });
  const mockItemId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const mockSessionId = "audit-session-999";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an audit session and scans an item into it, recording FOUND without touching the item", async () => {
    const mockAuditSession = {
      id: mockSessionId,
      scopeType: "DEPARTMENT",
      scopeValue: "Engineering",
      runById: "staff-user-001",
      startedAt: new Date().toISOString(),
      completedAt: null,
      runBy: {
        id: "staff-user-001",
        fullName: "Jane Doe",
        email: "jane.doe@example.com",
      },
    };
    vi.mocked(prisma.auditSession.create).mockResolvedValueOnce(mockAuditSession as never);

    // Step 1: POST /audits to create a new session
    const createSessionRes = await request(app)
      .post("/api/v1/audits")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        scopeType: "DEPARTMENT",
        scopeValue: "Engineering",
      });

    expect(createSessionRes.status).toBe(201);
    expect(createSessionRes.body.id).toBe(mockSessionId);
    expect(createSessionRes.body.scopeType).toBe("DEPARTMENT");

    const createdSessionId = createSessionRes.body.id;

    // Step 2: POST /audits/:id/scan — client sends only itemId, no result
    vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce(mockAuditSession as never);
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({
      id: mockItemId,
      name: "Dell XPS 15",
      tagId: "CNCS-ITEM-001",
    } as never);

    const mockScanRow = {
      id: "scan-row-888",
      auditSessionId: createdSessionId,
      itemId: mockItemId,
      result: "FOUND",
      scannedAt: new Date().toISOString(),
      item: { id: mockItemId, name: "Dell XPS 15" },
    };
    vi.mocked(prisma.auditItemResultRow.create).mockResolvedValueOnce(mockScanRow as never);

    const scanItemRes = await request(app)
      .post(`/api/v1/audits/${createdSessionId}/scan`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ itemId: mockItemId });

    expect(scanItemRes.status).toBe(201);
    expect(scanItemRes.body.id).toBe("scan-row-888");
    expect(scanItemRes.body.auditSessionId).toBe(createdSessionId);
    expect(scanItemRes.body.itemId).toBe(mockItemId);
    expect(scanItemRes.body.result).toBe("FOUND");

    expect(prisma.auditSession.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditSession.findUnique).toHaveBeenCalledWith({
      where: { id: createdSessionId },
    });
    expect(prisma.item.findUnique).toHaveBeenCalledWith({
      where: { id: mockItemId },
    });
    expect(prisma.auditItemResultRow.create).toHaveBeenCalledWith({
      data: {
        auditSessionId: createdSessionId,
        itemId: mockItemId,
        result: "FOUND",
        scannedAt: expect.any(Date),
      },
      include: {
        item: true,
      },
    });

    // The item itself must be untouched by scanning — lastAuditedAt is
    // owned by audit completion, not by the scan endpoint.
    expect(prisma.item.update).not.toHaveBeenCalled();
  });

  it("rejects a scan against an already-completed audit session", async () => {
    const completedSession = {
      id: mockSessionId,
      scopeType: "DEPARTMENT",
      scopeValue: "Engineering",
      completedAt: new Date().toISOString(),
    };
    vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce(completedSession as never);

    const res = await request(app)
      .post(`/api/v1/audits/${mockSessionId}/scan`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ itemId: mockItemId });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Audit session is already completed");
    expect(prisma.item.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditItemResultRow.create).not.toHaveBeenCalled();
  });
});
