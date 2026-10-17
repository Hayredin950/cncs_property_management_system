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
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      auditItemResultRow: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        createMany: vi.fn(),
        groupBy: vi.fn(),
        count: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      notification: {
        create: vi.fn(),
        createMany: vi.fn(),
      },
      item: {
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((operations) => {
        if (Array.isArray(operations)) {
          return Promise.all(operations);
        }
        return operations;
      }),
    },
  };
});

function createToken(payload: {
  id: string;
  role: "SYSTEM_ADMIN" | "PROPERTY_OFFICER" | "DEPARTMENT_HEAD" | "STAFF" | "AUDITOR";
}) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("Audit Endpoints", () => {
  // Only AUDITOR holds AUDIT_RUN/AUDIT_VIEW (spec 8.1). Ids stay as they were so
  // the `runById` assertions below keep their meaning.
  const adminToken = createToken({ id: "user-admin-1", role: "AUDITOR" });
  const staffToken = createToken({ id: "user-staff-1", role: "AUDITOR" });

  /**
   * `GET /active` and `GET /findings` are single-segment literals, and both are
   * declared *above* `GET /:id` — which is the only thing that makes them
   * reachable. With the param route first, `/audits/active` reached `/:id` with
   * `id === "active"` and answered 404, and the dashboard tile read that as "no
   * active audit". `findUnique` is the tell: `/:id` is its only caller here, so
   * "never called" is what proves the literal path was matched.
   */
  describe("static paths declared above the :id route", () => {
    const auditorAuth = { Authorization: `Bearer ${createToken({ id: "user-auditor-9", role: "AUDITOR" })}` };

    it("answers GET /audits/active instead of looking up a session named \"active\"", async () => {
      vi.mocked(prisma.auditSession.findFirst).mockResolvedValueOnce(null as never);

      const res = await request(app).get("/api/v1/audits/active").set(auditorAuth);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ active: false });
      expect(prisma.auditSession.findUnique).not.toHaveBeenCalled();
    });

    it("answers GET /audits/findings?status=OPEN instead of a session named \"findings\"", async () => {
      vi.mocked(prisma.auditItemResultRow.count).mockResolvedValueOnce(3 as never);

      const res = await request(app).get("/api/v1/audits/findings?status=OPEN").set(auditorAuth);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 3 });
      expect(prisma.auditSession.findUnique).not.toHaveBeenCalled();
    });
  });

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
          status: "IN_PROGRESS",
          snapshotTotalCount: 0,
          excludedAuditorCount: 0,
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
        .send({ itemId: validItemId });

      expect(res.status).toBe(401);
    });

    it("returns 400 when itemId is not a valid UUID", async () => {
      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: "invalid-uuid" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 404 when audit session does not exist", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Audit session not found");
    });

    it("returns 409 when the audit session is already completed", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
        completedAt: new Date().toISOString(),
      } as never);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Audit session is already completed");
      // Must reject before ever touching the item or writing a scan row.
      expect(prisma.item.findUnique).not.toHaveBeenCalled();
      expect(prisma.auditItemResultRow.create).not.toHaveBeenCalled();
    });

    it("returns 404 when item does not exist", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
        completedAt: null,
      } as never);
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Item not found");
    });

    it("returns 201, always persists result FOUND, and never touches lastAuditedAt", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
        completedAt: null,
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

      // Client sends no `result` field at all — the server decides it.
      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("scan-row-1");
      expect(res.body.result).toBe("FOUND");

      expect(prisma.auditItemResultRow.create).toHaveBeenCalledWith({
        data: {
          auditSessionId: sessionId,
          itemId: validItemId,
          result: "FOUND",
          scannedAt: expect.any(Date),
        },
        include: {
          item: true,
        },
      });

      // The scan endpoint must never touch the item record. lastAuditedAt
      // is owned exclusively by audit completion (Phase 3 Step 2).
      expect(prisma.item.update).not.toHaveBeenCalled();
    });

    it("accepts an explicit scannedAt and uses it instead of the current time", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
        completedAt: null,
      } as never);
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({
        id: validItemId,
        name: "Test Laptop",
      } as never);
      vi.mocked(prisma.auditItemResultRow.create).mockResolvedValueOnce({
        id: "scan-row-2",
        auditSessionId: sessionId,
        itemId: validItemId,
        result: "FOUND",
        scannedAt: "2026-01-01T00:00:00.000Z",
        item: { id: validItemId, name: "Test Laptop" },
      } as never);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/scan`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ itemId: validItemId, scannedAt: "2026-01-01T00:00:00.000Z" });

      expect(res.status).toBe(201);
      expect(prisma.auditItemResultRow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scannedAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        })
      );
    });
  });

  describe("POST /audits/:id/complete", () => {
    const sessionId = "session-123";

    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).post(`/api/v1/audits/${sessionId}/complete`);

      expect(res.status).toBe(401);
    });

    it("returns 404 when the audit session does not exist", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/complete`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Audit session not found");
    });

    it("returns 409 when the audit session is already completed", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
        completedAt: new Date(),
      } as never);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/complete`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Audit session is already completed");
    });

    it("returns 400 for an unsupported scope type", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
        completedAt: null,
        scopeType: "LOCATION",
        scopeValue: "Building A / Room 101",
      } as never);

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/complete`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Unsupported scopeType for audit completion: LOCATION");
    });

    it("completes an audit with found, missing, and mismatched items", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: sessionId,
        completedAt: null,
        scopeType: "DEPARTMENT",
        scopeValue: "CNCS",
      } as never);
      vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
        { id: "item-found" },
        { id: "item-missing" },
      ] as never);
      vi.mocked(prisma.auditItemResultRow.findMany).mockResolvedValueOnce([
        { itemId: "item-found" },
        { itemId: "item-found" },
        { itemId: "item-mismatch" },
      ] as never);
      vi.mocked(prisma.auditItemResultRow.updateMany).mockResolvedValueOnce({ count: 1 } as never);
      vi.mocked(prisma.auditItemResultRow.createMany).mockResolvedValueOnce({ count: 1 } as never);
      vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
      vi.mocked(prisma.auditSession.updateMany).mockResolvedValueOnce({ count: 1 } as never);
      vi.mocked(prisma.$transaction).mockImplementationOnce(
        ((operations: Promise<unknown>[]) => Promise.all(operations)) as never,
      );

      const res = await request(app)
        .post(`/api/v1/audits/${sessionId}/complete`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        auditSessionId: sessionId,
        counts: { found: 1, missing: 1, locationMismatch: 1 },
        found: ["item-found"],
        missing: ["item-missing"],
        locationMismatch: ["item-mismatch"],
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.auditItemResultRow.updateMany).toHaveBeenCalledWith({
        where: { auditSessionId: sessionId, itemId: { in: ["item-mismatch"] } },
        data: { result: "LOCATION_MISMATCH" },
      });
      expect(prisma.auditItemResultRow.createMany).toHaveBeenCalledWith({
        data: [
          {
            auditSessionId: sessionId,
            itemId: "item-missing",
            result: "MISSING",
            scannedAt: null,
          },
        ],
      });
      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["item-found"] } },
        data: { lastAuditedAt: expect.any(Date) },
      });
    });
  });
});

