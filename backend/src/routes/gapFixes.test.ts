import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createToken, makeItem } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => {
  const client = {
    item: { findUnique: vi.fn() },
    auditSession: { findUnique: vi.fn() },
    auditItemResultRow: { findMany: vi.fn() },
  };
  return { prisma: client };
});

const adminToken = createToken({ id: "admin-1", role: "ADMIN" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /departments", () => {
  it("lists the canonical CNCS departments", async () => {
    const res = await request(app).get("/departments");

    expect(res.status).toBe(200);
    const values = (res.body as { value: string }[]).map((row) => row.value);
    expect(values).toContain("Computer Science");
    expect(values).toContain("Information Science (INSY)");
    expect(values.length).toBeGreaterThanOrEqual(8);
  });
});

describe("GET /items/:id", () => {
  it("looks up by id when the segment is a uuid", async () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);

    const res = await request(app).get(`/items/${uuid}`);

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.item.findUnique).mock.calls[0]?.[0]).toMatchObject({
      where: { id: uuid },
    });
  });

  it("still looks up by tag when the segment is not a uuid", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);

    const res = await request(app).get("/items/CNCS-DEMO-0001");

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.item.findUnique).mock.calls[0]?.[0]).toMatchObject({
      where: { tagId: "CNCS-DEMO-0001" },
    });
  });
});

describe("GET /audits/:id", () => {
  it("reads a completed audit back with derived counts", async () => {
    vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
      id: "audit-1",
      scopeType: "DEPARTMENT",
      scopeValue: "Computer Science",
      runById: "admin-1",
      startedAt: new Date("2026-09-20T08:00:00.000Z"),
      completedAt: new Date("2026-09-20T09:00:00.000Z"),
    } as never);

    vi.mocked(prisma.auditItemResultRow.findMany).mockResolvedValueOnce([
      { itemId: "item-1", result: "FOUND", scannedAt: new Date(), item: { tagId: "T1" } },
      { itemId: "item-2", result: "MISSING", scannedAt: null, item: { tagId: "T2" } },
      { itemId: "item-3", result: "LOCATION_MISMATCH", scannedAt: new Date(), item: { tagId: "T3" } },
    ] as never);

    const res = await request(app)
      .get("/audits/audit-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.counts).toEqual({ found: 1, missing: 1, locationMismatch: 1 });
    expect(res.body.missing).toEqual(["item-2"]);
  });

  it("returns 404 for an unknown session", async () => {
    vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .get("/audits/missing")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
