import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createToken } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/** Hoisted above the imports, so it cannot reference them — see requests.test.ts. */
vi.mock("../lib/prisma.js", () => {
  const client = {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    notification: { deleteMany: vi.fn() },
    request: { count: vi.fn() },
    adminActionLog: { create: vi.fn() },
    // `findMany` is how the head's unit scope is read (the unit and its
    // children) — without it, the approvals query for a DEPARTMENT_HEAD
    // cannot be built.
    orgUnit: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const adminToken = createToken({ id: "admin-1", role: "SYSTEM_ADMIN" });
const staffToken = createToken({ id: "staff-1", role: "STAFF" });

/** A row in the shape `userListSelect` returns, `_count` included. */
function adminUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    fullName: "Demo Staff",
    email: "staff@cnus.aau.edu.et",
    role: "STAFF",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    accountStatus: "ACTIVE",
    reviewedAt: null,
    reviewNote: null,
    _count: { ownedItems: 2 },
    ...overrides,
  };
}

/** A row as it comes back from `POST /auth/account-requests`: nobody decided it yet. */
function pendingUserRow(overrides: Record<string, unknown> = {}) {
  return adminUserRow({
    id: "pending-1",
    fullName: "Hanna Tesfaye",
    email: "hanna@cncs.aau.edu.et",
    accountStatus: "PENDING_APPROVAL",
    _count: { ownedItems: 0 },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /users", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/users");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a STAFF caller", async () => {
    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  it("lets a PROPERTY_OFFICER read the list, to choose a holder when registering", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([adminUserRow()] as never);
    const officerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns every account with an item count and no password hash", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      adminUserRow(),
      adminUserRow({ id: "user-2", role: "SYSTEM_ADMIN", _count: { ownedItems: 0 } }),
    ] as never);

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: "user-1", role: "STAFF" });
    expect(res.body[0].itemCount).toBeUndefined(); // SYSTEM_ADMIN should not see any item counts
    expect(res.body[1]).toMatchObject({ id: "user-2", role: "SYSTEM_ADMIN" });
    expect(res.body[1].itemCount).toBeUndefined();
    expect(res.body[0].passwordHash).toBeUndefined();
    expect(res.body[0]._count).toBeUndefined();
  });
});

describe("PATCH /users/:id", () => {
  it("returns 403 for a STAFF caller", async () => {
    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ fullName: "New Name" });

    expect(res.status).toBe(403);
  });

  it("returns 400 when nothing is supplied", async () => {
    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch("/users/missing")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fullName: "New Name" });

    expect(res.status).toBe(404);
  });

  it("returns 409 when the email belongs to another account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      email: "old@cnus.aau.edu.et",
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: "user-2",
      email: "taken@cnus.aau.edu.et",
    } as never);

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "taken@cnus.aau.edu.et" });

    expect(res.status).toBe(409);
  });

  it("catches a clash that differs only by case", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      email: "old@cnus.aau.edu.et",
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: "user-2" } as never);

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "Taken@CNUS.aau.edu.et" });

    expect(res.status).toBe(409);

    // The comparison has to be the insensitive one, and it has to exclude the
    // account being edited — otherwise re-saving a legacy mixed-case email would
    // collide with the row it is already on.
    const where = vi.mocked(prisma.user.findFirst).mock.calls[0]?.[0]?.where as {
      email: { equals: string; mode: string };
      id: { not: string };
    };
    expect(where.email.mode).toBe("insensitive");
    expect(where.email.equals).toBe("taken@cnus.aau.edu.et");
    expect(where.id).toEqual({ not: "user-1" });
  });

  it("stores an edited email lowercased", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      email: "old@cnus.aau.edu.et",
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      adminUserRow({ email: "new@cnus.aau.edu.et" }) as never,
    );

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "New@CNUS.aau.edu.et" });

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0]?.[0]?.data?.email).toBe(
      "new@cnus.aau.edu.et",
    );
  });

  it("returns 200 and the updated account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      email: "staff@cnus.aau.edu.et",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      adminUserRow({ fullName: "Renamed Staff" }) as never,
    );

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fullName: "Renamed Staff" });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Renamed Staff");
  });
});

