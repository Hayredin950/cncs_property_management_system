import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createToken, makeItem } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/** Hoisted above the imports, so it cannot reference them — see requests.test.ts. */
vi.mock("../lib/prisma.js", () => {
  const client = {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
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
    custodyEvent: { create: vi.fn() },
    orgUnit: { findUnique: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown, _opts?: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const staffToken = createToken({ id: "staff-1", role: "STAFF" });
const otherStaffToken = createToken({ id: "staff-2", role: "STAFF" });
const headCsToken = createToken({ id: "head-cs", role: "DEPARTMENT_HEAD", orgUnitId: "org-unit-cs" });
const headBioToken = createToken({ id: "head-bio", role: "DEPARTMENT_HEAD", orgUnitId: "org-unit-bio" });
const officerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });

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

const officerAuth = { Authorization: `Bearer ${officerToken}` };

describe("GET /items", () => {
  /**
   * §10.1 of the design doc. This endpoint used to answer a caller with no token —
   * and, worse, a caller with an *expired* token — with the whole register, because
   * `optionalAuthenticate` demoted a bad token to "guest" and the guest branch had
   * no scope filter. Both cases are pinned here so neither can come back silently.
   */
  it("refuses an anonymous caller instead of listing the register", async () => {
    const res = await request(app).get("/items");

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("data");
    expect(prisma.item.findMany).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid or expired token", async () => {
    const res = await request(app)
      .get("/items")
      .set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("data");
    expect(prisma.item.findMany).not.toHaveBeenCalled();
  });

  /**
   * The exact URL from the 14 Oct report — an anonymous browser at
   * `/items?mine=true`. `mine` narrows a listing; it never authenticates one. The
   * route requires a token before the query string is read at all, so this must
   * 401 like the bare path. Pinned separately because a later reader could
   * plausibly read `mine` as "the signed-in owner's view" and reach for it to
   * allow a public call.
   */
  it("refuses an anonymous /items?mine=true rather than reading mine as public", async () => {
    const res = await request(app).get("/items?mine=true");

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("data");
    expect(prisma.item.findMany).not.toHaveBeenCalled();
  });

  /**
   * "My Items" is a narrowing on top of the role scope, not a replacement for it:
   * both terms appear in `AND`, so the request cannot escape the scope by asking
   * for its own rows.
   */
  it("narrows /items?mine=true on top of the role scope, not instead of it", async () => {
    await request(app).get("/items?mine=true").set("Authorization", `Bearer ${staffToken}`);

    expect(listWhere().AND).toEqual([
      { OR: [{ holderType: "STAFF", holderId: "staff-1" }, { ownerId: "staff-1" }] },
      { OR: [{ ownerId: "staff-1" }, { holderType: "STAFF", holderId: "staff-1" }] },
    ]);
  });

  /**
   * Regression: `mine` used to overwrite `filters.OR`, so a search typed inside My
   * Items silently dropped the query and answered with the whole list. Search and
   * mine now compose — the search stays an `OR`, and mine joins the `AND` terms.
   */
  it("keeps a search alongside /items?mine=true instead of mine replacing it", async () => {
    await request(app)
      .get("/items?search=laptop&mine=true")
      .set("Authorization", `Bearer ${staffToken}`);

    const where = listWhere();
    expect(where.OR).toEqual([
      { name: { contains: "laptop", mode: "insensitive" } },
      { tagId: { contains: "laptop", mode: "insensitive" } },
    ]);
    expect(where.AND).toEqual([
      { OR: [{ holderType: "STAFF", holderId: "staff-1" }, { ownerId: "staff-1" }] },
      { OR: [{ ownerId: "staff-1" }, { holderType: "STAFF", holderId: "staff-1" }] },
    ]);
    expect(where.status).toEqual({ notIn: ["DISPOSED", "VOIDED", "LOST"] });
  });

  it("defaults to page 1 / limit 20 and never lists an out-of-service item", async () => {
    const res = await request(app).get("/items").set(officerAuth);

    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.item.findMany).mock.calls[0]?.[0];
    expect(args?.skip).toBe(0);
    expect(args?.take).toBe(20);
    // Newest first by default, and the tag id breaks the tie so the order is
    // stable — two items registered in the same second must not swap places
    // between two pages.
    expect(args?.orderBy).toEqual([{ registeredAt: "desc" }, { tagId: "asc" }]);
    // F7.2 — the out-of-service items disappear from the default listing: the
    // disposed, the voided and the lost. The live ones stay, including the
    // item waiting for its holder to confirm it and the one out on loan, which
    // are the college's assets too. This is the route-level half of the exit
    // criterion; services/itemVisibility.test.ts covers the rule itself.
    expect(listWhere().status).toEqual({ notIn: ["DISPOSED", "VOIDED", "LOST"] });
    // Counted with the identical filter, or the page total describes a
    // different result set than the page.
    expect(vi.mocked(prisma.item.count).mock.calls[0]?.[0]?.where).toEqual(listWhere());
  });

  it("clamps limit to 100 and floors page at 1", async () => {
    await request(app).get("/items?page=0&limit=5000").set(officerAuth);
    expect(vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.take).toBe(100);
    expect(vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.skip).toBe(0);

    vi.clearAllMocks();
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.item.count).mockResolvedValue(0 as never);
    await request(app).get("/items?page=3&limit=10").set(officerAuth);
    expect(vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.skip).toBe(20);
  });

  it("turns search, categoryId and orgUnitId into filters", async () => {
    await request(app)
      .get("/items?search=laptop&categoryId=cat-electronics&orgUnitId=org-unit-cs")
      .set(officerAuth);

    const where = listWhere();
    expect(where.OR).toEqual([
      { name: { contains: "laptop", mode: "insensitive" } },
      { tagId: { contains: "laptop", mode: "insensitive" } },
    ]);
    expect(where.categoryId).toBe("cat-electronics");
    expect(where.orgUnitId).toBe("org-unit-cs");
    expect(where.status).toEqual({ notIn: ["DISPOSED", "VOIDED", "LOST"] });
  });

  it("cannot be talked into listing disposed items from the query string", async () => {
    // `?status=DISPOSED` is not a supported filter, so it should be ignored
    // rather than honoured — and even if a later change starts reading it, the
    // exclusion in activeItemsWhere() lands last.
    await request(app).get("/items?status=DISPOSED").set(officerAuth);
    expect(listWhere().status).toEqual({ notIn: ["DISPOSED", "VOIDED", "LOST"] });
  });

  /**
   * Keeps the SDS 3.2 field-visibility contract, minus the audience it used to
   * have. `staff-1` is `FULL_ITEM`'s custodian, so staff is the role that may read
   * this row in full; the *restricted* view is now what somebody in scope but not
   * a full-detail role gets — which the row-level tests below cover, because with
   * the scope check in place the only way to reach a restricted view of somebody
   * else's item is to be its department head.
   */
  it("gives the item's custodian the full row and never a password hash", async () => {
    const staff = await request(app).get("/items").set("Authorization", `Bearer ${staffToken}`);

    expect(staff.status).toBe(200);
    expect(staff.body.data[0].purchaseCost).toBe(45000);
    expect(staff.body.data[0].owner.fullName).toBe("Demo Staff");
    expect(JSON.stringify(staff.body)).not.toContain("passwordHash");
    expect(staff.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it("scopes the listing by role instead of returning everybody's rows", async () => {
    await request(app).get("/items").set("Authorization", `Bearer ${staffToken}`);
    // A staff member's window is the items they hold — expressed as an AND term so
    // it composes with the search filter rather than replacing it.
    expect(listWhere().AND).toEqual([
      { OR: [{ ownerId: "staff-1" }, { holderType: "STAFF", holderId: "staff-1" }] },
    ]);

    vi.clearAllMocks();
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.item.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "admin-1",
      role: "SYSTEM_ADMIN",
      tokenVersion: 0,
      orgUnitId: null,
      accountStatus: "ACTIVE",
    } as never);
    const adminToken = createToken({ id: "admin-1", role: "SYSTEM_ADMIN", ver: 0 });
    const admin = await request(app).get("/items").set("Authorization", `Bearer ${adminToken}`);

    // An account role sees no asset data at all — an empty `in` list, not a
    // missing clause, because a missing clause matches everything.
    expect(admin.status).toBe(200);
    expect(listWhere().AND).toEqual([{ id: { in: [] } }]);
  });

  /**
   * The direct comparison: two Department Heads of two different units hitting the
   * same endpoint. A single-head assertion ("the head is scoped") would pass for a
   * rule that scoped everyone to the same thing; comparing the two proves the second
   * head's list is a genuinely different list.
   *
   * `findMany` is mocked, so this compares the `where` the route builds — the same
   * fragment `itemInScope` evaluates for one row. The row-level half, which shows
   * which rows each head would actually receive, is `services/itemScope.test.ts`.
   */
  it("gives two Department Heads two different, unit-scoped listings", async () => {
    await request(app)
      .get("/items")
      .set(
        "Authorization",
        `Bearer ${createToken({ id: "head-cs", role: "DEPARTMENT_HEAD", orgUnitId: "org-unit-cs" })}`,
      );
    const csScope = JSON.stringify(listWhere().AND);

    vi.clearAllMocks();
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.item.count).mockResolvedValue(0 as never);
    await request(app)
      .get("/items")
      .set(
        "Authorization",
        `Bearer ${createToken({ id: "head-bio", role: "DEPARTMENT_HEAD", orgUnitId: "org-unit-bio" })}`,
      );
    const bioScope = JSON.stringify(listWhere().AND);

    // Each head's window names its own unit and not the other's...
    expect(csScope).toContain("org-unit-cs");
    expect(csScope).not.toContain("org-unit-bio");
    expect(bioScope).toContain("org-unit-bio");
    expect(bioScope).not.toContain("org-unit-cs");
    // ...so the two lists cannot be the same list.
    expect(csScope).not.toBe(bioScope);
  });
});

