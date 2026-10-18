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
    adminActionLog: {
      create: vi.fn(),
    },
    emailToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    emailOutbox: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    designation: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    custodyEvent: {
      create: vi.fn(),
    },
    item: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    orgUnit: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: { deleteMany: vi.fn(), create: vi.fn() },
    request: { count: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const systemAdminToken = createToken({ id: "sysadmin-1", role: "SYSTEM_ADMIN" });
const accountAdminToken = createToken({ id: "accountadmin-1", role: "ACCOUNT_ADMIN" });
const headToken = createToken({ id: "head-1", role: "DEPARTMENT_HEAD", orgUnitId: "unit-1" });
const otherHeadToken = createToken({ id: "head-2", role: "DEPARTMENT_HEAD", orgUnitId: "unit-2" });
const staffToken = createToken({ id: "staff-1", role: "STAFF", orgUnitId: "unit-1" });

/** A row in the shape `userListSelect` returns, `_count` included. */
function adminUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    fullName: "Demo Staff",
    email: "staff@cncs.aau.edu.et",
    role: "STAFF",
    orgUnitId: "unit-1",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    accountStatus: "ACTIVE",
    reviewedAt: null,
    reviewNote: null,
    staffId: "ST-001",
    _count: { ownedItems: 2 },
    ...overrides,
  };
}

/** A row as it comes back from registration: nobody decided it yet. */
function pendingUserRow(overrides: Record<string, unknown> = {}) {
  return adminUserRow({
    id: "pending-1",
    fullName: "Pending Staff",
    email: "pending@cncs.aau.edu.et",
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
    const officerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([adminUserRow()] as never);

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns every account with an item count and no password hash", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      adminUserRow(),
      adminUserRow({ id: "user-2", email: "other@cncs.aau.edu.et" }),
    ] as never);

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${accountAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({
      id: "user-1",
      fullName: "Demo Staff",
      email: "staff@cncs.aau.edu.et",
      role: "STAFF",
      createdAt: "2026-09-01T00:00:00.000Z",
      itemCount: 2,
      accountStatus: "ACTIVE",
      reviewedAt: null,
      reviewNote: null,
      staffId: "ST-001",
    });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
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
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Nothing to update");
  });

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/users/missing")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ fullName: "New Name" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the email belongs to another account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(adminUserRow() as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(
      adminUserRow({ id: "user-2", email: "clash@cncs.aau.edu.et" }) as never,
    );

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ email: "clash@cncs.aau.edu.et" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email is already in use by another account");
  });

  it("stores an edited email lowercased", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(adminUserRow() as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      adminUserRow({ email: "hanna@cncs.aau.edu.et" }) as never,
    );

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ email: "Hanna@CNCS.AAU.EDU.ET" });

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: "hanna@cncs.aau.edu.et" },
      select: expect.any(Object),
    });
  });

  it("returns 200 and the updated account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(adminUserRow() as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      adminUserRow({ fullName: "Updated Name" }) as never,
    );

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ fullName: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Updated Name");
  });
});

describe("POST /users/:id/promote", () => {
  it("returns 403 for a STAFF caller", async () => {
    const res = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ role: "DEPARTMENT_HEAD" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when the target role is missing or unknown", async () => {
    const res = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const res = await request(app)
      .post("/users/missing/promote")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ role: "DEPARTMENT_HEAD" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the account already holds the target role", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      adminUserRow({ role: "DEPARTMENT_HEAD" }) as never,
    );
    const res = await request(app)
      .post("/users/user-2/promote")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ role: "DEPARTMENT_HEAD" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Account already holds this role");
  });

  it("enforces PO and Auditor mutual exclusion on role change", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      adminUserRow({ role: "PROPERTY_OFFICER" }) as never,
    );
    const res = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ role: "AUDITOR" });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Property Officer and Auditor cannot be the same person");
  });

  it("sets the role and bumps tokenVersion so old sessions die", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(adminUserRow({ role: "STAFF" }) as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      adminUserRow({ role: "DEPARTMENT_HEAD" }) as never,
    );

    const res = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ role: "DEPARTMENT_HEAD" });

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: "DEPARTMENT_HEAD", tokenVersion: { increment: 1 } },
      select: expect.any(Object),
    });
  });
});

