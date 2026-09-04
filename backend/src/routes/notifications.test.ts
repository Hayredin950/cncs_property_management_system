import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createToken, makeNotification } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/** Hoisted above the imports, so it cannot reference them — see requests.test.ts. */
vi.mock("../lib/prisma.js", () => {
  const client = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    item: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    request: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    itemEditLog: { createMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const staffToken = createToken({ id: "staff-1", role: "STAFF" });
const adminToken = createToken({ id: "admin-1", role: "ADMIN" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /notifications", () => {
  beforeEach(() => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      makeNotification({ userId: "staff-1" }),
    ] as never);
    vi.mocked(prisma.notification.count).mockResolvedValue(1 as never);
  });

  it("strips the [CODE] prefix and returns it as its own field (D3)", async () => {
    const res = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([
      {
        id: "notif-1",
        code: "REQUEST_SUBMITTED",
        message:
          "Demo Staff requested a TRANSFER for item CNCS-DEMO-0001 " +
          "(Dell Latitude Laptop) and it needs your review.",
        relatedRequestId: "req-1",
        isRead: false,
        createdAt: "2026-09-02T08:00:00.000Z",
      },
    ]);
    expect(res.body.unreadCount).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("returns a message with no recognised prefix unchanged, code null", async () => {
    // The fallback is what makes the whole scheme safe with no schema change:
    // a row written by anything else still displays.
    vi.mocked(prisma.notification.findMany).mockResolvedValueOnce([
      makeNotification({ message: "Annual audit starts on Monday." }),
      makeNotification({ id: "notif-2", message: "[SOMETHING_ELSE] Unknown code." }),
    ] as never);

    const res = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications[0]).toMatchObject({
      code: null,
      message: "Annual audit starts on Monday.",
    });
    expect(res.body.notifications[1]).toMatchObject({
      code: null,
      message: "[SOMETHING_ELSE] Unknown code.",
    });
  });

  it("scopes every read to the caller, admin included", async () => {
    await request(app).get("/notifications").set("Authorization", `Bearer ${adminToken}`);

    const args = vi.mocked(prisma.notification.findMany).mock.calls[0]?.[0];
    expect(args?.where).toEqual({ userId: "admin-1" });
    expect(args?.orderBy).toEqual({ createdAt: "desc" });
    expect(args?.take).toBe(20);
    // There is no "read someone else's inbox" capability for any role.
    expect(vi.mocked(prisma.notification.count).mock.calls[0]?.[0]?.where).toEqual({
      userId: "admin-1",
      isRead: false,
    });
  });

  it("filters to unread without letting the filter widen the scope", async () => {
    await request(app)
      .get("/notifications?unread=true&limit=5&offset=5")
      .set("Authorization", `Bearer ${staffToken}`);

    const args = vi.mocked(prisma.notification.findMany).mock.calls[0]?.[0];
    // userId is pinned last in the object literal, so it survives any spread.
    expect(args?.where).toEqual({ isRead: false, userId: "staff-1" });
    expect(args?.take).toBe(5);
    expect(args?.skip).toBe(5);
  });

  it("keeps the unread badge count independent of the page filter", async () => {
    vi.mocked(prisma.notification.count).mockResolvedValueOnce(7 as never);

    const res = await request(app)
      .get("/notifications?unread=false")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.body.unreadCount).toBe(7);
    expect(vi.mocked(prisma.notification.findMany).mock.calls[0]?.[0]?.where).toEqual({
      userId: "staff-1",
    });
  });

  it("rejects a bad limit before querying", async () => {
    const res = await request(app)
      .get("/notifications?limit=0")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toEqual(["limit"]);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it("needs a token", async () => {
    const res = await request(app).get("/notifications");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /notifications/:id/read", () => {
  it("marks the caller's own notification read", async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValueOnce({ count: 1 } as never);

    const res = await request(app)
      .post("/notifications/notif-1/read")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "notif-1", isRead: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notif-1", userId: "staff-1" },
      data: { isRead: true },
    });
  });

  it("cannot be used to mark someone else's notification read (IDOR)", async () => {
    // `update({ where: { id } })` would have succeeded here. `updateMany` with the
    // userId in the where matches nothing, and count === 0 is the 404.
    vi.mocked(prisma.notification.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const res = await request(app)
      .post("/notifications/notif-belonging-to-admin/read")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Notification not found" });
    expect(vi.mocked(prisma.notification.updateMany).mock.calls[0]?.[0]?.where).toEqual({
      id: "notif-belonging-to-admin",
      userId: "staff-1",
    });
  });

  it("answers 404 for an id that does not exist at all", async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const res = await request(app)
      .post("/notifications/notif-ghost/read")
      .set("Authorization", `Bearer ${adminToken}`);

    // Same 404 as "not yours": the response never confirms an id exists.
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Notification not found" });
  });

  it("needs a token", async () => {
    const res = await request(app).post("/notifications/notif-1/read");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("is reachable under both mount paths", async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 } as never);

    const prefixed = await request(app)
      .post("/api/v1/notifications/notif-1/read")
      .set("Authorization", `Bearer ${staffToken}`);
    const bare = await request(app)
      .post("/notifications/notif-1/read")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(prefixed.status).toBe(200);
    expect(bare.body).toEqual(prefixed.body);
  });
});