describe("POST /users/:id/promote", () => {
  it("returns 403 for a STAFF caller", async () => {
    const res = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 400 when the target role is missing or unknown", async () => {
    const missing = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(missing.status).toBe(400);

    const unknown = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "SUPERUSER" });
    expect(unknown.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/users/missing/promote")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "PROPERTY_OFFICER" });

    expect(res.status).toBe(404);
  });

  it("returns 409 when the account already holds the target role", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-2",
      role: "PROPERTY_OFFICER",
    } as never);

    const res = await request(app)
      .post("/users/user-2/promote")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "PROPERTY_OFFICER" });

    expect(res.status).toBe(409);
  });

  it("sets the role and bumps tokenVersion so old sessions die", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      role: "STAFF",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      adminUserRow({ role: "PROPERTY_OFFICER" }) as never,
    );

    const res = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "PROPERTY_OFFICER" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("PROPERTY_OFFICER");
    expect(vi.mocked(prisma.user.update).mock.calls[0]?.[0]?.data).toMatchObject({
      role: "PROPERTY_OFFICER",
      tokenVersion: { increment: 1 },
    });
  });
});

describe("POST /users/:id/password", () => {
  it("returns 400 when the password is too short", async () => {
    const res = await request(app)
      .post("/users/user-1/password")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "short" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/users/missing/password")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "LongEnough123" });

    expect(res.status).toBe(404);
  });

  it("returns 200 and stores a new hash", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: "user-1" } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: "user-1" } as never);

    const res = await request(app)
      .post("/users/user-1/password")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "LongEnough123" });

    expect(res.status).toBe(200);
    expect(res.body.passwordChanged).toBe(true);

    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as {
      data: { passwordHash: string };
    };
    expect(call.data.passwordHash).not.toBe("LongEnough123");
    expect(call.data.passwordHash.length).toBeGreaterThan(20);
  });
});

describe("DELETE /users/:id", () => {
  it("returns 403 for a STAFF caller", async () => {
    const res = await request(app)
      .delete("/users/user-1")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it("refuses to delete the acting administrator's own account", async () => {
    const res = await request(app)
      .delete("/users/admin-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete("/users/missing")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 409 and names what blocks it when the account is part of the record", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      _count: {
        ownedItems: 2,
        requestsCreated: 1,
        requestsReviewed: 0,
        auditsRun: 0,
        itemEdits: 3,
      },
    } as never);

    const res = await request(app)
      .delete("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("2 owned items");
    expect(res.body.error).toContain("3 edit-history rows");
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("returns 200 and clears the inbox before deleting an unused account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      _count: {
        ownedItems: 0,
        requestsCreated: 0,
        requestsReviewed: 0,
        auditsRun: 0,
        itemEdits: 0,
      },
    } as never);
    vi.mocked(prisma.notification.deleteMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.user.delete).mockResolvedValueOnce({ id: "user-1" } as never);

    const res = await request(app)
      .delete("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });
});

/**
 * The account-approval queue (spec 3.1.2).
 *
 * The flow the supervisor flagged as the biggest issue on record: a person asks for
 * an account, an administrator decides, and nobody becomes active by their own
 * action. `POST /auth/account-requests` is covered in auth.test.ts; these are the
 * administrator's side, and the two self-review tests below are the ones that prove
 * the rule lives on the server rather than in the queue screen.
 */
describe("GET /users/approvals", () => {
  it("returns 403 for a caller who may not administer accounts", async () => {
    const officerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });

    const res = await request(app)
      .get("/users/approvals")
      .set("Authorization", `Bearer ${officerToken}`);

    // `USER_READ` is what fills the custodian picker, and it is not this: who is
    // waiting to join the system is nobody else's list.
    expect(res.status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("shows a Department Head the requests that have no note yet, and still hides the escalated ones", async () => {
    // The shape of the filter, and the reason it is written this way.
    //
    // `reviewNote NOT LIKE '%[ESCALATED]%'` is NULL — not TRUE — for a row
    // with no note, and SQL drops NULL from a WHERE clause. A **newly
    // submitted** account request has no note, so it was invisible in the
    // head's own queue: a Department Head never saw a staff request, and
    // only a SYSTEM_ADMIN could approve one. That quietly undid D1 (the unit
    // head approves own-unit staff) while every test stayed green — the
    // mocked suite never executes this WHERE clause.
    //
    // The fix is the `OR` below: "no note" counts as "not escalated". The
    // e2e script (scripts/e2e-flows.sh) proves it against a real database;
    // this test pins the shape so the branch cannot be "simplified" away.
    // The head needs a unit: without one the route answers 403 ("You are not
    // assigned to a department") and never reaches the query.
    const headToken = createToken({
      id: "head-1",
      role: "DEPARTMENT_HEAD",
      orgUnitId: "unit-cs",
    });
    vi.mocked(prisma.orgUnit.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);

    await request(app)
      .get("/users/approvals")
      .set("Authorization", `Bearer ${headToken}`);

    const where = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0]?.where as {
      OR?: Array<Record<string, unknown>>;
    };
    expect(where.OR).toBeDefined();
    expect(where.OR).toContainEqual({ reviewNote: null });
    expect(where.OR).toContainEqual({ reviewNote: { not: { contains: "[ESCALATED]" } } });
  });

  it("lists only the pending accounts, oldest first", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([pendingUserRow()] as never);

    const res = await request(app)
      .get("/users/approvals")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountStatus).toBe("PENDING_APPROVAL");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    // Worked from the tail: the person who has waited longest is the overdue one.
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { accountStatus: "PENDING_APPROVAL" },
      orderBy: { createdAt: "asc" },
      select: expect.any(Object),
    });
  });
});

