import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  createToken,
  makeItem,
  makeOfficer,
  makeRequest,
  makeUser,
  type TestRequest,
} from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/**
 * The factory is hoisted above the imports, so it cannot reference anything
 * imported — which is why it is copy-pasted per test file while the plain builders
 * come from src/test-utils.
 *
 * `$transaction` hands the SAME client object to the callback as `tx`. That means
 * `expect(prisma.request.updateMany).toHaveBeenCalledWith(...)` reads identically
 * whether the call happened inside the transaction or outside it, and no test ever
 * has to reason about two client identities.
 */
vi.mock("../lib/prisma.js", () => {
  const client = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    item: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    request: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    itemEditLog: { createMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    custodyEvent: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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
const officerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });

const TRANSFER_BODY = {
  type: "TRANSFER",
  itemId: "item-1",
  reason: "Moving to the new staff office",
  newLocationFloor: "1",
  newLocationRoom: "101",
};

beforeEach(() => {
  // Use clearAllMocks (not resetAllMocks) to clear call history but preserve
  // mock implementations. resetAllMocks would wipe the vi.mock("../lib/prisma.js")
  // factory, breaking all prisma mocks.
  vi.clearAllMocks();

  // Re-setup the $transaction mock after clearing, since clearAllMocks
  // clears call history but preserves the mock implementation.
  vi.mocked(prisma.$transaction).mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? await (arg as (tx: unknown) => Promise<unknown>)(vi.mocked(prisma))
      : await Promise.all(arg as Promise<unknown>[]));
});

/** Nothing was written anywhere. Used by every refusal test. */
function expectNoWrites(): void {
  expect(prisma.request.create).not.toHaveBeenCalled();
  expect(prisma.request.updateMany).not.toHaveBeenCalled();
  expect(prisma.item.updateMany).not.toHaveBeenCalled();
  expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  expect(prisma.notification.create).not.toHaveBeenCalled();
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
}

/** Default happy-path mocks for `POST /requests`. */
function primeCreate(): void {
  vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
  vi.mocked(prisma.request.findFirst).mockResolvedValueOnce(null as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeUser() as never);
  vi.mocked(prisma.request.create).mockResolvedValueOnce(makeRequest() as never);
  vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
    { id: "admin-1", email: "admin@cncs.aau.edu.et", fullName: "System Admin" },
  ] as never);
  vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 1 } as never);
}

/** Default happy-path mocks for a decision on a PENDING request. */
function primeDecision(overrides: Partial<TestRequest> = {}): void {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
  vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
    makeRequest({ ...overrides, status: "PENDING" }) as never
  );
  vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
  vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
  vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
  vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);
}

/** Mocks for a stage 1 approval (PENDING -> PENDING_STAGE2). */
function primeStage1Approval(overrides: Partial<TestRequest> = {}): void {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
  vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
    makeRequest({ ...overrides, status: "PENDING" }) as never
  );
  vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
  vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 0 } as never); // No item changes on stage 1
  vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
  vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);
}

/** Mocks for a stage 2 approval (PENDING_STAGE2 -> APPROVED). */
function primeStage2Approval(overrides: Partial<TestRequest> = {}): void {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
  vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
    makeRequest({
      ...overrides,
      status: "PENDING_STAGE2",
      reviewedById: "officer-1",
      stage1ApprovedById: "officer-1",
      stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
    }) as never
  );
  vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
  vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
  vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);
}

/** Mocks for a disposal approval (single stage). */
function primeDisposalApproval(overrides: Partial<TestRequest> = {}): void {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
  vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
    makeRequest({
      ...overrides,
      type: "DISPOSAL",
      status: "PENDING",
    }) as never
  );
  vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
  vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
  vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);
}

