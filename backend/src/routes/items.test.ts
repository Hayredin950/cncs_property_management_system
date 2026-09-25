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
    category: { findUnique: vi.fn(), findMany: vi.fn() },
    item: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    itemEditLog: { createMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown, _opts?: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const staffToken = createToken({ id: "staff-1", role: "STAFF" });
const adminToken = createToken({ id: "admin-1", role: "ADMIN" });

/**
 * Richer than `makeItem()` on purpose: every field SRS 3.4 hides from the public
 * has to be present for a stripping assertion to mean anything. `purchaseCost` is
 * a plain number here — Prisma hands back a `Decimal`, but nothing in these
 * routes does arithmetic on it, so the JSON shape is what matters.
 */
const FULL_ITEM = {
  ...makeItem(),
  condition: "GOOD",
  brand: "Dell",
  model: "Latitude 5420",
  serialNumber: "SN-998822",
  photoUrl: "https://example.com/laptop.jpg",
  notes: "Screen replaced in 2025",
  purchaseCost: 45000,
  currentValue: 32000,
  registeredAt: new Date("2026-09-01T00:00:00.000Z"),
  category: { id: "cat-electronics", name: "Electronics" },
  owner: { id: "staff-1", fullName: "Demo Staff", email: "staff@cncs.aau.edu.et" },
};

/** The keys SDS 3.2 says to strip before sending, when the viewer is the public. */
const STRIPPED_FOR_PUBLIC = [
  "purchaseCost",
  "currentValue",
  "brand",
  "model",
  "serialNumber",
  "notes",
  "ownerId",
  "owner",
  "parentItemId",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.item.findMany).mockResolvedValue([FULL_ITEM] as never);
  vi.mocked(prisma.item.count).mockResolvedValue(1 as never);
  vi.mocked(prisma.item.findUnique).mockResolvedValue(FULL_ITEM as never);
  vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 1 } as never);
});

/** `findMany`'s `where`, which is the only place the visibility rule is enforced. */
function listWhere(): Record<string, unknown> {
  return (vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.where ?? {}) as Record<
    string,
    unknown
  >;
}

describe("GET /items", () => {
  it("defaults to page 1 / limit 20 and only ever lists ACTIVE items", async () => {
    const res = await request(app).get("/items");

    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.item.findMany).mock.calls[0]?.[0];
    expect(args?.skip).toBe(0);
    expect(args?.take).toBe(20);
    expect(args?.orderBy).toEqual({ registeredAt: "desc" });
    // F7.2 — a disposed item disappears from the default listing. This is the
    // route-level half of the exit criterion; services/itemVisibility.test.ts
    // covers the rule itself.
    expect(listWhere().status).toBe("ACTIVE");
    // Counted with the identical filter, or the page total describes a
    // different result set than the page.
    expect(vi.mocked(prisma.item.count).mock.calls[0]?.[0]?.where).toEqual(listWhere());
  });

  it("clamps limit to 100 and floors page at 1", async () => {
    await request(app).get("/items?page=0&limit=5000");
    expect(vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.take).toBe(100);
    expect(vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.skip).toBe(0);

    vi.clearAllMocks();
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.item.count).mockResolvedValue(0 as never);
    await request(app).get("/items?page=3&limit=10");
    expect(vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.skip).toBe(20);
  });

  it("turns search, categoryId and department into filters", async () => {
    await request(app).get("/items?search=laptop&categoryId=cat-electronics&department=Computer");

    const where = listWhere();
    expect(where.OR).toEqual([
      { name: { contains: "laptop", mode: "insensitive" } },
      { tagId: { contains: "laptop", mode: "insensitive" } },
    ]);
    expect(where.categoryId).toBe("cat-electronics");
    expect(where.department).toEqual({ contains: "Computer", mode: "insensitive" });
    expect(where.status).toBe("ACTIVE");
  });

  it("cannot be talked into listing disposed items from the query string", async () => {
    // `?status=DISPOSED` is not a supported filter, so it should be ignored
    // rather than honoured — and even if a later change starts reading it, the
    // pin in activeItemsWhere() lands last.
    await request(app).get("/items?status=DISPOSED");
    expect(listWhere().status).toBe("ACTIVE");
  });

  it("strips restricted fields for a guest and keeps them for staff (SDS 3.2)", async () => {
    const guest = await request(app).get("/items");
    for (const field of STRIPPED_FOR_PUBLIC) {
      expect(guest.body.data[0]).not.toHaveProperty(field);
    }
    // The acceptance criterion is about values, not key names: a guest must not
    // be able to read the cost or the custodian's name off the wire at all.
    expect(JSON.stringify(guest.body)).not.toContain("45000");
    expect(JSON.stringify(guest.body)).not.toContain("Demo Staff");
    // What the public does see, per SRS 3.4 — including the photo.
    expect(guest.body.data[0]).toMatchObject({
      tagId: "CNCS-DEMO-0001",
      name: "Dell Latitude Laptop",
      department: "Computer Science",
      room: "312",
      condition: "GOOD",
      photoUrl: "https://example.com/laptop.jpg",
    });
    expect(guest.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });

    const staff = await request(app).get("/items").set("Authorization", `Bearer ${staffToken}`);
    expect(staff.body.data[0].purchaseCost).toBe(45000);
    expect(staff.body.data[0].owner.fullName).toBe("Demo Staff");
    expect(JSON.stringify(staff.body)).not.toContain("passwordHash");
  });
});