describe("GET /items/:tagId", () => {
  it("404s an unknown tag", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(null as never);
    const res = await request(app).get("/items/CNCS-NOPE");

    expect(res.status).toBe(401);
    expect(vi.mocked(prisma.item.findUnique)).not.toHaveBeenCalled();
  });

  it("requires authentication; a guest gets 401 and a staff member gets the restricted row", async () => {
    const guest = await request(app).get("/items/CNCS-DEMO-0001");

    expect(guest.status).toBe(401);
    expect(vi.mocked(prisma.item.findUnique)).not.toHaveBeenCalled();

    // The caller is the item's **holder**, so the full row is theirs.
    const staff = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(staff.status).toBe(200);
    expect(staff.body.tagId).toBe("CNCS-DEMO-0001");
    expect(staff.body.serialNumber).toBe("SN-998822");
    expect(JSON.stringify(staff.body)).not.toContain("passwordHash");
  });

  /**
   * §10.2 — the IDOR the audit found. The listing was scoped but this route was
   * not, so a staff member's list correctly came back empty while this route
   * answered 200 for any row whose id they could name. Out-of-scope is reported as
   * 404, never 403: a 403 confirms the tag exists.
   *
   * `FULL_ITEM` is held by `staff-1` in `org-unit-cs`.
   */
  it("404s a row the caller may not see at all instead of serving it", async () => {
    // An item held by a **staff member** of another department. The register
    // is the college's, so it opens — field-filtered, so the colleague's
    // serial number is not in the answer.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      ownerId: "staff-2",
      holderType: "STAFF",
      holderId: "staff-2",
      owner: { id: "staff-2", fullName: "Somebody Else", email: "other@cncs.aau.edu.et" },
      orgUnitId: "org-unit-bio",
    } as never);

    // A staff member naming an item in another department's **pool**. The register is the
    // college's and the browse list shows them all, so opening one by tag has
    // to agree with the list — but the row is field-filtered, and the answer
    // is never the colleague's serial number. (The 404 below is for a row in
    // **another department's pool**, which is not a catalogue.)
    const otherStaff = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${createToken({ id: "staff-9", role: "STAFF" })}`);
    expect(otherStaff.status).toBe(200);
    // The whole record: the register is the college's, and a person looking
    // for something to request needs the serial number and the price.
    expect(otherStaff.body.serialNumber).toBe("SN-998822");
    expect(otherStaff.body.purchaseCost).toBe(45000);

    // Another department's **pool** is part of the register the list shows, so
    // it opens too — the 26 Oct device pass found the contradiction: a CS head
    // saw 7 Physics rows and every one answered "not assigned to you". The row
    // is read-only (the PUT test below still refuses it), and history stays
    // with the people who answer for the asset.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      ownerId: "staff-2",
      holderType: "DEPARTMENT",
      holderId: "org-unit-bio",
      owner: { id: "staff-2", fullName: "Somebody Else", email: "other@cncs.aau.edu.et" },
      orgUnitId: "org-unit-bio",
    } as never);

    const pooled = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${createToken({ id: "staff-9", role: "STAFF" })}`);
    expect(pooled.status).toBe(200);
    expect(pooled.body.name).toBe(FULL_ITEM.name);

    // An account role sees no asset data, by the same rule as the listing.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "admin-1",
      role: "SYSTEM_ADMIN",
      tokenVersion: 0,
      orgUnitId: null,
      accountStatus: "ACTIVE",
    } as never);
    const admin = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${createToken({ id: "admin-1", role: "SYSTEM_ADMIN", ver: 0 })}`);
    expect(admin.status).toBe(404);

    // A head from another unit may open it too — the register is the college's
    // — and gets the **operational detail**: the photo, the location, the
    // condition, the make and model. What they do not get is the money.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      ownerId: "staff-2",
      holderType: "STAFF",
      holderId: "staff-2",
      owner: { id: "staff-2", fullName: "Somebody Else", email: "other@cncs.aau.edu.et" },
      orgUnitId: "org-unit-bio",
    } as never);

    const otherHead = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set(
        "Authorization",
        `Bearer ${createToken({ id: "head-chem", role: "DEPARTMENT_HEAD", orgUnitId: "org-unit-chem" })}`,
      );
    expect(otherHead.status).toBe(200);
    expect(otherHead.body).toHaveProperty("id");
    expect(otherHead.body).toHaveProperty("tagId");
    expect(otherHead.body).toHaveProperty("name");
    expect(otherHead.body).toHaveProperty("category");
    expect(otherHead.body).toHaveProperty("status");
    expect(otherHead.body).toHaveProperty("orgUnitId");
    // The operational detail a head needs to see where the thing is.
    expect(otherHead.body).toHaveProperty("floor");
    expect(otherHead.body).toHaveProperty("room");
    // The whole record, like everybody else: the register is the college's.
    // What a head does **not** get for another department's item is the change
    // history - the trail of who changed what - and that is gated on its own
    // endpoint, not here.
    expect(otherHead.body).toHaveProperty("purchaseCost");
    expect(otherHead.body).toHaveProperty("currentValue");
    expect(otherHead.body).toHaveProperty("owner");
  });

  it("still serves a row the caller holds, and every row to an officer", async () => {
    // The custodian: `FULL_ITEM` is held by staff-1.
    const owner = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(owner.status).toBe(200);
    expect(owner.body.tagId).toBe("CNCS-DEMO-0001");

    // The college-wide roles are unrestricted, by design.
    const officer = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${officerToken}`);
    expect(officer.status).toBe(200);

    // The head of the item's own unit.
    const ownHead = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set(
        "Authorization",
        `Bearer ${createToken({ id: "head-cs", role: "DEPARTMENT_HEAD", orgUnitId: "org-unit-cs" })}`,
      );
    expect(ownHead.status).toBe(200);
  });

  it("answers a disposed tag with 401 for guest; staff gets 410 for public view", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      status: "DISPOSED",
      disposalReason: "Beyond repair after the power surge",
      disposedAt: new Date("2026-09-02T10:00:00.000Z"),
    } as never);

    const guest = await request(app).get("/items/CNCS-DEMO-0001");
    expect(guest.status).toBe(401);

    // For staff, the item exists but is disposed - they get the record
    const staff = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${officerToken}`);
    expect(staff.status).toBe(200);
    expect(staff.body.status).toBe("DISPOSED");
    expect(staff.body.disposalReason).toBe("Beyond repair after the power surge");
  });

  it("still returns the record to staff scanning a disposed tag (F7.2)", async () => {
    // F7.2 keeps a disposed item "queryable in reports/history" and SRS 3.4
    // gives Staff/Admin every field. A staff who scanned a disposed tag needs
    // to see what happened to it.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      status: "DISPOSED",
      disposalReason: "Beyond repair after the power surge",
    } as never);

    const res = await request(app)
      .get("/items/CNCS-DEMO-0001")
      .set("Authorization", `Bearer ${officerToken}`);

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
  orgUnitId: "org-unit-cs",
  buildingId: "building-cncs",
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
      .set("Authorization", `Bearer ${officerToken}`)
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

    // The holder pair (spec 4.1) is derived from the custodian the form sent, not
    // from a second input, so the two cannot name different people.
    expect(data.holderType).toBe("STAFF");
    expect(data.holderId).toBe(OWNER_UUID);

    // And the item's history starts at creation: one CREATED event, nested so it is
    // written by the same statement as the row itself.
    expect(data.custodyEvents).toEqual({
      create: {
        eventType: "CREATED",
        fromHolderType: "COLLEGE",
        fromHolderId: null,
        toHolderType: "STAFF",
        toHolderId: OWNER_UUID,
        actingUserId: "officer-1",
        reason: null,
        departmentHeadSnapshot: null,
      },
    });
  });

  it("rejects a missing required field and an unknown condition", async () => {
    const { room, ...noRoom } = VALID_CREATE;
    expect(room).toBe("312");
    const missing = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${officerToken}`)
      .send(noRoom);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("Validation failed");
    expect(Array.isArray(missing.body.details)).toBe(true);

    const badEnum = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${officerToken}`)
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
      .set("Authorization", `Bearer ${officerToken}`)
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
      .set("Authorization", `Bearer ${officerToken}`)
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
      .set("Authorization", `Bearer ${officerToken}`)
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

  /**
   * The scope half of the edit rule. The field-level rule (identity/financial
   * fields belong to the Property Officer) was enforced; the row-level rule was
   * not, so any staff member could edit the condition and notes of anybody's
   * item — including another department's. These pin the rule the clients now
   * mirror.
   */
  it("refuses a staff member editing a colleague's item", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      ownerId: "staff-2",
      holderType: "STAFF",
      holderId: "staff-2",
    } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("own custody");
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("lets a staff member edit the item they hold", async () => {
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR" });

    expect(res.status).toBe(200);
    expect(prisma.item.updateMany).toHaveBeenCalled();
  });

  it("refuses a head editing another department's item", async () => {
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${headBioToken}`)
      .send({ condition: "FAIR" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("own custody");
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("lets a head edit an item in their own department", async () => {
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${headCsToken}`)
      .send({ condition: "FAIR" });

    expect(res.status).toBe(200);
    expect(prisma.item.updateMany).toHaveBeenCalled();
  });

  it("refuses another department's pool through the write, while the read opens it", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      ...FULL_ITEM,
      orgUnitId: "org-unit-bio",
      holderType: "DEPARTMENT",
      holderId: "org-unit-bio",
    } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${headCsToken}`)
      .send({ condition: "FAIR" });

    // The row is readable (GET returns 200 above), so pretending it does not
    // exist would be a lie to someone looking at it. It is not editable: the
    // capability says what a head may do, the row scope says which rows.
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("own custody");
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

  it("edits a row whose version has moved on when the client sends no version", async () => {
    // Both clients omit `version` (the web form and the phone send only the
    // fields they may change). The schema used to default it to 0, so this
    // ordinary save was answered 409 "modified by another user" on every row
    // that had ever been edited. A missing version means "no check", not "zero".
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ ...FULL_ITEM, version: 7 } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR", notes: "Repaired" });

    expect(res.status).toBe(200);
    expect(prisma.item.updateMany).toHaveBeenCalled();
  });

  it("still refuses a version that does not match the row", async () => {
    // The lock must still work when a client *does* opt in by sending what it
    // read: a stale value is a real conflict.
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ ...FULL_ITEM, version: 7 } as never);

    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ condition: "FAIR", version: 6 });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("modified by another user");
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
      version: 0,
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
    expect(res.body).toEqual({ error: "Item is already disposed or was modified" });
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
    ["buildingId", { buildingId: "new-building-id" }],
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
      .set("Authorization", `Bearer ${officerToken}`)
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

    // A head, not a staff member: the point is unchanged fields being accepted,
    // and the row has to be in the caller's own edit scope now that PUT enforces
    // it (see the "whose item" tests below).
    const res = await request(app)
      .put("/items/item-1")
      .set("Authorization", `Bearer ${headCsToken}`)
      .send({
        buildingId: FULL_ITEM.buildingId,
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
      .set("Authorization", `Bearer ${officerToken}`)
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
      .set("Authorization", `Bearer ${headCsToken}`)
      .send({ condition: "FAIR", ownerId: OWNER_UUID });

    // `ownerId` is present but unchanged, so it is not a transfer and there is
    // nothing to expand — the common edit costs no extra queries. A head, because
    // the stored owner is not the staff caller and PUT now enforces edit scope.
    expect(res.status).toBe(200);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.category.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /items/:id/refuse-claim", () => {
  /**
   * The refusal contract (workflow-completeness-spec §6): a reason **from a
   * fixed set**, plus free text. The web and mobile forms used to send their
   * textarea straight through as `reason`, which the schema rejected with a
   * 400 — and because the screen test mocked the endpoint, nothing noticed. A
   * refusal in the app therefore never reached the server. These tests pin the
   * wire contract the clients now send.
   */
  const pending = () => ({
    ...FULL_ITEM,
    status: "PENDING_CLAIM",
    holderType: "STAFF",
    holderId: "staff-1",
    orgUnitId: null,
    claimDueAt: new Date("2026-10-30T00:00:00.000Z"),
  });

  beforeEach(() => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(pending() as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "event-1" } as never);
  });

  it("refuses a free-text reason: the code has to come from the fixed set", async () => {
    const res = await request(app)
      .post("/items/item-1/refuse-claim")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ reason: "The handover never happened." });

    expect(res.status).toBe(400);
    expect(prisma.item.update).not.toHaveBeenCalled();
  });

  it("returns the item to the college pool and records the refusal", async () => {
    const res = await request(app)
      .post("/items/item-1/refuse-claim")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ reason: "NEVER_RECEIVED" });

    expect(res.status).toBe(200);
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { holderType: "COLLEGE", holderId: null, claimDueAt: null },
    });
    const event = vi.mocked(prisma.custodyEvent.create).mock.calls[0]?.[0] as {
      data: { eventType: string; reason: string };
    };
    expect(event.data.eventType).toBe("CLAIM_REFUSED");
    expect(event.data.reason).toBe("NEVER_RECEIVED");
  });

  it("keeps the free text beside an OTHER refusal, and requires it", async () => {
    const missing = await request(app)
      .post("/items/item-1/refuse-claim")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ reason: "OTHER" });
    expect(missing.status).toBe(400);

    const res = await request(app)
      .post("/items/item-1/refuse-claim")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ reason: "OTHER", otherReason: "It went to the wrong building." });

    expect(res.status).toBe(200);
    const event = vi.mocked(prisma.custodyEvent.create).mock.calls.at(-1)?.[0] as {
      data: { reason: string };
    };
    expect(event.data.reason).toBe("OTHER: It went to the wrong building.");
  });
});