describe("POST /requests", () => {
  it("creates a PENDING request and fans the notification out to every admin", async () => {
    primeCreate();

    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(TRANSFER_BODY);

    expect(res.status).toBe(201);
    expect(res.body.request.id).toBe("req-1");
    expect(res.body.notifiedReviewerCount).toBe(1);

    const created = vi.mocked(prisma.request.create).mock.calls[0]?.[0]?.data;
    expect(created).toMatchObject({
      type: "TRANSFER",
      status: "PENDING",
      itemId: "item-1",
      requestedById: "staff-1",
      newLocationFloor: "1",
      newLocationRoom: "101",
    });
    // Conditional spread, not `undefined`: a field the request never named is
    // absent from the payload rather than written as NULL.
    expect(created).not.toHaveProperty("newLocationBuilding");
    expect(created).not.toHaveProperty("newOwnerId");

    // D2 — everyone who may decide (officer and head), except the requester.
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: { in: ["PROPERTY_OFFICER", "DEPARTMENT_HEAD"] }, id: { not: "staff-1" } },
      select: { id: true, email: true, fullName: true, role: true },
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "admin-1",
          message:
            "[REQUEST_SUBMITTED] Demo Staff requested a TRANSFER for item CNCS-DEMO-0001 " +
            "(Dell Latitude Laptop) and it needs your review.",
          relatedRequestId: "req-1",
          createdAt: expect.any(Date),
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("gives the request and its notifications one shared createdAt", async () => {
    primeCreate();

    await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(TRANSFER_BODY);

    const requestCreatedAt = vi.mocked(prisma.request.create).mock.calls[0]?.[0]?.data?.createdAt;
    const notificationRows = vi.mocked(prisma.notification.createMany).mock.calls[0]?.[0]?.data as
      | Array<{ createdAt: Date }>
      | undefined;

    expect(requestCreatedAt).toBeInstanceOf(Date);
    expect(notificationRows?.[0]?.createdAt).toBe(requestCreatedAt);
  });

  it("still creates the request when no admin exists to notify", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.request.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeUser() as never);
    vi.mocked(prisma.request.create).mockResolvedValueOnce(makeRequest() as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(TRANSFER_BODY);

    expect(res.status).toBe(201);
    expect(res.body.notifiedReviewerCount).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    // A request nobody can see is an operational hazard — it must be loud.
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("req-1");

    warn.mockRestore();
  });

  it("refuses a request for an item that does not exist", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(TRANSFER_BODY);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
    expectNoWrites();
  });

  it("refuses a request against an already disposed item", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(
      makeItem({ status: "DISPOSED" }) as never,
    );

    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(TRANSFER_BODY);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Item is already disposed" });
    expectNoWrites();
  });

  it("refuses a second PENDING request for the same item (D5)", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.request.findFirst).mockResolvedValueOnce({ id: "req-0" } as never);

    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(TRANSFER_BODY);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "This item already has a pending request" });
    expect(prisma.request.findFirst).toHaveBeenCalledWith({
      where: { itemId: "item-1", status: "PENDING" },
      select: { id: true },
    });
    expectNoWrites();
  });

  it("refuses a dangling newOwnerId — the column has no foreign key", async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(makeItem() as never);
    vi.mocked(prisma.request.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ ...TRANSFER_BODY, newOwnerId: "ghost-user" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "newOwnerId does not match an existing user" });
    expectNoWrites();
  });

  it("rejects a body with no reason before touching the database", async () => {
    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ type: "TRANSFER", itemId: "item-1", newLocationRoom: "101" });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(prisma.item.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("rejects an unknown request type", async () => {
    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ ...TRANSFER_BODY, type: "LOAN" });

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toEqual(["type"]);
    expectNoWrites();
  });

  it("rejects a TRANSFER that changes neither location nor owner", async () => {
    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ type: "TRANSFER", itemId: "item-1", reason: "Moving to the new staff office" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A transfer request must change the location or the owner");
    expectNoWrites();
  });

  it("rejects a DISPOSAL that smuggles in transfer fields", async () => {
    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        type: "DISPOSAL",
        itemId: "item-1",
        reason: "Beyond economical repair after the power surge",
        newLocationRoom: "101",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A disposal request must not include transfer fields");
    expectNoWrites();
  });

  it("answers the three authentication failures with the existing strings", async () => {
    const missing = await request(app).post("/requests").send(TRANSFER_BODY);
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: "Missing or malformed Authorization header" });

    const malformed = await request(app)
      .post("/requests")
      .set("Authorization", staffToken)
      .send(TRANSFER_BODY);
    expect(malformed.status).toBe(401);
    expect(malformed.body).toEqual({ error: "Missing or malformed Authorization header" });

    const forged = await request(app)
      .post("/requests")
      .set("Authorization", "Bearer not-a-real-token")
      .send(TRANSFER_BODY);
    expect(forged.status).toBe(401);
    expect(forged.body).toEqual({ error: "Invalid or expired token" });

    expectNoWrites();
  });
});