describe("GET /users/approvals", () => {
  it("returns 403 for SYSTEM_ADMIN (technical only)", async () => {
    const res = await request(app)
      .get("/users/approvals")
      .set("Authorization", `Bearer ${systemAdminToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 403 for STAFF caller", async () => {
    const res = await request(app)
      .get("/users/approvals")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it("returns pending staff in own department for DEPARTMENT_HEAD", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([pendingUserRow({ orgUnitId: "unit-1" })] as never);

    const res = await request(app)
      .get("/users/approvals")
      .set("Authorization", `Bearer ${headToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(vi.mocked(prisma.user.findMany)).toHaveBeenCalledWith({
      where: {
        accountStatus: "PENDING_APPROVAL",
        orgUnitId: "unit-1",
        role: "STAFF",
      },
      orderBy: { createdAt: "asc" },
      select: expect.any(Object),
    });
  });

  it("returns fallback pending staff for ACCOUNT_ADMIN (vacant head or > 5 days)", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([pendingUserRow()] as never);

    const res = await request(app)
      .get("/users/approvals")
      .set("Authorization", `Bearer ${accountAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /users/:id/approve", () => {
  it("returns 403 when SYSTEM_ADMIN attempts to approve", async () => {
    const res = await request(app)
      .post("/users/pending-1/approve")
      .set("Authorization", `Bearer ${systemAdminToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it("activates the account when department head approves in own unit", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "pending-1",
      accountStatus: "PENDING_APPROVAL",
      orgUnitId: "unit-1",
      fullName: "Staff Member",
      email: "staff@aau.edu.et",
      role: "STAFF",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      pendingUserRow({ accountStatus: "ACTIVE", orgUnitId: "unit-1" }) as never,
    );

    const res = await request(app)
      .post("/users/pending-1/approve")
      .set("Authorization", `Bearer ${headToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.accountStatus).toBe("ACTIVE");

    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: "pending-1" });
    expect(call.data.accountStatus).toBe("ACTIVE");
    expect(call.data.reviewedById).toBe("head-1");
  });

  it("refuses department head approving request from another department", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "pending-1",
      accountStatus: "PENDING_APPROVAL",
      orgUnitId: "unit-2",
      role: "STAFF",
    } as never);

    const res = await request(app)
      .post("/users/pending-1/approve")
      .set("Authorization", `Bearer ${headToken}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("allows Account Admin fallback approval when head is vacant", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "pending-1",
      accountStatus: "PENDING_APPROVAL",
      orgUnitId: "unit-vacant",
      role: "STAFF",
      createdAt: new Date(), // recent, but vacant head
      orgUnitRef: { id: "unit-vacant", headId: null, head: null },
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      pendingUserRow({ accountStatus: "ACTIVE", reviewNote: "head unavailable" }) as never,
    );

    const res = await request(app)
      .post("/users/pending-1/approve")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.accountStatus).toBe("ACTIVE");
    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as any;
    expect(call.data.reviewNote).toBe("head unavailable");
  });

  it("refuses an administrator approving their own account", async () => {
    const res = await request(app)
      .post("/users/head-1/approve")
      .set("Authorization", `Bearer ${headToken}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe("POST /users/:id/reject", () => {
  it("declines the request with reason when head rejects in scope", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "pending-1",
      accountStatus: "PENDING_APPROVAL",
      orgUnitId: "unit-1",
      fullName: "Staff Member",
      email: "staff@aau.edu.et",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      pendingUserRow({ accountStatus: "REJECTED", reviewNote: "No matching staff record" }) as never,
    );

    const res = await request(app)
      .post("/users/pending-1/reject")
      .set("Authorization", `Bearer ${headToken}`)
      .send({ reason: "No matching staff record" });

    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.accountStatus).toBe("REJECTED");
    expect(call.data.reviewNote).toBe("No matching staff record");
    expect(call.data.reviewedById).toBe("head-1");
  });

  it("requires a reason long enough to be one", async () => {
    const res = await request(app)
      .post("/users/pending-1/reject")
      .set("Authorization", `Bearer ${headToken}`)
      .send({ reason: "no" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A reason of 3 to 500 characters is required");
  });
});

describe("POST /users/:id/deactivate", () => {
  it("prevents self-deactivation", async () => {
    const res = await request(app)
      .post("/users/accountadmin-1/deactivate")
      .set("Authorization", `Bearer ${accountAdminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("You cannot deactivate your own account");
  });

  it("lets Account Admin deactivate Department Head, bumping tokenVersion and reverting items", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "head-1",
      role: "DEPARTMENT_HEAD",
      accountStatus: "ACTIVE",
      orgUnitId: "unit-1",
      fullName: "Head One",
      email: "head@aau.edu.et",
    } as never);
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([
      { id: "item-1" },
    ] as never);

    const res = await request(app)
      .post("/users/head-1/deactivate")
      .set("Authorization", `Bearer ${accountAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deactivated).toBe(true);

    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: "head-1" },
      data: {
        accountStatus: "DEACTIVATED",
        tokenVersion: { increment: 1 },
      },
    });

    // Check item reversion to department in REVERTED_UNVERIFIED
    expect(vi.mocked(prisma.item.update)).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        status: "REVERTED_UNVERIFIED",
        holderType: "DEPARTMENT",
        holderId: "unit-1",
      },
    });
  });
});

describe("Designations: POST /users/:id/designations", () => {
  it("allows Account Admin to grant DEPARTMENT_CUSTODIAN designation", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(adminUserRow() as never);
    vi.mocked(prisma.designation.create).mockResolvedValueOnce({
      id: "desig-1",
      userId: "user-1",
      designation: "DEPARTMENT_CUSTODIAN",
      orgUnitId: "unit-1",
    } as never);

    const res = await request(app)
      .post("/users/user-1/designations")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ designation: "DEPARTMENT_CUSTODIAN", orgUnitId: "unit-1" });

    expect(res.status).toBe(201);
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { tokenVersion: { increment: 1 } },
    });
  });

  it("strictly forbids granting PROPERTY_OFFICER or AUDITOR as designation", async () => {
    const res = await request(app)
      .post("/users/user-1/designations")
      .set("Authorization", `Bearer ${accountAdminToken}`)
      .send({ designation: "PROPERTY_OFFICER" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Designations cannot grant Property Officer or Auditor roles");
  });
});
