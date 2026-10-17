import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createToken } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => {
  return {
    prisma: {
      adminActionLog: { findMany: vi.fn() },
      auditSession: { findMany: vi.fn() },
    },
  };
});

const adminToken = createToken({ id: "admin-1", role: "SYSTEM_ADMIN" });
const officerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * §10.4 — `/system/events` must carry account-level activity only.
 *
 * The endpoint answered with `auditSession` rows labelled `type: "AUDIT"`: each
 * session's scope, its operator and whether it completed, sent to SYSTEM_ADMIN,
 * the one role §1 says sees zero asset data. These tests hold the two halves of
 * the fix in place — the source is `AdminActionLog`, and the audit table is not
 * read at all — because the failure was invisible from the frontend: the rows
 * arrived as a well-formed list under a plausible `type`.
 */
describe("GET /system/events", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const res = await request(app).get("/api/v1/system/events");

    expect(res.status).toBe(401);
    expect(prisma.adminActionLog.findMany).not.toHaveBeenCalled();
  });

  it("refuses a role without SYSTEM_CONFIG", async () => {
    const res = await request(app)
      .get("/api/v1/system/events")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(403);
    expect(prisma.adminActionLog.findMany).not.toHaveBeenCalled();
  });

  it("never reads audit sessions — the leak this endpoint used to be", async () => {
    vi.mocked(prisma.adminActionLog.findMany).mockResolvedValueOnce([] as never);

    const res = await request(app)
      .get("/api/v1/system/events")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // The guard that matters: no asset/audit table is reachable from here.
    expect(prisma.auditSession.findMany).not.toHaveBeenCalled();
  });

  it("maps account-log rows to the fields the dashboard widget renders", async () => {
    vi.mocked(prisma.adminActionLog.findMany).mockResolvedValueOnce([
      {
        id: "log-1",
        action: "ACCOUNT_APPROVED",
        createdAt: new Date("2026-10-10T09:00:00.000Z"),
        targetUser: { fullName: "Demo Staff" },
      },
      {
        id: "log-2",
        action: "ACCOUNT_REJECTED",
        createdAt: new Date("2026-10-09T09:00:00.000Z"),
        targetUser: null,
      },
    ] as never);

    const res = await request(app)
      .get("/api/v1/system/events")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // A bare array, matching `fetchSystemEvents()`'s return type. The old
    // `{ data: [...] }` envelope is what made the widget call `.map` on an object.
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([
      {
        id: "log-1",
        type: "ACCOUNT_APPROVED",
        message: "account approved — Demo Staff",
        timestamp: "2026-10-10T09:00:00.000Z",
      },
      {
        id: "log-2",
        type: "ACCOUNT_REJECTED",
        message: "account rejected",
        timestamp: "2026-10-09T09:00:00.000Z",
      },
    ]);
  });

  it("is empty until the account flows write the log, and says so with []", async () => {
    vi.mocked(prisma.adminActionLog.findMany).mockResolvedValueOnce([] as never);

    const res = await request(app)
      .get("/api/v1/system/events")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("defaults the page size, and clamps a silly one instead of refusing to draw", async () => {
    vi.mocked(prisma.adminActionLog.findMany).mockResolvedValue([] as never);

    await request(app)
      .get("/api/v1/system/events?limit=abc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(vi.mocked(prisma.adminActionLog.findMany).mock.calls[0]?.[0]?.take).toBe(10);

    await request(app)
      .get("/api/v1/system/events?limit=9999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(vi.mocked(prisma.adminActionLog.findMany).mock.calls[1]?.[0]?.take).toBe(50);

    await request(app)
      .get("/api/v1/system/events?limit=3")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(vi.mocked(prisma.adminActionLog.findMany).mock.calls[2]?.[0]?.take).toBe(3);
  });
});

/**
 * `/status` is the sibling widget's endpoint, and it lives in the same file —
 * the rewrite that removed the audit proxy touched both, so both are pinned.
 */
describe("GET /system/status", () => {
  it("answers the SYSTEM_ADMIN with the build facts the widget reads", async () => {
    const res = await request(app)
      .get("/api/v1/system/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      environment: expect.any(String),
      version: expect.any(String),
      database: "connected",
    });
  });

  it("refuses a role without SYSTEM_CONFIG", async () => {
    const res = await request(app)
      .get("/api/v1/system/status")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(403);
  });
});