describe("GET /requests", () => {
  beforeEach(() => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([makeRequest()] as never);
    vi.mocked(prisma.request.count).mockResolvedValue(1 as never);
  });

  it("scopes a staff member to their own requests", async () => {
    const res = await request(app).get("/requests").set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const where = vi.mocked(prisma.request.findMany).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    // Their own requests, plus the ones they were asked about — a reviewer who
    // was notified must be able to open what they were notified about.
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { requestedById: "staff-1" },
        { stage1ApprovedById: "staff-1" },
        { stage2ApprovedById: "staff-1" },
        { reviewedById: "staff-1" },
      ]),
    );
    // The default window is **all time**. It was "this-week" until 20 Oct 2026,
    // and the web client hid the difference by always sending an explicit
    // window — but the mobile client sends none, so on mobile a staff
    // member's requests from last week did not exist in the app at all. A
    // default that hides a person's own history is not a default.
    expect(where.createdAt).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("still honours an explicit window", async () => {
    const res = await request(app)
      .get("/requests?window=this-month")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    const where = vi.mocked(prisma.request.findMany).mock.calls[0]?.[0]?.where as {
      createdAt?: { gte?: Date; lte?: Date };
    };
    // A bounded range, asserted as a range rather than an exact pair of dates
    // so the test does not break on a Monday.
    expect(where.createdAt?.gte).toBeInstanceOf(Date);
    expect(where.createdAt?.lte).toBeInstanceOf(Date);
  });

  it("gives a reviewer the unscoped queue, pending first", async () => {
    const res = await request(app).get("/requests").set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.request.findMany).mock.calls[0]?.[0];
    // A PROPERTY_OFFICER holds REQUEST_READ_ALL, so the scope adds no owner filter.
    expect((args?.where as Record<string, unknown>)?.requestedById).toBeUndefined();
    // RequestStatus is declared PENDING, APPROVED, REJECTED — ascending puts the
    // queue in the order a reviewer wants it.
    expect(args?.orderBy).toEqual([{ status: "asc" }, { createdAt: "desc" }]);
    expect(args?.take).toBe(20);
    expect(args?.skip).toBe(0);
  });

  it("passes status and type filters into the where clause", async () => {
    const res = await request(app)
      .get("/requests?status=APPROVED&type=DISPOSAL&limit=5&offset=10")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.request.findMany).mock.calls[0]?.[0];
    const where = args?.where as Record<string, unknown>;
    expect(where.status).toBe("APPROVED");
    expect(where.type).toBe("DISPOSAL");
    expect(args?.take).toBe(5);
    expect(args?.skip).toBe(10);
    // The same where drives the count, or the total would not match the page.
    expect(vi.mocked(prisma.request.count).mock.calls[0]?.[0]?.where).toEqual(args?.where);
  });

  it("lets a reviewer narrow to their own with ?mine=true", async () => {
    await request(app)
      .get("/requests?mine=true")
      .set("Authorization", `Bearer ${officerToken}`);

    const where = vi.mocked(prisma.request.findMany).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.requestedById).toBe("officer-1");
  });

  it("accepts all valid status values from the shared enum", async () => {
    const statuses = [
      "PENDING",
      "PENDING_STAGE1",
      "PENDING_STAGE2",
      "APPROVED",
      "REJECTED",
      "WAITLISTED",
      "WITHDRAWN",
      "INVALIDATED",
      "RETURN_PENDING_CONFIRMATION",
    ];

    for (const status of statuses) {
      vi.mocked(prisma.request.findMany).mockClear();
      vi.mocked(prisma.request.count).mockClear();
      vi.mocked(prisma.request.findMany).mockResolvedValue([makeRequest()] as never);
      vi.mocked(prisma.request.count).mockResolvedValue(1 as never);

      const res = await request(app)
        .get(`/requests?status=${status}`)
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      const where = vi.mocked(prisma.request.findMany).mock.calls[0]?.[0]?.where as Record<
        string,
        unknown
      >;
      expect(where.status).toBe(status);
    }
  });

  /**
   * §10.3 — account administration is not asset business. This endpoint served a
   * SYSTEM_ADMIN "their own" requests, and every row of `REQUEST_LIST_SELECT`
   * carries the item's tag id, name and room, so the live API handed the admin the
   * asset data of a transfer their own account had filed. It now matches nothing.
   */
  it("gives a SYSTEM_ADMIN no request queue at all", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "admin-1",
      role: "SYSTEM_ADMIN",
      tokenVersion: 0,
      orgUnitId: null,
      accountStatus: "ACTIVE",
    } as never);
    vi.mocked(prisma.request.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.request.count).mockResolvedValue(0 as never);

    const res = await request(app)
      .get("/requests")
      .set("Authorization", `Bearer ${createToken({ id: "admin-1", role: "SYSTEM_ADMIN", ver: 0 })}`);

    expect(res.status).toBe(200);
    // Empty because the filter matches nothing, not because a clause was forgotten.
    expect(vi.mocked(prisma.request.findMany).mock.calls[0]?.[0]?.where).toMatchObject({
      id: { in: [] },
    });
    expect(res.body.requests).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  /** The windowing that the duplicate handler was silently overriding (§9). */
  it("applies the requested time window instead of ignoring it", async () => {
    await request(app)
      .get("/requests?window=custom&fromDate=2026-10-01T00:00:00.000Z&toDate=2026-10-05T00:00:00.000Z")
      .set("Authorization", `Bearer ${officerToken}`);

    const where = vi.mocked(prisma.request.findMany).mock.calls[0]?.[0]?.where as {
      createdAt?: { gte?: Date; lte?: Date };
    };
    expect(where.createdAt?.gte?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(where.createdAt?.lte?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("rejects an out-of-range limit", async () => {
    const res = await request(app)
      .get("/requests?limit=9999")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toEqual(["limit"]);
    expect(prisma.request.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /requests/pending-count", () => {
  it("resolves to the count route, not to /:id", async () => {
    vi.mocked(prisma.request.count).mockResolvedValueOnce(3 as never);

    const res = await request(app)
      .get("/requests/pending-count")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pendingCount: 3 });
    expect(prisma.request.count).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
      },
    });
    // The Express 5 route-ordering guard: `/:id` is what calls findFirst, so a
    // hit here means "pending-count" was swallowed as an id.
    expect(prisma.request.findFirst).not.toHaveBeenCalled();
  });

  it("counts only a staff member's own pending requests", async () => {
    vi.mocked(prisma.request.count).mockResolvedValueOnce(1 as never);

    const res = await request(app)
      .get("/requests/pending-count")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(prisma.request.count).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        requestedById: "staff-1",
      },
    });
  });
});