describe("GET /items/:tagId", () => {
  it("404s an unknown tag", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(null as never);
    const res = await request(app).get("/items/CNCS-NOPE");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
  });

  it("gives a guest the public view and staff the whole row", async () => {
    const guest = await request(app).get("/items/CNCS-DEMO-0001");

    expect(guest.status).toBe(200);
    expect(vi.mocked(prisma.item.findUnique).mock.calls[0]?.[0]?.where).toEqual({
      tagId: "CNCS-DEMO-0001",
    });
    for (const field of STRIPPED_FOR_PUBLIC) {
      expect(guest.body).not.toHaveProperty(field);
    }
    // `accessories` is restricted too, and the include means it would otherwise
    // be on the response object.
    expect(guest.body).not.toHaveProperty("accessories");
    expect(JSON.stringify(guest.body)).not.toContain("SN-998822");

    const staff = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(staff.body.serialNumber).toBe("SN-998822");
    expect(JSON.stringify(staff.body)).not.toContain("passwordHash");
  });

  it("answers a disposed tag with F7.3's sentence and nothing else", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      status: "DISPOSED",
      disposalReason: "Beyond repair after the power surge",
      disposedAt: new Date("2026-09-02T10:00:00.000Z"),
    } as never);

    const res = await request(app).get("/items/CNCS-DEMO-0001");

    expect(res.status).toBe(410);
    // "nothing else" is the operative phrase: no tagId, no name, no reason.
    expect(res.body).toEqual({ error: "This item is no longer in service" });
    expect(JSON.stringify(res.body)).not.toContain("Beyond repair");
    expect(JSON.stringify(res.body)).not.toContain("CNCS-DEMO-0001");
  });

  it("still returns the record to an admin scanning a disposed tag (F7.2)", async () => {
    // F7.2 keeps a disposed item "queryable in reports/history" and SRS 3.4
    // gives Staff/Admin every field, so the 410 is a rule about the viewer, not
    // about the row. An admin who scanned a disposed tag needs to see what
    // happened to it.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      status: "DISPOSED",
      disposalReason: "Beyond repair after the power surge",
    } as never);

    const res = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DISPOSED");
    expect(res.body.disposalReason).toBe("Beyond repair after the power surge");
  });
});

const CATEGORY_UUID = "11111111-1111-4111-8111-111111111111";
const OWNER_UUID = "22222222-2222-4222-8222-222222222222";

const VALID_CREATE = {
  name: "Dell Latitude Laptop",
  categoryId: CATEGORY_UUID,
  department: "Computer Science",
  building: "CNCS Building",
  floor: "3",
  room: "312",
  ownerId: OWNER_UUID,
  purchaseCost: 45000,
  condition: "GOOD",
};

