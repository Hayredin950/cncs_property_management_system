import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => {
  return {
    prisma: {
      item: {
        findMany: vi.fn(),
      },
      auditSession: {
        findUnique: vi.fn(),
      },
      auditItemResultRow: {
        findMany: vi.fn(),
      },
      request: {
        findMany: vi.fn(),
      },
    },
  };
});

function createToken(payload: { id: string; role: "ADMIN" | "STAFF" }) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("Report Endpoints", () => {
  const staffToken = createToken({ id: "user-staff-1", role: "STAFF" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /reports/inventory", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).get("/api/v1/reports/inventory");
      expect(res.status).toBe(401);
    });

    it("returns 400 for an unsupported format", async () => {
      const res = await request(app)
        .get("/api/v1/reports/inventory?format=pdf")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(400);
    });

    it("returns 400 when dateFrom is after dateTo", async () => {
      const res = await request(app)
        .get("/api/v1/reports/inventory?dateFrom=2026-06-01&dateTo=2026-01-01")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("dateFrom must be on or before dateTo");
    });

    it("returns a CSV attachment with the expected headers and rows", async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
        {
          tagId: "CNCS-0001",
          name: "Dell Laptop",
          category: { name: "Electronics" },
          department: "Computer Science",
          building: "CNCS Building",
          floor: "3",
          room: "312",
          owner: { fullName: "Demo Staff", email: "staff@cncs.aau.edu.et" },
          condition: "GOOD",
          purchaseCost: { toString: () => "25000" },
          currentValue: { toString: () => "18000" },
          brand: "Dell",
          model: "Latitude 5420",
          serialNumber: "SN-123",
          status: "ACTIVE",
          disposalReason: null,
          disposedAt: null,
          registeredAt: new Date("2026-01-10T00:00:00.000Z"),
          lastAuditedAt: null,
        },
      ] as never);

      const res = await request(app)
        .get("/api/v1/reports/inventory")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain("inventory-report");
      expect(res.text).toContain("tagId,name,category");
      expect(res.text).toContain("CNCS-0001,Dell Laptop,Electronics");
      expect(res.text).toContain("18000");
    });

    it("passes department, categoryId, status and date filters into the where clause", async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([] as never);

      await request(app)
        .get(
          "/api/v1/reports/inventory?department=Biology&categoryId=cat-1&status=DISPOSED&dateFrom=2026-01-01&dateTo=2026-02-01",
        )
        .set("Authorization", `Bearer ${staffToken}`);

      expect(prisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            department: "Biology",
            categoryId: "cat-1",
            status: "DISPOSED",
            registeredAt: {
              gte: new Date("2026-01-01T00:00:00.000Z"),
              lte: new Date("2026-02-01T23:59:59.999Z"),
            },
          }),
        }),
      );
    });

    it("omits the status filter when none is given, so both ACTIVE and DISPOSED items are included (F7.2 reports exception)", async () => {
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([] as never);

      await request(app).get("/api/v1/reports/inventory").set("Authorization", `Bearer ${staffToken}`);

      const callArgs = vi.mocked(prisma.item.findMany).mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where).not.toHaveProperty("status");
    });
  });

  describe("GET /reports/audit/:auditId", () => {
    const auditId = "session-123";

    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).get(`/api/v1/reports/audit/${auditId}`);
      expect(res.status).toBe(401);
    });

    it("returns 404 when the audit session does not exist", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/v1/reports/audit/${auditId}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Audit session not found");
      expect(prisma.auditItemResultRow.findMany).not.toHaveBeenCalled();
    });

    it("returns a CSV with session metadata denormalized onto each row", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: auditId,
        scopeType: "DEPARTMENT",
        scopeValue: "CNCS",
        startedAt: new Date("2026-03-01T09:00:00.000Z"),
        completedAt: new Date("2026-03-01T12:00:00.000Z"),
        runBy: { fullName: "Jane Doe", email: "jane@cncs.aau.edu.et" },
      } as never);
      vi.mocked(prisma.auditItemResultRow.findMany).mockResolvedValueOnce([
        {
          result: "FOUND",
          scannedAt: new Date("2026-03-01T10:00:00.000Z"),
          item: {
            tagId: "CNCS-0001",
            name: "Dell Laptop",
            department: "CNCS",
            building: "CNCS Building",
            floor: "3",
            room: "312",
          },
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/reports/audit/${auditId}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain(`audit-report-${auditId}`);
      expect(res.text).toContain("scopeType,scopeValue");
      expect(res.text).toContain("DEPARTMENT,CNCS");
      expect(res.text).toContain("CNCS-0001,Dell Laptop");
      expect(res.text).toContain("FOUND");
    });

    it("still returns 200 with only FOUND rows for an in-progress (not yet completed) session", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: auditId,
        scopeType: "DEPARTMENT",
        scopeValue: "CNCS",
        startedAt: new Date(),
        completedAt: null,
        runBy: { fullName: "Jane Doe", email: "jane@cncs.aau.edu.et" },
      } as never);
      vi.mocked(prisma.auditItemResultRow.findMany).mockResolvedValueOnce([] as never);

      const res = await request(app)
        .get(`/api/v1/reports/audit/${auditId}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain("auditSessionId,scopeType");
    });
  });

  describe("GET /reports/disposals", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).get("/api/v1/reports/disposals");
      expect(res.status).toBe(401);
    });

    it("queries only APPROVED DISPOSAL requests", async () => {
      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([] as never);

      await request(app)
        .get("/api/v1/reports/disposals")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(prisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "DISPOSAL", status: "APPROVED" }),
        }),
      );
    });

    it("filters by department via the item relation", async () => {
      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([] as never);

      await request(app)
        .get("/api/v1/reports/disposals?department=Biology")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(prisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ item: { department: "Biology" } }),
        }),
      );
    });

    it("returns a CSV attachment with requester and reviewer names", async () => {
      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([
        {
          reason: "Beyond repair",
          decidedAt: new Date("2026-04-01T00:00:00.000Z"),
          requestedBy: { fullName: "Demo Staff", email: "staff@cncs.aau.edu.et" },
          reviewedBy: { fullName: "System Admin", email: "admin@cncs.aau.edu.et" },
          item: {
            tagId: "CNCS-0002",
            name: "Old Printer",
            department: "CNCS",
            building: "CNCS Building",
            floor: "1",
            room: "101",
          },
        },
      ] as never);

      const res = await request(app)
        .get("/api/v1/reports/disposals")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toContain("disposals-report");
      expect(res.text).toContain("CNCS-0002,Old Printer");
      expect(res.text).toContain("Beyond repair");
      expect(res.text).toContain("Demo Staff");
      expect(res.text).toContain("System Admin");
    });
  });
});