describe("GET /requests/:id", () => {
  it("returns the request with an explicit select, never a bare include", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValueOnce(makeRequest() as never);

    const res = await request(app)
      .get("/requests/req-1")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.request.id).toBe("req-1");
    const args = vi.mocked(prisma.request.findFirst).mock.calls[0]?.[0];
    expect(args?.where).toEqual({ id: "req-1" });
    expect(args?.select).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    // The item's OrgUnit and Building reach both clients as the `department`
    // and `building` names they read, never the raw relation objects.
    expect(res.body.request.item).toMatchObject({
      department: "Computer Science",
      building: "CNCS Building",
    });
    expect(res.body.request.item).not.toHaveProperty("orgUnitRef");
  });

  it("hides someone else's request behind a 404, not a 403 (D4)", async () => {
    // The scope is part of the where clause, so the query simply finds nothing —
    // the response cannot confirm that an id the caller may not see exists.
    vi.mocked(prisma.request.findFirst).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .get("/requests/req-someone-else")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Request not found" });
    // The scope is part of the where clause, so the query finds nothing and the
    // response cannot confirm that an id the caller may not see exists. A
    // staff member's scope is their own requests plus the ones they were asked
    // about — a reviewer who was notified must be able to open what they were
    // notified about.
    expect(vi.mocked(prisma.request.findFirst).mock.calls[0]?.[0]?.where).toEqual({
      id: "req-someone-else",
      OR: [
        { requestedById: "staff-1" },
        { stage1ApprovedById: "staff-1" },
        { stage2ApprovedById: "staff-1" },
        { reviewedById: "staff-1" },
      ],
    });
  });
});