describe("mount paths", () => {
  it("serves the same handler under /items and /api/v1/items", async () => {
    const bare = await request(app).get("/items").set(officerAuth);
    const versioned = await request(app).get("/api/v1/items").set(officerAuth);

    expect(bare.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(versioned.body).toEqual(bare.body);
  });

  /**
   * `GET /recent` and `GET /held-by-me` are single-segment literals declared *above*
   * `GET /:tagId`. Below it, Express matched the param route with
   * `tagId === "recent"` / `"held-by-me"`, and since no item carries those tag ids
   * the app answered 404 to both dashboard tiles, which render a 404 as "no data".
   *
   * The assertion that proves the ordering is the *negative* one: `/items/:tagId`
   * is the only handler that calls `item.findUnique`, so "it was never called"
   * means the literal path reached its own handler.
   */
  it("answers /items/recent and /items/held-by-me instead of letting /:tagId swallow them", async () => {
    vi.mocked(prisma.item.count).mockResolvedValue(0 as never);

    const recent = await request(app).get("/items/recent?limit=5").set(officerAuth);
    const held = await request(app).get("/items/held-by-me?summary=true").set(officerAuth);

    expect(recent.status).toBe(200);
    expect(held.status).toBe(200);
    // The summary says how many are held *and* how many are waiting for the
    // holder to confirm them: the second number is the one with a deadline.
    expect(held.body).toEqual({ count: 0, awaitingConfirmation: 0 });
    expect(prisma.item.findUnique).not.toHaveBeenCalled();
    // …and the literal path was handled with its own query, not a tag lookup that
    // happens to be spelled "recent".
    expect(vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.take).toBe(5);
  });

  /**
   * The "recently registered" tile answers for whoever may read the register.
   *
   * It used to need `ITEM_READ_ALL`, which a staff member does not hold — so
   * the tile on the phone asked a staff member's dashboard for three rows of a
   * register they are allowed to read, and was told 403. The scope rules do
   * the limiting; the capability never was about this question.
   */
  it("answers /items/recent for a staff member, scoped to their own holdings", async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);

    const res = await request(app)
      .get("/items/recent")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    const where = vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toEqual({
      status: "ACTIVE",
      OR: [{ ownerId: "staff-1" }, { holderType: "STAFF", holderId: "staff-1" }],
    });
  });

  it("lets a staff member ask for the whole college's recent registrations", async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);

    const res = await request(app)
      .get("/items/recent?scope=all")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    const where = vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toEqual({ status: "ACTIVE" });
  });

  it("shows the system administrator nothing, because it sees no asset data", async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);

    const res = await request(app)
      .get("/items/recent")
      .set("Authorization", `Bearer ${createToken({ id: "admin-1", role: "SYSTEM_ADMIN" })}`);

    expect(res.status).toBe(200);
    const where = vi.mocked(prisma.item.findMany).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toEqual({ status: "ACTIVE", id: { in: [] } });
  });

  it("does not shadow the two-segment item routes", async () => {
    // so /items/:id/history still belongs to itemHistoryRouter. If this breaks,
    // a tag lookup is answering history requests.
    const res = await request(app).get("/items/item-1/history");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
  });
});

