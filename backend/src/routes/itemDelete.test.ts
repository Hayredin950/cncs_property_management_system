import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { createToken } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/**
 * `DELETE /items/:id` — the admin-only hard delete.
 *
 * This is the one endpoint that destroys an item *and* its trail, against the
 * rest of the API's grain (SRS F7.2 keeps disposal as a status change and the
 * edit log as append-only). So the assertions that matter are the ones pinning
 * that boundary down: staff cannot reach it at all, an unknown id is a 404
 * rather than a silent success, and the dependents are removed in dependency
 * order because every relation onto `Item` is `Restrict`.
 *
 * The `vi.mock` factory is copy-pasted rather than shared — Vitest hoists it
 * above the imports, so it cannot reference anything imported. See
 * `test-utils/index.ts`.
 */
const TX_CLIENT = {
  item: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  request: { findMany: vi.fn(), deleteMany: vi.fn() },
  notification: { deleteMany: vi.fn() },
  itemEditLog: { deleteMany: vi.fn() },
  auditItemResultRow: { deleteMany: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    item: { findUnique: vi.fn(), delete: vi.fn() },
    request: { findMany: vi.fn(), deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    itemEditLog: { deleteMany: vi.fn() },
    auditItemResultRow: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown, _opts?: unknown) => {
      if (typeof arg === "function") {
        return await (arg as (tx: unknown) => Promise<unknown>)(TX_CLIENT);
      }
      return await Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

/** The item being deleted. `status` is selected too, so the response echoes it. */
const ITEM = {
  id: "item-1",
  tagId: "CNCS-AB12CD34",
  name: "Dell Latitude 5420",
  status: "ACTIVE",
};

const adminToken = createToken({ id: "admin-1", role: "ADMIN" });
const staffToken = createToken({ id: "staff-1", role: "STAFF" });

/** Records the order the mocked writes were called in — the FK ordering is the point. */
let calls: string[] = [];

function trackCalls(): void {
  const entries: [string, { mock: { invocationCallOrder: number[] } }][] = [
    ["unlinkAccessories", TX_CLIENT.item.updateMany],
    ["deleteNotifications", TX_CLIENT.notification.deleteMany],
    ["deleteRequests", TX_CLIENT.request.deleteMany],
    ["deleteEditLogs", TX_CLIENT.itemEditLog.deleteMany],
    ["deleteAuditResults", TX_CLIENT.auditItemResultRow.deleteMany],
    ["deleteItem", TX_CLIENT.item.delete],
  ];
  const ordered = entries
    .filter(([, fn]) => fn.mock.invocationCallOrder.length > 0)
    .sort((a, b) => a[1].mock.invocationCallOrder[0]! - b[1].mock.invocationCallOrder[0]!)
    .map(([name]) => name);
  calls = ordered;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];

  TX_CLIENT.item.findUnique.mockResolvedValue(ITEM);
  TX_CLIENT.item.updateMany.mockResolvedValue({ count: 1 });
  TX_CLIENT.request.findMany.mockResolvedValue([{ id: "req-1" }, { id: "req-2" }]);
  TX_CLIENT.notification.deleteMany.mockResolvedValue({ count: 3 });
  TX_CLIENT.request.deleteMany.mockResolvedValue({ count: 2 });
  TX_CLIENT.itemEditLog.deleteMany.mockResolvedValue({ count: 7 });
  TX_CLIENT.auditItemResultRow.deleteMany.mockResolvedValue({ count: 1 });
  TX_CLIENT.item.delete.mockResolvedValue(ITEM);
});

describe("DELETE /items/:id", () => {
  it("refuses an anonymous caller", async () => {
    const res = await request(app).delete("/api/v1/items/item-1");

    expect(res.status).toBe(401);
    expect(TX_CLIENT.item.delete).not.toHaveBeenCalled();
  });

  it("refuses staff — removal is not the fleet's disposal path", async () => {
    const res = await request(app)
      .delete("/api/v1/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`);

    // 403, not 404: the endpoint exists, this caller may not use it.
    expect(res.status).toBe(403);
    expect(TX_CLIENT.item.findUnique).not.toHaveBeenCalled();
    expect(TX_CLIENT.item.delete).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown item and deletes nothing", async () => {
    TX_CLIENT.item.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/v1/items/does-not-exist")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(TX_CLIENT.item.updateMany).not.toHaveBeenCalled();
    expect(TX_CLIENT.item.delete).not.toHaveBeenCalled();
  });

  it("deletes the item and its dependents, and reports what went", async () => {
    const res = await request(app)
      .delete("/api/v1/items/item-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "item-1",
      tagId: "CNCS-AB12CD34",
      unlinkedAccessoryCount: 1,
      deletedRequestCount: 2,
      deletedEditLogCount: 7,
      deletedAuditResultCount: 1,
    });
  });

  it("removes dependents before the row, since every relation is Restrict", async () => {
    await request(app)
      .delete("/api/v1/items/item-1")
      .set("Authorization", `Bearer ${adminToken}`);

    trackCalls();
    // Deleting the item first would abort on a foreign-key error rather than
    // cascading, so the order is load-bearing, not incidental.
    expect(calls).toEqual([
      "unlinkAccessories",
      "deleteNotifications",
      "deleteRequests",
      "deleteEditLogs",
      "deleteAuditResults",
      "deleteItem",
    ]);
  });

  it("unlinks accessories instead of deleting them", async () => {
    await request(app)
      .delete("/api/v1/items/item-1")
      .set("Authorization", `Bearer ${adminToken}`);

    // The children are separate assets that merely pointed at this item.
    expect(TX_CLIENT.item.updateMany).toHaveBeenCalledWith({
      where: { parentItemId: "item-1" },
      data: { parentItemId: null },
    });
  });

  it("skips the request cleanup when the item has no requests", async () => {
    TX_CLIENT.request.findMany.mockResolvedValue([]);

    const res = await request(app)
      .delete("/api/v1/items/item-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deletedRequestCount).toBe(0);
    // An `in: []` delete is a wasted round trip; it must not be issued at all.
    expect(TX_CLIENT.notification.deleteMany).not.toHaveBeenCalled();
    expect(TX_CLIENT.request.deleteMany).not.toHaveBeenCalled();
  });

  it("does not commit the item delete when a dependent removal fails", async () => {
    TX_CLIENT.request.deleteMany.mockRejectedValue(new Error("constraint violation"));

    const res = await request(app)
      .delete("/api/v1/items/item-1")
      .set("Authorization", `Bearer ${adminToken}`);

    // The throw aborts the transaction, so the item survives — a half-deleted
    // record would be worse than a failed request.
    expect(res.status).toBe(500);
    expect(TX_CLIENT.item.delete).not.toHaveBeenCalled();
  });
});