describe("POST /requests/:id/approve", () => {
  it("moves the item, logs one row per changed field, and notifies the requester (stage 1 -> stage 2 -> approved)", async () => {
    // Stage 1 approval
    primeStage1Approval();
    const stage1Res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(stage1Res.status).toBe(200);
    expect(stage1Res.body.request.status).toBe("PENDING_STAGE2");
    expect(stage1Res.body.itemChanges).toEqual({});

    // Verify stage 1 approval metadata
    expect(prisma.request.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "req-1", status: "PENDING" },
      data: { status: "PENDING_STAGE2", reviewedById: "officer-1", stage1ApprovedById: "officer-1", stage1ApprovedAt: expect.any(Date) },
    });

    // Stage 2 approval (final)
    primeStage2Approval({
      newLocationBuilding: "CNCS Building",
      newLocationFloor: "1",
      newLocationRoom: "101",
    });
    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("APPROVED");
    expect(res.body.itemChanges).toEqual({ buildingId: "CNCS Building", floor: "1", room: "101" });
    expect(res.body.cascadedItemIds).toEqual([]);
    expect(res.body.editLogRowCount).toBe(3);
    expect(res.body.notification.code).toBe("REQUEST_APPROVED");

    expect(prisma.request.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "req-1", status: "PENDING_STAGE2" },
      data: { status: "APPROVED", reviewedById: "officer-1", decidedAt: expect.any(Date), stage2ApprovedById: "officer-1", stage2ApprovedAt: expect.any(Date) },
    });
    expect(prisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: "item-1", status: "ACTIVE" },
      data: { buildingId: "CNCS Building", floor: "1", room: "101" },
    });

    const rows = vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0]?.data as
      | Array<Record<string, unknown>>
      | undefined;
    expect(rows).toEqual([
      {
        itemId: "item-1",
        editedById: "officer-1",
        fieldChanged: "buildingId",
        oldValue: "building-cncs",
        newValue: "CNCS Building",
        editedAt: expect.any(Date),
      },
      {
        itemId: "item-1",
        editedById: "officer-1",
        fieldChanged: "floor",
        oldValue: "3",
        newValue: "1",
        editedAt: expect.any(Date),
      },
      {
        itemId: "item-1",
        editedById: "officer-1",
        fieldChanged: "room",
        oldValue: "312",
        newValue: "101",
        editedAt: expect.any(Date),
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("compare-and-swaps the request BEFORE writing the item", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
      }) as never
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);

    await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    // The whole race guard is this ordering: a lost race aborts at the request
    // CAS and can therefore never apply the item change twice.
    const requestOrder = vi.mocked(prisma.request.updateMany).mock.invocationCallOrder[0];
    const itemOrder = vi.mocked(prisma.item.updateMany).mock.invocationCallOrder[0];
    expect(requestOrder).toBeDefined();
    expect(itemOrder).toBeDefined();
    expect(requestOrder as number).toBeLessThan(itemOrder as number);
  });

  it("shares one exact instant across the request, the log rows and the notification", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValueOnce({ count: 2 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValueOnce({} as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    const decidedAt = vi.mocked(prisma.request.updateMany).mock.calls[0]?.[0]?.data?.decidedAt;
    const rows = vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0]?.data as
      | Array<{ editedAt: Date }>
      | undefined;
    const notified = vi.mocked(prisma.notification.create).mock.calls[0]?.[0]?.data?.createdAt;

    // ItemEditLog has no requestId column, so this shared timestamp is the only
    // thing that proves these rows are one decision (Phase 3 groups by it).
    expect(decidedAt).toBeInstanceOf(Date);
    expect(rows?.[0]?.editedAt).toBe(decidedAt);
    expect(rows?.[1]?.editedAt).toBe(decidedAt);
    expect(notified).toBe(decidedAt);
    expect(res.body.request.decidedAt).toBe((decidedAt as Date).toISOString());
  });

  it("answers 409 when the request CAS matches nothing, without touching the item", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
      }) as never,
    );
    // Another admin committed the decision between the read and the write.
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Request has already been decided" });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("takes the fast path when the request is already decided", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({ status: "APPROVED", reviewedById: "admin-1" }) as never,
    );

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Request has already been decided" });
    expectNoWrites();
  });

  it("refuses to approve a request whose item was disposed meanwhile", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        item: makeItem({ status: "DISPOSED" }),
      }) as never,
    );

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Item is already disposed" });
    expectNoWrites();
  });

  it("answers 409 when the item CAS loses the race", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
      }) as never
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Item is no longer in service" });
    // The throw rolls the whole transaction back, request CAS included.
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();
  });

  it("refuses to let an officer decide their own request (F6.2)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        requestedById: "officer-1",
        requestedBy: { id: "officer-1", fullName: "Property Officer", email: "officer@cncs.aau.edu.et" },
      }) as never,
    );

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    // 403, not 409: being barred from deciding is authorization, and it stays
    // true whatever the request's status is. Role-gating alone would let this
    // through, which is exactly what this asserts.
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You cannot decide your own request" });
    expectNoWrites();
  });

  it("checks self-decision before status, so an own decided request still says 403", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        requestedById: "officer-1",
      }) as never,
    );

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You cannot decide your own request" });
  });

  it("keeps staff out with the existing middleware string", async () => {
    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Insufficient permissions" });
    expect(prisma.request.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("re-reads the role from the database, so a stale officer token is refused", async () => {
    // The token was issued before the demotion and still claims PROPERTY_OFFICER.
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(makeUser({ id: "officer-1", role: "STAFF" }) as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        requestedById: "staff-1",
      }) as never,
    );

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Insufficient permissions for stage 2 transfer approval" });
    expectNoWrites();
  });

  it("answers 401 when the reviewer's row is gone", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Not authenticated" });
    expectNoWrites();
  });

  it("answers 404 for a request id that does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(null as never);

    const res = await request(app)
      .post("/requests/req-ghost/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Request not found" });
    expectNoWrites();
  });

  it("refuses a newOwnerId that stopped existing after the request was filed", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(makeOfficer() as never)
      .mockResolvedValueOnce(null as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        newOwnerId: "ghost-user",
        requestedById: "staff-1",
      }) as never,
    );

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "newOwnerId does not match an existing user" });
    expectNoWrites();
  });

  it("logs an owner change as \"<name> (<id>)\" on both sides (D1)", async () => {
    // Stage 1 approval
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING",
        requestedById: "staff-1",
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);

    const stage1Res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(stage1Res.status).toBe(200);
    expect(stage1Res.body.request.status).toBe("PENDING_STAGE2");

    // Stage 2 approval (final)
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(makeOfficer() as never)
      .mockResolvedValueOnce({ id: "staff-2", fullName: "Second Staff" } as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        newOwnerId: "staff-2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        requestedById: "staff-1",
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 3 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("APPROVED");
    // The holder pair rides along with `ownerId` (spec 4.1), derived from the same
    // `newOwnerId` — the item's custody columns and the custodian column can never
    // name two different people.
    // §2.3: Transfer to individual now sets PENDING_CLAIM status with claim window
    expect(res.body.itemChanges).toMatchObject({
      floor: "1",
      room: "101",
      ownerId: "staff-2",
      holderType: "STAFF",
      holderId: "staff-2",
      status: "PENDING_CLAIM",
      claimedAt: null,
      claimDueAt: expect.any(String),
    });
    // Verify claimDueAt is a valid ISO date string
    expect(new Date(res.body.itemChanges.claimDueAt)).toBeInstanceOf(Date);

    const rows = vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0]?.data as
      | Array<Record<string, unknown>>
      | undefined;
    // A bare uuid is unreadable and a bare name breaks on a rename, so both.
    expect(rows?.[2]).toMatchObject({
      fieldChanged: "ownerId",
      oldValue: "Demo Staff (staff-1)",
      newValue: "Second Staff (staff-2)",
    });
  });

  it("disposes by status change, carrying the request's own reason (F7.2)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        type: "DISPOSAL",
        status: "PENDING",
        reason: "Beyond economical repair after the power surge",
        newLocationFloor: null,
        newLocationRoom: null,
        newLocationBuilding: null,
        newOwnerId: null,
        requestedById: "staff-1",
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 3 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.item.updateMany).mock.calls[0]?.[0];
    expect(args?.where).toEqual({ id: "item-1", status: "ACTIVE" });
    expect(args?.data).toEqual({
      status: "DISPOSED",
      disposalReason: "Beyond economical repair after the power surge",
      disposedAt: expect.any(Date),
      // Back to the college's own pool: a disposed asset is nobody's assignment.
      holderType: "COLLEGE",
      holderId: null,
    });
    // A status change, never a delete: the row stays queryable for reports.
    expect(res.body.editLogRowCount).toBe(3);
  });

  it("records the custody change when a transfer names a new custodian", async () => {
    // Stage 1 approval
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING",
        requestedById: "staff-1",
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);

    await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    // Stage 2 approval (final)
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(makeOfficer() as never)
      .mockResolvedValueOnce({ id: "staff-2", fullName: "Second Staff" } as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        newOwnerId: "staff-2",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        requestedById: "staff-1",
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 3 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("APPROVED");
    // Both ends of the move, the person who acted, and why — the row a reader uses
    // to answer "who had this in March?" without reconstructing it from edit logs.
    expect(prisma.custodyEvent.create).toHaveBeenCalledWith({
      data: {
        itemId: "item-1",
        eventType: "TRANSFERRED",
        fromHolderType: "STAFF",
        fromHolderId: "staff-1",
        toHolderType: "STAFF",
        toHolderId: "staff-2",
        actingUserId: "officer-1",
        reason: "Moving to the new staff office",
        departmentHeadSnapshot: null,
      },
    });
  });

  it("writes no custody event for a transfer that only moves the item", async () => {
    // Stage 1 approval
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING",
        requestedById: "staff-1",
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.custodyEvent.create).mockResolvedValue({ id: "custody-1" } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-1" } as never);

    await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    // Stage 2 approval (final) - only location change, no new custodian
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({
        status: "PENDING_STAGE2",
        newOwnerId: null,
        newLocationRoom: "101",
        reviewedById: "officer-1",
        stage1ApprovedById: "officer-1",
        stage1ApprovedAt: new Date("2026-09-02T10:00:00.000Z"),
        requestedById: "staff-1",
      }) as never,
    );
    vi.mocked(prisma.request.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemEditLog.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.notification.create).mockResolvedValue({} as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("APPROVED");
    // A room change is a location change, and its history is the edit log. A
    // TRANSFERRED row here would claim a handover that never happened.
    expect(prisma.custodyEvent.create).not.toHaveBeenCalled();
  });

  it("records a disposal as the item leaving its custodian's hands", async () => {
    primeDisposalApproval({
      type: "DISPOSAL",
      reason: "Beyond economical repair after the power surge",
      newLocationFloor: null,
      newLocationRoom: null,
    });

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(prisma.custodyEvent.create).toHaveBeenCalledWith({
      data: {
        itemId: "item-1",
        eventType: "DISPOSED",
        fromHolderType: "STAFF",
        fromHolderId: "staff-1",
        toHolderType: "COLLEGE",
        toHolderId: null,
        actingUserId: "officer-1",
        reason: "Beyond economical repair after the power surge",
        departmentHeadSnapshot: null,
      },
    });
  });

  it("cascades a transfer to the accessories and logs every cascaded field (D6)", async () => {
    // Stage 1 approval
    primeStage1Approval();
    await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    // Stage 2 approval (final)
    primeStage2Approval({
      newOwnerId: null,
      newLocationBuilding: "CNCS Building",
      newLocationFloor: "1",
      newLocationRoom: "101",
    });
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
      {
        id: "item-4",
        tagId: "CNCS-DEMO-0004",
        buildingId: "building-cncs",
        floor: "3",
        room: "312",
        ownerId: "staff-1",
        status: "ACTIVE",
        disposalReason: null,
        disposedAt: null,
      },
    ] as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.cascadedItemIds).toEqual(["item-4"]);
    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentItemId: "item-1", status: "ACTIVE" } }),
    );
    expect(vi.mocked(prisma.item.updateMany).mock.calls[1]?.[0]).toEqual({
      where: { id: { in: ["item-4"] }, status: "ACTIVE" },
      data: { buildingId: "CNCS Building", floor: "1", room: "101" },
    });

    // One createMany for parent and child together, every row sharing editedAt
    // and editedById — this is what catches a half-implemented cascade.
    expect(prisma.itemEditLog.createMany).toHaveBeenCalledOnce();
    const rows = vi.mocked(prisma.itemEditLog.createMany).mock.calls[0]?.[0]?.data as
      | Array<{ itemId: string; fieldChanged: string; editedAt: Date; editedById: string }>
      | undefined;
    expect(rows).toHaveLength(6);
    expect(rows?.map((row) => `${row.itemId}:${row.fieldChanged}`)).toEqual([
      "item-1:buildingId",
      "item-1:floor",
      "item-1:room",
      "item-4:buildingId",
      "item-4:floor",
      "item-4:room",
    ]);
    expect(new Set(rows?.map((row) => row.editedAt))).toHaveProperty("size", 1);
    expect(new Set(rows?.map((row) => row.editedById))).toEqual(new Set(["officer-1"]));
    expect(res.body.editLogRowCount).toBe(6);
  });

  it("cascades a disposal with a reason naming the parent tag", async () => {
    primeDisposalApproval({
      type: "DISPOSAL",
      reason: "Beyond economical repair after the power surge",
      newLocationFloor: null,
      newLocationRoom: null,
    });
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
      {
        id: "item-4",
        tagId: "CNCS-DEMO-0004",
        buildingId: "building-cncs",
        floor: "3",
        room: "312",
        ownerId: "staff-1",
        status: "ACTIVE",
        disposalReason: null,
        disposedAt: null,
      },
    ] as never);

    const res = await request(app)
      .post("/requests/req-1/approve")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.item.updateMany).mock.calls[1]?.[0]?.data).toEqual({
      status: "DISPOSED",
      disposalReason:
        "Disposed with parent item CNCS-DEMO-0001: Beyond economical repair after the power surge",
      disposedAt: expect.any(Date),
      // The bundle leaves service together, so it leaves its custodian together.
      holderType: "COLLEGE",
      holderId: null,
    });
    // parentItemId is preserved: the bundle stays recorded as a bundle.
    expect(vi.mocked(prisma.item.updateMany).mock.calls[1]?.[0]?.data).not.toHaveProperty(
      "parentItemId",
    );
  });
});

