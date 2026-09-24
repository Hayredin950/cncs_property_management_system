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
      update: vi.fn(),
      delete: vi.fn(),
    },
    notification: { deleteMany: vi.fn() },
    request: { count: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const adminToken = createToken({ id: "admin-1", role: "ADMIN" });
const staffToken = createToken({ id: "staff-1", role: "STAFF" });

/** A row in the shape `userListSelect` returns, `_count` included. */
function adminUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    fullName: "Demo Staff",
    email: "staff@cnus.aau.edu.et",
    role: "STAFF",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    _count: { ownedItems: 2 },
    ...overrides,
  };
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

  it("returns every account with an item count and no password hash", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      adminUserRow(),
      adminUserRow({ id: "user-2", role: "ADMIN", _count: { ownedItems: 0 } }),
    ] as never);

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: "user-1", role: "STAFF", itemCount: 2 });
    expect(res.body[1]).toMatchObject({ id: "user-2", role: "ADMIN", itemCount: 0 });
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
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: "user-1", email: "old@cnus.aau.edu.et" } as never)
      .mockResolvedValueOnce({ id: "user-2", email: "taken@cnus.aau.edu.et" } as never);

    const res = await request(app)
      .patch("/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "taken@cnus.aau.edu.et" });

    expect(res.status).toBe(409);
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

  it("returns 404 for an unknown account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/users/missing/promote")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 409 when the account is already an admin (no demote exists)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-2",
      role: "ADMIN",
    } as never);

    const res = await request(app)
      .post("/users/user-2/promote")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
  });

  it("returns 200 and promotes a staff account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      role: "STAFF",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      adminUserRow({ role: "ADMIN" }) as never,
    );

    const res = await request(app)
      .post("/users/user-1/promote")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("ADMIN");
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
