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

/** An accessory row as the router selects it. */
function accessory(overrides: Partial<{ id: string; tagId: string; status: string; parentItemId: string | null }> = {}) {
  return {
    id: "item-4",
    tagId: "CNCS-DEMO-0004",
    status: "ACTIVE",
    parentItemId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.item.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 1 } as never);
});

describe("POST /items/:id/accessories", () => {
  it("links an accessory and logs the parentItemId change", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([accessory()] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      item: { id: "item-1", tagId: "CNCS-DEMO-0001", name: "Dell Latitude Laptop" },
      linkedItemIds: ["item-4"],
      alreadyLinkedItemIds: [],
      editLogRowCount: 1,
    });
    expect(prisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-4"] } },
      data: { parentItemId: "item-1" },
    });
    // The FK is labelled with the sticker on the box, not just a uuid (D1).
    expect(vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0]?.data).toEqual([
      {
        itemId: "item-4",
        editedById: "staff-1",
        fieldChanged: "parentItemId",
        oldValue: null,
        newValue: "CNCS-DEMO-0001 (item-1)",
        editedAt: expect.any(Date),
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("accepts the single-id shape and normalises it", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([accessory()] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemId: "item-4" });

    expect(res.status).toBe(200);
    expect(res.body.linkedItemIds).toEqual(["item-4"]);
  });

  it("writes nothing when the accessory is already linked", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
      accessory({ parentItemId: "item-1" }),
    ] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(200);
    expect(res.body.linkedItemIds).toEqual([]);
    expect(res.body.alreadyLinkedItemIds).toEqual(["item-4"]);
    expect(res.body.editLogRowCount).toBe(0);
    // Idempotent: no update, and no no-op history row.
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("logs a re-parent with both bundle tags", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany)
      .mockResolvedValueOnce([accessory({ parentItemId: "item-0" })] as never)
      .mockResolvedValueOnce([{ id: "item-0", tagId: "CNCS-DEMO-0009" }] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0]?.data).toEqual([
      {
        itemId: "item-4",
        editedById: "staff-1",
        fieldChanged: "parentItemId",
        oldValue: "CNCS-DEMO-0009 (item-0)",
        newValue: "CNCS-DEMO-0001 (item-1)",
        editedAt: expect.any(Date),
      },
    ]);
  });

  it("de-duplicates a payload that names the same id twice", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([accessory()] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4", "item-4"] });

    // Without the de-duplication the length check below would 404 on a valid
    // request, because findMany returns one row for two requested ids.
    expect(res.status).toBe(200);
    expect(res.body.editLogRowCount).toBe(1);
  });

  it("refuses to make an item its own accessory", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4", "item-1"] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "An item cannot be its own accessory" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a cycle before it complains about depth", async () => {
    // item-1's own parent is item-9, and the request asks to adopt item-9.
    vi.mocked(prisma.item.findUnique)
      .mockResolvedValueOnce(makeItem({ parentItemId: "item-9" }) as never)
      .mockResolvedValueOnce({ parentItemId: null } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
      accessory({ id: "item-9", tagId: "CNCS-DEMO-0009" }),
    ] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-9"] });

    // "A is an accessory of its own accessory" is a cycle, which is the more
    // accurate answer than the depth rule that would also have rejected it.
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "That link would create a cycle in the bundle" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to nest a bundle inside another bundle (depth 2)", async () => {
    vi.mocked(prisma.item.findUnique)
      .mockResolvedValueOnce(makeItem({ parentItemId: "item-0" }) as never)
      .mockResolvedValueOnce({ parentItemId: null } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([accessory()] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "A bundle may only be 2 levels deep" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an accessory that already has accessories of its own", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([accessory()] as never);
    vi.mocked(prisma.item.count).mockResolvedValueOnce(1 as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "A bundle may only be 2 levels deep" });
    expect(prisma.item.count).toHaveBeenCalledWith({
      where: { parentItemId: { in: ["item-4"] } },
    });
  });

  it("names the ids it could not find", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([accessory()] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4", "item-ghost"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found", details: ["item-ghost"] });
  });

  it("names the disposed accessories by tag", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
      accessory({ status: "DISPOSED" }),
    ] as never);

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Item is already disposed", details: ["CNCS-DEMO-0004"] });
  });

  it("refuses to link anything to a disposed parent", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(
      makeItem({ status: "DISPOSED" }) as never,
    );

    const res = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Item is already disposed" });
    expect(prisma.item.findMany).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown parent", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .post("/items/item-ghost/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
  });

  it("rejects an empty body and an oversized batch", async () => {
    const empty = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe("accessoryItemIds must contain at least one item id");

    const tooMany = await request(app)
      .post("/items/item-1/accessories")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ accessoryItemIds: Array.from({ length: 21 }, (_, index) => `item-${index}`) });
    expect(tooMany.status).toBe(400);

    expect(prisma.item.findUnique).not.toHaveBeenCalled();
  });

  it("needs a token", async () => {
    const res = await request(app)
      .post("/items/item-1/accessories")
      .send({ accessoryItemIds: ["item-4"] });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
    expect(prisma.item.findUnique).not.toHaveBeenCalled();
  });
});

describe("DELETE /items/:id/accessories/:accessoryId", () => {
  it("unlinks the accessory and logs it", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);

    const res = await request(app)
      .delete("/items/item-1/accessories/item-4")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      item: { id: "item-1", tagId: "CNCS-DEMO-0001", name: "Dell Latitude Laptop" },
      unlinkedItemId: "item-4",
      editLogRowCount: 1,
    });
    expect(prisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: "item-4", parentItemId: "item-1" },
      data: { parentItemId: null },
    });
    expect(vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0]?.data).toEqual([
      {
        itemId: "item-4",
        editedById: "staff-1",
        fieldChanged: "parentItemId",
        oldValue: "CNCS-DEMO-0001 (item-1)",
        // SQL NULL, not the string "null" — D1.
        newValue: null,
        editedAt: expect.any(Date),
      },
    ]);
  });

  it("answers 404 when the accessory belongs to a different bundle", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const res = await request(app)
      .delete("/items/item-1/accessories/item-7")
      .set("Authorization", `Bearer ${staffToken}`);

    // Scoped by parentItemId, so this is a 404 rather than a silent no-op.
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "That accessory is not linked to this item" });
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("still unlinks when the parent is disposed", async () => {
    // Unlike linking: unlinking is how a mistaken bundle gets corrected, and
    // refusing it would leave bad data frozen in place.
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(
      makeItem({ status: "DISPOSED" }) as never,
    );

    const res = await request(app)
      .delete("/items/item-1/accessories/item-4")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.unlinkedItemId).toBe("item-4");
  });

  it("answers 404 for an unknown parent", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .delete("/items/item-ghost/accessories/item-4")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("is reachable under both mount paths", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(makeItem() as never);

    const prefixed = await request(app)
      .delete("/api/v1/items/item-1/accessories/item-4")
      .set("Authorization", `Bearer ${staffToken}`);
    const bare = await request(app)
      .delete("/items/item-1/accessories/item-4")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(prefixed.status).toBe(200);
    expect(bare.body).toEqual(prefixed.body);
  });
});