describe("POST /requests/:id/reject", () => {
  it("records the reason and writes nothing to the item", async () => {
    primeDecision();

    const res = await request(app)
      .post("/requests/req-1/reject")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ rejectionReason: "Item is still serviceable" });

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("REJECTED");
    expect(res.body.request.rejectionReason).toBe("Item is still serviceable");
    expect(res.body.itemChanges).toEqual({});
    expect(res.body.editLogRowCount).toBe(0);

    expect(prisma.request.updateMany).toHaveBeenCalledWith({
      where: { id: "req-1", status: "PENDING" },        data: {
          status: "REJECTED",
          reviewedById: "officer-1",
        decidedAt: expect.any(Date),
        rejectionReason: "Item is still serviceable",
      },
    });
    // A rejection is a decision about the request, not about the item.
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(prisma.item.findMany).not.toHaveBeenCalled();
    expect(prisma.itemEditLog.createMany).not.toHaveBeenCalled();

    expect(vi.mocked(prisma.notification.create).mock.calls[0]?.[0]?.data).toMatchObject({
      userId: "staff-1",
      relatedRequestId: "req-1",
      message:
        "[REQUEST_REJECTED] Your TRANSFER request for item CNCS-DEMO-0001 " +
        "(Dell Latitude Laptop) was rejected by Property Officer. Reason: Item is still serviceable",
    });
    expect(res.body.notification.code).toBe("REQUEST_REJECTED");
    expect(res.body.notification.message).not.toContain("[");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("requires a reason", async () => {
    const res = await request(app)
      .post("/requests/req-1/reject")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("rejectionReason is required");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("caps the reason at 500 characters", async () => {
    const res = await request(app)
      .post("/requests/req-1/reject")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ rejectionReason: "x".repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("rejectionReason must be at most 500 characters");
    expectNoWrites();
  });

  it("refuses a self-rejection just as it refuses a self-approval", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeOfficer() as never);
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({ requestedById: "officer-1" }) as never,
    );

    const res = await request(app)
      .post("/requests/req-1/reject")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ rejectionReason: "Changed my mind" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You cannot decide your own request" });
    expectNoWrites();
  });
});