describe("POST /users/:id/approve", () => {
  it("activates the account and records who decided it", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "pending-1",
      accountStatus: "PENDING_APPROVAL",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      pendingUserRow({ accountStatus: "ACTIVE" }) as never,
    );
    vi.mocked(prisma.adminActionLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/users/pending-1/approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.accountStatus).toBe("ACTIVE");

    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: "pending-1" });
    expect(call.data.accountStatus).toBe("ACTIVE");
    expect(call.data.reviewedBy).toEqual({ connect: { id: "admin-1" } });
    expect(call.data.reviewedAt).toBeInstanceOf(Date);
    // The request carries no role, so approving without one must not invent a
    // change: the account keeps the STAFF role the request asked as.
    expect(call.data).not.toHaveProperty("role");
  });

  it("assigns the real role at approval time, and revokes any session", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "pending-1",
      accountStatus: "PENDING_APPROVAL",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      pendingUserRow({ accountStatus: "ACTIVE", role: "AUDITOR" }) as never,
    );
    vi.mocked(prisma.adminActionLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue(null as never);

    const res = await request(app)
      .post("/users/pending-1/approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "AUDITOR" });

    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.role).toBe("AUDITOR");
    expect(call.data.reviewedBy).toEqual({ connect: { id: "admin-1" } });
    expect(call.data.tokenVersion).toEqual({ increment: 1 });
  });

  it("refuses an administrator approving their own account (404, hides existence)", async () => {
    // The account under decision IS the caller. Nothing about this request needs
    // the queue screen to have hidden a button.
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "admin-1",
      accountStatus: "PENDING_APPROVAL",
    } as never);

    const res = await request(app)
      .post("/users/admin-1/approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("You cannot approve or reject your own account request");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses a decision on an account that is not waiting (404, hides existence)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      accountStatus: "ACTIVE",
    } as never);

    const res = await request(app)
      .post("/users/user-1/approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("This request is not pending approval");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/users/ghost/approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("returns 403 for a STAFF caller", async () => {
    const res = await request(app)
      .post("/users/pending-1/approve")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /users/:id/reject", () => {
  it("declines the request with the reason the person will read", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "pending-1",
      accountStatus: "PENDING_APPROVAL",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      pendingUserRow({ accountStatus: "REJECTED", reviewNote: "No matching staff record" }) as never,
    );
    vi.mocked(prisma.adminActionLog.create).mockResolvedValue({} as never);

    const res = await request(app)
      .post("/users/pending-1/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "No matching staff record" });

    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.accountStatus).toBe("REJECTED");
    expect(call.data.reviewNote).toBe("No matching staff record");
    expect(call.data.reviewedBy).toEqual({ connect: { id: "admin-1" } });
  });

  it("requires a reason long enough to be one (F6.2's rule, applied here)", async () => {
    const res = await request(app)
      .post("/users/pending-1/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "no" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A reason of 3 to 500 characters is required");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses an administrator rejecting their own account (404, hides existence)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "admin-1",
      accountStatus: "PENDING_APPROVAL",
    } as never);

    const res = await request(app)
      .post("/users/admin-1/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Never mind" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("You cannot approve or reject your own account request");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