/**
 * `GET /audits` — the list that makes a stored audit findable.
 *
 * The rows were always in the database; nothing in the app ever named a session
 * id, so a finished audit was only visible in the response that finished it and a
 * half-done one only in the tab that started it.
 */
describe("GET /audits", () => {
  const adminToken = createToken({ id: "user-admin-1", role: "AUDITOR" });
  const staffToken = createToken({ id: "user-staff-1", role: "AUDITOR" });

  const SESSION = {
    id: "session-1",
    scopeType: "DEPARTMENT",
    scopeValue: "Computer Science",
    runById: "user-staff-1",
    startedAt: new Date("2026-09-20T08:00:00.000Z"),
    completedAt: new Date("2026-09-20T09:30:00.000Z"),
    runBy: { id: "user-staff-1", fullName: "Sara Staff", email: "staff@cncs.aau.edu.et" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.auditSession.findMany).mockResolvedValue([SESSION] as never);
    vi.mocked(prisma.auditSession.count).mockResolvedValue(1 as never);
    // One group per (session, item, result) — the server counts groups, so 12
    // FOUND groups is 12 distinct found items, whatever `_all` would say.
    vi.mocked(prisma.auditItemResultRow.groupBy).mockResolvedValue([
      ...Array.from({ length: 12 }, (_, i) => ({
        auditSessionId: "session-1",
        itemId: `found-${i}`,
        result: "FOUND",
        _count: { _all: 1 },
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        auditSessionId: "session-1",
        itemId: `missing-${i}`,
        result: "MISSING",
        _count: { _all: 1 },
      })),
    ] as never);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/audits");

    expect(res.status).toBe(401);
    expect(prisma.auditSession.findMany).not.toHaveBeenCalled();
  });

  it("shows the whole audit history to an auditor, and narrows to their own on mine=true", async () => {
    const res = await request(app).get("/api/v1/audits").set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    // No automatic per-runner scoping: auditors and the property officer act on
    // the college's findings, so the history is college-wide unless `mine` asks.
    expect(vi.mocked(prisma.auditSession.findMany).mock.calls[0]?.[0]?.where).toEqual({});
    expect(res.body.total).toBe(1);
  });

  it("narrows to the caller's own sessions on mine=true", async () => {
    await request(app).get("/api/v1/audits").set("Authorization", `Bearer ${adminToken}`);
    expect(vi.mocked(prisma.auditSession.findMany).mock.calls[0]?.[0]?.where).toEqual({});

    await request(app).get("/api/v1/audits?mine=true").set("Authorization", `Bearer ${adminToken}`);
    // `mine` can only ever narrow what the caller already sees.
    expect(vi.mocked(prisma.auditSession.findMany).mock.calls[1]?.[0]?.where).toEqual({
      runById: "user-admin-1",
    });
  });

  it("counts items, not scan rows, when an item was scanned more than once (D11)", async () => {
    vi.mocked(prisma.auditItemResultRow.groupBy).mockResolvedValue([
      { auditSessionId: "session-1", itemId: "item-1", result: "FOUND", _count: { _all: 3 } },
    ] as never);

    const res = await request(app).get("/api/v1/audits").set("Authorization", `Bearer ${staffToken}`);

    expect(res.body.audits[0].counts).toMatchObject({ found: 1, missing: 0, locationMismatch: 0 });
  });

  it("derives the counts from the stored rows and marks the session complete", async () => {
    const res = await request(app).get("/api/v1/audits").set("Authorization", `Bearer ${staffToken}`);

    expect(res.body.audits[0]).toMatchObject({
      id: "session-1",
      scopeValue: "Computer Science",
      completed: true,
      counts: expect.objectContaining({ found: 12, missing: 3, locationMismatch: 0 }),
    });
    // One grouped query for the page, not one per audit listed.
    expect(prisma.auditItemResultRow.groupBy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.auditItemResultRow.groupBy).mock.calls[0]?.[0]?.where).toEqual({
      auditSessionId: { in: ["session-1"] },
    });
  });

  it("reports an in-progress session as not completed", async () => {
    vi.mocked(prisma.auditSession.findMany).mockResolvedValue([
      { ...SESSION, completedAt: null },
    ] as never);

    const res = await request(app).get("/api/v1/audits").set("Authorization", `Bearer ${staffToken}`);

    expect(res.body.audits[0]).toMatchObject({ completed: false, completedAt: null });
  });

  it("does not query counts at all when there are no sessions", async () => {
    vi.mocked(prisma.auditSession.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.auditSession.count).mockResolvedValue(0 as never);

    const res = await request(app).get("/api/v1/audits").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.audits).toEqual([]);
    expect(prisma.auditItemResultRow.groupBy).not.toHaveBeenCalled();
  });
});

