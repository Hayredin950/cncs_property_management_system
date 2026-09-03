import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createToken, makeItem } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/** Hoisted above the imports, so it cannot reference them — see requests.test.ts. */
vi.mock("../lib/prisma.js", () => {
  const client = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    item: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    request: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    itemEditLog: { createMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const staffToken = createToken({ id: "staff-1", role: "STAFF" });
const adminToken = createToken({ id: "admin-1", role: "ADMIN" });

const DECIDED_AT = new Date("2026-09-02T09:30:00.000Z");

/** Two rows from one approval: the parent's move, sharing an exact editedAt. */
const PARENT_ROWS = [
  {
    id: "log-1",
    fieldChanged: "floor",
    oldValue: "3",
    newValue: "1",
    editedAt: DECIDED_AT,
    editedBy: { id: "admin-1", fullName: "System Admin" },
  },
  {
    id: "log-2",
    fieldChanged: "room",
    oldValue: "312",
    newValue: "101",
    editedAt: DECIDED_AT,
    editedBy: { id: "admin-1", fullName: "System Admin" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.item.findFirst).mockResolvedValue(makeItem() as never);
  vi.mocked(prisma.itemEditLog.findMany).mockResolvedValue(PARENT_ROWS as never);
  vi.mocked(prisma.itemEditLog.count).mockResolvedValue(2 as never);
});

describe("GET /items/:id/history", () => {
  it("returns the item and one entry per changed field", async () => {
    const res = await request(app)
      .get("/items/item-1/history")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    // The mock returns a whole row, so the narrowing that matters is the `select`
    // the route asks for — that is what a real client would be limited to.
    expect(vi.mocked(prisma.item.findFirst).mock.calls[0]?.[0]?.select).toEqual({
      id: true,
      tagId: true,
      name: true,
      status: true,
    });
    expect(res.body.item).toMatchObject({
      id: "item-1",
      tagId: "CNCS-DEMO-0001",
      name: "Dell Latitude Laptop",
      status: "ACTIVE",
    });
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0]).toEqual({
      id: "log-1",
      fieldChanged: "floor",
      oldValue: "3",
      newValue: "1",
      editedAt: "2026-09-02T09:30:00.000Z",
      editedBy: { id: "admin-1", fullName: "System Admin" },
    });
    expect(res.body.total).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("orders newest first, then by field name within one decision", async () => {
    await request(app).get("/items/item-1/history").set("Authorization", `Bearer ${adminToken}`);

    const args = vi.mocked(prisma.itemEditLog.findMany).mock.calls[0]?.[0];
    // Rows from one approval share an exact editedAt, so the second key is what
    // keeps a cascade's rows in a stable, readable order.
    expect(args?.orderBy).toEqual([{ editedAt: "desc" }, { fieldChanged: "asc" }]);
    expect(args?.where).toEqual({ itemId: "item-1" });
    expect(args?.take).toBe(50);
    expect(args?.skip).toBe(0);
  });

  it("still serves the history of a disposed item", async () => {
    // F7.2 keeps disposed rows in the table exactly so this keeps working. The
    // lookup goes through allItemsWhere(), which is an identity function whose
    // only job is to make "disposed included on purpose" greppable.
    vi.mocked(prisma.item.findFirst).mockResolvedValueOnce(
      makeItem({ status: "DISPOSED", disposalReason: "Beyond repair", disposedAt: DECIDED_AT }) as never,
    );
    vi.mocked(prisma.itemEditLog.findMany).mockResolvedValueOnce([
      {
        id: "log-9",
        fieldChanged: "status",
        oldValue: "ACTIVE",
        newValue: "DISPOSED",
        editedAt: DECIDED_AT,
        editedBy: { id: "admin-1", fullName: "System Admin" },
      },
    ] as never);

    const res = await request(app)
      .get("/items/item-1/history")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe("DISPOSED");
    expect(res.body.entries[0].newValue).toBe("DISPOSED");
    expect(vi.mocked(prisma.item.findFirst).mock.calls[0]?.[0]?.where).toEqual({ id: "item-1" });
  });

  it("filters to a single field", async () => {
    await request(app)
      .get("/items/item-1/history?field=ownerId&limit=10&offset=20")
      .set("Authorization", `Bearer ${adminToken}`);

    const args = vi.mocked(prisma.itemEditLog.findMany).mock.calls[0]?.[0];
    expect(args?.where).toEqual({ itemId: "item-1", fieldChanged: "ownerId" });
    expect(args?.take).toBe(10);
    expect(args?.skip).toBe(20);
    // The same where drives the count, or total would not match the filter.
    expect(vi.mocked(prisma.itemEditLog.count).mock.calls[0]?.[0]?.where).toEqual(args?.where);
  });

  it("answers 404 for an unknown item without querying the log", async () => {
    vi.mocked(prisma.item.findFirst).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .get("/items/item-ghost/history")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
    expect(prisma.itemEditLog.findMany).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range limit", async () => {
    const res = await request(app)
      .get("/items/item-1/history?limit=500")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toEqual(["limit"]);
    expect(prisma.item.findFirst).not.toHaveBeenCalled();
  });

  it("needs a token", async () => {
    const res = await request(app).get("/items/item-1/history");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
    expect(prisma.item.findFirst).not.toHaveBeenCalled();
  });

  it("is reachable under both mount paths", async () => {
    const prefixed = await request(app)
      .get("/api/v1/items/item-1/history")
      .set("Authorization", `Bearer ${staffToken}`);
    const bare = await request(app)
      .get("/items/item-1/history")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(prefixed.status).toBe(200);
    expect(bare.body).toEqual(prefixed.body);
  });
});
