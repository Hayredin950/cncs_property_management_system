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
      $transaction: vi.fn((cbOrPromises: any) => {
        if (Array.isArray(cbOrPromises)) {
          return Promise.all(cbOrPromises);
        }
        return cbOrPromises(prisma);
      }),
    },
  };
});

function createToken(payload: { id: string; role: "ADMIN" | "STAFF" }) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("Audit System Integration Flow (POST /audits & POST /audits/:id/scan)", () => {
  const staffToken = createToken({ id: "staff-user-001", role: "STAFF" });
  const mockItemId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const mockSessionId = "audit-session-999";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully creates an audit session and scans an item into it", async () => {
    // 1. Setup mock returns for AuditSession creation
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

    // 2. Setup mock returns for scanning item into the session
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
    vi.mocked(prisma.item.update).mockResolvedValueOnce({ id: mockItemId } as never);

    // Step 2: POST /audits/:id/scan using the createdSessionId
    const scanItemRes = await request(app)
      .post(`/api/v1/audits/${createdSessionId}/scan`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        itemId: mockItemId,
        result: "FOUND",
      });

    expect(scanItemRes.status).toBe(201);
    expect(scanItemRes.body.id).toBe("scan-row-888");
    expect(scanItemRes.body.auditSessionId).toBe(createdSessionId);
    expect(scanItemRes.body.itemId).toBe(mockItemId);
    expect(scanItemRes.body.result).toBe("FOUND");

    // Verify Prisma database calls were executed correctly
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
  });
});