describe("GET /audits/:id", () => {
  const staffToken = createToken({ id: "user-staff-1", role: "AUDITOR" });

  const item = {
    tagId: "CNCS-0001",
    name: "Dell Laptop",
    orgUnitRef: { name: "CNCS" },
    buildingRef: { name: "CNCS Building" },
    floor: "3",
    room: "312",
  };

  it("collapses duplicate scan rows so each item appears once (D11)", async () => {
    vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
      id: "session-1",
      scopeType: "DEPARTMENT",
      scopeValue: "Computer Science",
      runById: "user-staff-1",
      startedAt: new Date("2026-09-20T08:00:00.000Z"),
      completedAt: new Date("2026-09-20T09:30:00.000Z"),
    } as never);
    vi.mocked(prisma.auditItemResultRow.findMany).mockResolvedValueOnce([
      { itemId: "item-1", result: "FOUND", scannedAt: new Date("2026-09-20T09:00:00.000Z"), item },
      { itemId: "item-1", result: "FOUND", scannedAt: new Date("2026-09-20T09:05:00.000Z"), item },
      { itemId: "item-2", result: "MISSING", scannedAt: null, item },
    ] as never);

    const res = await request(app)
      .get("/api/v1/audits/session-1")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ found: 1, missing: 1, locationMismatch: 0 });
    expect(res.body.found).toEqual(["item-1"]);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0].item).toMatchObject({ department: "CNCS", building: "CNCS Building" });
  });
});