describe("POST /items", () => {
  beforeEach(() => {
    vi.mocked(prisma.item.create).mockResolvedValue(FULL_ITEM as never);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/items").send(VALID_CREATE);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
    expect(prisma.item.create).not.toHaveBeenCalled();
  });

  it("creates an item and generates a CNCS- tag id", async () => {
    const res = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(VALID_CREATE);

    expect(res.status).toBe(201);
    const data = vi.mocked(prisma.item.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    // 8 hex characters from crypto.randomBytes(4) — asserted by shape, since the
    // value is random by design.
    expect(data.tagId).toMatch(/^CNCS-[0-9A-F]{8}$/);
    expect(data.name).toBe("Dell Latitude Laptop");
    // Absent optional columns are written as an explicit null rather than left
    // undefined, so the row is fully specified from creation.
    expect(data.currentValue).toBeNull();
  });

  it("rejects a missing required field and an unknown condition", async () => {
    const { room, ...noRoom } = VALID_CREATE;
    expect(room).toBe("312");
    const missing = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(noRoom);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("Validation failed");
    expect(Array.isArray(missing.body.details)).toBe(true);

    const badEnum = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ ...VALID_CREATE, condition: "SLIGHTLY_BENT" });
    expect(badEnum.status).toBe(400);
    expect(prisma.item.create).not.toHaveBeenCalled();
  });

  it("retries a tag-id collision instead of blaming the caller", async () => {
    // `tagId` is @unique and generated from 4 random bytes, so a registry of a
    // few thousand items will eventually draw the same one twice. The caller
    // never supplied the value and can do nothing about it, so a P2002 here has
    // to be absorbed, not returned.
    const collision = Object.assign(new Error("Unique constraint failed"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["tagId"] },
    });
    vi.mocked(prisma.item.create)
      .mockRejectedValueOnce(collision as never)
      .mockResolvedValueOnce(FULL_ITEM as never);

    const res = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(VALID_CREATE);

    expect(res.status).toBe(201);
    expect(prisma.item.create).toHaveBeenCalledTimes(2);
    const first = vi.mocked(prisma.item.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    const second = vi.mocked(prisma.item.create).mock.calls[1]?.[0]?.data as Record<
      string,
      unknown
    >;
    // A retry with the same tag would collide forever.
    expect(first.tagId).not.toBe(second.tagId);
  });

  it("does not swallow a collision on some other unique column", async () => {
    const other = Object.assign(new Error("Unique constraint failed"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["serialNumber"] },
    });
    vi.mocked(prisma.item.create).mockRejectedValue(other as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(VALID_CREATE);

    // Straight to the error handler, which maps P2002 to 409 — retrying would
    // just repeat the same failure four more times.
    expect(res.status).toBe(409);
    expect(prisma.item.create).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it("refuses parentItemId and says where the field lives", async () => {
    // Rejected loudly rather than stripped silently: the bundle rules (no
    // self-parenting, no cycles, max depth 2) live on the accessories route, and
    // a second unguarded writer to this column would let a three-deep chain form,
    // which the single-level approval cascade then half-moves.
    const res = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ ...VALID_CREATE, parentItemId: "item-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("POST /items/:id/accessories");
    expect(prisma.item.create).not.toHaveBeenCalled();
  });
});

/** The rows handed to `createMany`, i.e. what actually reaches ItemEditLog. */
function loggedRows(): Array<Record<string, unknown>> {
  const call = vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0];
  return (call?.data ?? []) as Array<Record<string, unknown>>;
}