describe("POST /requests/:id/withdraw", () => {
  it("allows the original requester to withdraw a pending request", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({ id: "req-1", requestedById: "staff-1", status: "PENDING" }) as never,
    );
    vi.mocked(prisma.request.update).mockResolvedValueOnce({
      id: "req-1",
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      withdrawnById: "staff-1",
      reason: "No longer needed",
    } as never);

    const staffToken = createToken(makeUser({ id: "staff-1", role: "STAFF" }));

    const res = await request(app)
      .post("/requests/req-1/withdraw")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ reason: "No longer needed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WITHDRAWN");
    expect(prisma.request.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: {
        status: "WITHDRAWN",
        withdrawnAt: expect.any(Date),
        withdrawnById: "staff-1",
        reason: "No longer needed",
      },
    });
  });

  it("forbids non-requester from withdrawing", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({ id: "req-1", requestedById: "staff-1", status: "PENDING" }) as never,
    );

    const officerToken = createToken(makeOfficer());

    const res = await request(app)
      .post("/requests/req-1/withdraw")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ reason: "Not needed" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Only the original requester can withdraw this request");
  });

  it("forbids withdrawal of already approved requests", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({ id: "req-1", requestedById: "staff-1", status: "APPROVED" }) as never,
    );

    const staffToken = createToken(makeUser({ id: "staff-1", role: "STAFF" }));

    const res = await request(app)
      .post("/requests/req-1/withdraw")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ reason: "Changed mind" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Can only withdraw requests that have not been approved");
  });

  it("forbids withdrawal of rejected requests", async () => {
    vi.mocked(prisma.request.findUnique).mockResolvedValueOnce(
      makeRequest({ id: "req-1", requestedById: "staff-1", status: "REJECTED" }) as never,
    );

    const staffToken = createToken(makeUser({ id: "staff-1", role: "STAFF" }));

    const res = await request(app)
      .post("/requests/req-1/withdraw")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ reason: "Changed mind" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Can only withdraw requests that have not been approved");
  });
});

describe("mount paths", () => {
  it("reaches the same handler under /api/v1 and under the bare path", async () => {
    vi.mocked(prisma.request.count).mockResolvedValue(2 as never);

    const prefixed = await request(app)
      .get("/api/v1/requests/pending-count")
      .set("Authorization", `Bearer ${officerToken}`);
    const bare = await request(app)
      .get("/requests/pending-count")
      .set("Authorization", `Bearer ${officerToken}`);

    // The bare alias exists only so Phase 1's tests keep passing; both must work.
    expect(prefixed.status).toBe(200);
    expect(prefixed.body).toEqual({ pendingCount: 2 });
    expect(bare.body).toEqual(prefixed.body);
  });

  it("answers an unknown route with JSON rather than Express's HTML 404", async () => {
    const res = await request(app).get("/requests-nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Route not found" });
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("answers a malformed JSON body with 400", async () => {
    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .set("Content-Type", "application/json")
      .send('{"reason": "unterminated');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON body" });
    expectNoWrites();
  });
});