describe("Phase 2 Audit Workflow Endpoints", () => {
  const auditorToken = createToken({ id: "auditor-1", role: "AUDITOR" });
  const propertyOfficerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });
  const staffToken = createToken({ id: "staff-1", role: "STAFF" });

  describe("POST /audits/:id/close-walk", () => {
    it("updates remaining PENDING items to NOT_LOCATED and sets status to SORTING", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: "session-p2",
        status: "IN_PROGRESS",
        completedAt: null,
      } as never);
      vi.mocked(prisma.auditItemResultRow.count)
        .mockResolvedValueOnce(5 as never)
        .mockResolvedValueOnce(2 as never)
        .mockResolvedValueOnce(1 as never);

      const res = await request(app)
        .post("/api/v1/audits/session-p2/close-walk")
        .set("Authorization", `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SORTING");
      expect(res.body.counts).toEqual({ found: 5, notLocated: 2, locationMismatch: 1 });
      expect(prisma.auditItemResultRow.updateMany).toHaveBeenCalledWith({
        where: { auditSessionId: "session-p2", result: "PENDING" },
        data: { result: "NOT_LOCATED" },
      });
      expect(prisma.auditSession.update).toHaveBeenCalledWith({
        where: { id: "session-p2" },
        data: { status: "SORTING" },
      });
    });
  });

  describe("POST /audits/:id/sort-item", () => {
    it("sorts a NOT_LOCATED item into NOT_ACCESSIBLE, CHECK_AGAIN, or MISSING", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: "session-p2",
        status: "SORTING",
      } as never);
      vi.mocked(prisma.auditItemResultRow.findUnique).mockResolvedValueOnce({
        id: "row-1",
        auditSessionId: "session-p2",
        itemId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      } as never);
      vi.mocked(prisma.auditItemResultRow.update).mockResolvedValueOnce({
        id: "row-1",
        result: "CHECK_AGAIN",
        sortReason: "Office locked",
        checkAgainDays: 5,
      } as never);

      const res = await request(app)
        .post("/api/v1/audits/session-p2/sort-item")
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({
          itemId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          result: "CHECK_AGAIN",
          sortReason: "Office locked",
          checkAgainDays: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.result).toBe("CHECK_AGAIN");
      expect(res.body.sortReason).toBe("Office locked");
    });
  });

  describe("POST /audits/:id/finalize", () => {
    it("generates reportNumber, stores frozenReport, and marks COMPLETED", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: "session-p2",
        status: "SORTING",
        completedAt: null,
        snapshotTotalCount: 2,
        excludedAuditorCount: 0,
        runBy: { id: "auditor-1", fullName: "Auditor User", email: "auditor@cncs.aau.edu.et" },
      } as never);
      vi.mocked(prisma.auditSession.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.auditItemResultRow.findMany).mockResolvedValueOnce([
        {
          itemId: "item-1",
          result: "FOUND",
          scannedAt: new Date(),
          item: { tagId: "TAG-1", name: "Laptop", category: { name: "IT" }, floor: "1", room: "101" },
        },
        {
          itemId: "item-2",
          result: "MISSING",
          sortReason: "Searched everywhere",
          scannedAt: null,
          item: { tagId: "TAG-2", name: "Desktop", category: { name: "IT" }, floor: "1", room: "102" },
        },
      ] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: "po-1" }] as never);

      const res = await request(app)
        .post("/api/v1/audits/session-p2/finalize")
        .set("Authorization", `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.reportNumber).toMatch(/^AUD-\d{4}-0001$/);
      expect(res.body.frozenReport).toBeDefined();
      expect(res.body.counts).toEqual({
        found: 1,
        notAccessible: 0,
        checkAgain: 0,
        missing: 1,
        locationMismatch: 0,
        notLocated: 0,
      });
      // Notified Property Officer because missing > 0
      expect(prisma.notification.createMany).toHaveBeenCalled();
    });
  });

  describe("POST /audits/:id/acknowledge", () => {
    it("rejects non-property-officer roles with 403", async () => {
      const res = await request(app)
        .post("/api/v1/audits/session-p2/acknowledge")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    it("allows Property Officer to acknowledge a COMPLETED audit", async () => {
      vi.mocked(prisma.auditSession.findUnique).mockResolvedValueOnce({
        id: "session-p2",
        status: "COMPLETED",
        completedAt: new Date(),
        runById: "auditor-1",
        runBy: { id: "auditor-1", fullName: "Auditor User" },
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        fullName: "Officer Jane",
      } as never);
      vi.mocked(prisma.auditSession.update).mockResolvedValueOnce({
        id: "session-p2",
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedById: "officer-1",
      } as never);

      const res = await request(app)
        .post("/api/v1/audits/session-p2/acknowledge")
        .set("Authorization", `Bearer ${propertyOfficerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ACKNOWLEDGED");
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "auditor-1",
          }),
        }),
      );
    });
  });
});