describe("PUT /items/:id", () => {
  it("requires authentication", async () => {
    const res = await request(app).put("/items/item-1").send({ condition: "FAIR" });
    expect(res.status).toBe(401);
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("404s an unknown item", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(null as never);
    const res = await request(app)
      .put("/items/item-ghost")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("409s on a disposed item without writing anything (F7.2 — disposal is terminal)", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      status: "DISPOSED",
    } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Item is already disposed" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("refuses parentItemId here as well", async () => {
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ parentItemId: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "parentItemId cannot be set here — use POST /items/:id/accessories to link an accessory"
    );
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("writes one edit-log row per changed field and none for a no-op", async () => {
    // `name` is sent unchanged. SRS F2.3 wants a trail of what changed, so a
    // field that was submitted but is identical must not produce a row — that is
    // the difference between an audit trail and noise.
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR", notes: "Repaired", name: FULL_ITEM.name });

    expect(res.status).toBe(200);
    const rows = loggedRows();
    expect(rows.map((row) => row.fieldChanged).sort()).toEqual(["condition", "notes"]);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: "item-1",
          editedById: "staff-1",
          fieldChanged: "notes",
          oldValue: "Screen replaced in 2025",
          newValue: "Repaired",
        }),
        expect.objectContaining({ fieldChanged: "condition", oldValue: "GOOD", newValue: "FAIR" }),
      ])
    );
    // One timestamp for the whole edit, passed in rather than left to
    // @default(now()), so Phase 3 can group the rows of a single change.
    const stamps = new Set(rows.map((row) => String(row.editedAt)));
    expect(stamps.size).toBe(1);
  });

  it("guards the write with a compare-and-swap on status, before logging", async () => {
    await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR" });

    // The findUnique check above can go stale: a DISPOSAL approval committing in
    // between must not be overwritten. `where` carries the guard.
    expect(vi.mocked(prisma.item.updateMany).mock.calls[0]?.[0]?.where).toEqual({
      id: "item-1",
      status: "ACTIVE",
    });
    const updateOrder = vi.mocked(prisma.item.updateMany).mock.invocationCallOrder[0] ?? -1;
    const logOrder = vi.mocked(prisma.itemEditLog.createMany).mock.invocationCallOrder[0] ?? -1;
    expect(updateOrder).toBeGreaterThan(0);
    expect(updateOrder).toBeLessThan(logOrder);
  });

  it("409s and logs nothing when the compare-and-swap loses the race", async () => {
    vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 0 } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Item is already disposed" });
    // Thrown inside the transaction, so the item write is rolled back too — the
    // assertion that matters is that no history row claims a change happened.
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("treats an empty body as a no-op and touches nothing", async () => {
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.tagId).toBe("CNCS-DEMO-0001");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  /**
   * The transfer-only columns. A move or a reassignment is an approved TRANSFER
   * request (SRS F6), so this endpoint must not be a second writer of the fields
   * the approval flow exists to govern. The edit log recording the change was never
   * the objection: logging a bypass does not turn it into an approval, and the
   * register's answer to "where is it, and whose is it?" was only as trustworthy as
   * the last person to type in the form.
   */
  it.each([
    ["room", { room: "101" }],
    ["building", { building: "New Block" }],
    ["floor", { floor: "1" }],
    ["ownerId", { ownerId: OWNER_UUID }],
  ])("refuses a %s change and points at the transfer flow", async (field, body) => {
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("TRANSFER request");
    // Named, so a caller editing three fields learns which one is the problem.
    expect(res.body.fields).toEqual([field]);
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("refuses a move for an admin too — approval is the rule, not the role", async () => {
    // Deliberately not role-scoped. Staff-only gating would have closed the
    // reported hole and left the rule itself half-enforced; the requirement is
    // that the move is approved, not that Staff cannot make it.
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ room: "101" });

    expect(res.status).toBe(400);
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("accepts the location resubmitted unchanged, which is what the edit form sends", async () => {
    // The form loads every field and submits them all back, read-only ones
    // included, so refusing on *presence* would have made the form unsavable.
    // Only an actual change is a move — this is the case that proves it, and it is
    // the reason the gate compares against the stored row instead of scanning the
    // body for the field names.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      ownerId: OWNER_UUID,
    } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        building: FULL_ITEM.building,
        floor: FULL_ITEM.floor,
        room: FULL_ITEM.room,
        ownerId: OWNER_UUID,
        condition: "FAIR",
      });

    expect(res.status).toBe(200);
    expect(loggedRows().map((row) => row.fieldChanged)).toEqual(["condition"]);
  });

  it("refuses an edit that mixes a legitimate change with a move, writing nothing", async () => {
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR", room: "101" });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(["room"]);
    // Refused whole rather than half-applied: no edit-log row may claim the
    // condition changed when the save as a whole did not happen.
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("400s a dangling categoryId instead of surfacing a 500", async () => {
    // `Item.categoryId` is a real foreign key, so Prisma would raise P2003 and the
    // caller would read "Internal server error" for what is plainly a bad request.
    // (`ownerId` needs no equivalent check any more: changing it is refused above
    // as a transfer, before any lookup.)
    vi.mocked(prisma.category.findMany).mockResolvedValue([] as never);
    const category = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ categoryId: CATEGORY_UUID });

    expect(category.status).toBe(400);
    expect(category.body).toEqual({ error: "categoryId does not match an existing category" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("skips the label lookups when no foreign key is changing", async () => {
    // The stored owner has to be a real uuid, or the request never gets far enough
    // for "no lookup happened" to mean anything.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      ownerId: OWNER_UUID,
    } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR", ownerId: OWNER_UUID });

    // `ownerId` is present but unchanged, so it is not a transfer and there is
    // nothing to expand — the common edit costs no extra queries.
    expect(res.status).toBe(200);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.category.findMany).not.toHaveBeenCalled();
  });
});

describe("mount paths", () => {
  it("serves the same handler under /items and /api/v1/items", async () => {
    const bare = await request(app).get("/items");
    const versioned = await request(app).get("/api/v1/items");

    expect(bare.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(versioned.body).toEqual(bare.body);
  });

  it("does not shadow the two-segment item routes", async () => {
    // `GET /:tagId` is a single-segment pattern and itemsRouter is mounted last,
    // so /items/:id/history still belongs to itemHistoryRouter. If this breaks,
    // a tag lookup is answering history requests.
    const res = await request(app).get("/items/item-1/history");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
  });
});

