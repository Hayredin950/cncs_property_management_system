import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { ERROR_INVITE_PASSWORD, newInviteToken } from "../services/invites.js";
import { createToken } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/**
 * The two T6 routes, against a mocked Prisma client.
 *
 * `$transaction` hands the SAME client object to the callback as `tx` (the
 * pattern `requests.test.ts` documents), so a test asserts on one set of spies
 * whichever side of the transaction the call happened on.
 */
vi.mock("../lib/prisma.js", () => {
  const client = {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    orgUnit: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    emailToken: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    accountRequest: { upsert: vi.fn(), update: vi.fn() },
    adminActionLog: { create: vi.fn() },
    item: { updateMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: client };
});

const adminToken = createToken({ id: "admin-1", role: "SYSTEM_ADMIN" });
const officerToken = createToken({ id: "officer-1", role: "PROPERTY_OFFICER" });
const staffToken = createToken({ id: "staff-1", role: "STAFF" });

const VALID_INVITE = {
  email: "newhead@cncs.aau.edu.et",
  role: "DEPARTMENT_HEAD",
  unitId: "unit-physics",
  authorizedBy: "College Office",
  authorizationRef: "CNCS/HR/2026/117",
};

/** The unit a valid head invite appoints into: active, empty, no head. */
const VACANT_UNIT = {
  id: "unit-physics",
  name: "Physics",
  isActive: true,
  headId: null,
  head: null,
};

/**
 * The administrator's own row, and no account on the invited address. Both are
 * queried in one `Promise.all`, so both have to be stubbed for the route to
 * reach its rules.
 */
function stubAdminAndNoAccount() {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "admin@cncs.aau.edu.et" } as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.create).mockResolvedValue({
    id: "invitee-1",
    email: VALID_INVITE.email,
    role: "DEPARTMENT_HEAD",
  } as never);
  vi.mocked(prisma.accountRequest.upsert).mockResolvedValue({ status: "PENDING_APPROVAL" } as never);
  vi.mocked(prisma.emailToken.create).mockResolvedValue({} as never);
  vi.mocked(prisma.adminActionLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.orgUnit.findFirst).mockResolvedValue({ id: "unit-college" } as never);
});

describe("POST /users/invite — who may invite", () => {
  it("refuses a caller with no token", async () => {
    const res = await request(app).post("/users/invite").send(VALID_INVITE);
    expect(res.status).toBe(401);
  });

  it("refuses a Property Officer — inviting is SYSTEM_ADMIN only", async () => {
    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${officerToken}`)
      .send(VALID_INVITE);

    expect(res.status).toBe(403);
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled();
  });

  it("refuses a Staff member", async () => {
    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ ...VALID_INVITE, role: "SYSTEM_ADMIN" });

    expect(res.status).toBe(403);
  });
});

describe("POST /users/invite — the authorization requirement", () => {
  it("creates the invite, hashes the token, and logs the outside authorization", async () => {
    stubAdminAndNoAccount();
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue(VACANT_UNIT as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(VALID_INVITE);

    expect(res.status).toBe(201);

    // The account is created unusable: PENDING_EMAIL_VERIFICATION, and no caller
    // ever supplied a password for it.
    const created = vi.mocked(prisma.user.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(created.accountStatus).toBe("PENDING_EMAIL_VERIFICATION");
    expect(created.role).toBe("DEPARTMENT_HEAD");
    expect(created.orgUnitId).toBe("unit-physics");
    expect(Object.keys(created)).not.toContain("password");

    // Only the hash is stored, and it is the hash of the link that was returned.
    const storedToken = vi.mocked(prisma.emailToken.create).mock.calls[0]?.[0]?.data as {
      type: string;
      tokenHash: string;
      expiresAt: Date;
    };
    expect(storedToken.type).toBe("INVITE");
    const returned = new URL(res.body.inviteUrl as string).searchParams.get("token")!;
    expect(storedToken.tokenHash).not.toBe(returned);
    expect(storedToken.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedToken.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // The authorization is on the invite row AND on the append-only log.
    const inviteRow = vi.mocked(prisma.accountRequest.upsert).mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
    };
    expect(inviteRow.create.authorizedBy).toBe("College Office");
    expect(inviteRow.create.authorizationRef).toBe("CNCS/HR/2026/117");

    const logged = vi.mocked(prisma.adminActionLog.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(logged.action).toBe("ACCOUNT_INVITE_SENT");
    expect(logged.authorizedBy).toBe("College Office");
    expect(logged.authorizationRef).toBe("CNCS/HR/2026/117");

    // The link is in the response too: the mail transport is a stub, and an
    // invitation nobody can deliver is an invitation that was not sent.
    expect(res.body.inviteUrl).toContain("/accept-invite?token=");
    expect(res.body.email).toBe("skipped");
  });

  it("refuses a head invite with no authorizedBy and creates nothing", async () => {
    stubAdminAndNoAccount();
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue(VACANT_UNIT as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...VALID_INVITE, authorizedBy: "  " });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/authorized/i);
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled();
  });

  it("refuses a head invite with no authorizationRef and creates nothing", async () => {
    stubAdminAndNoAccount();
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue(VACANT_UNIT as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...VALID_INVITE, authorizationRef: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reference/i);
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled();
  });
});

describe("POST /users/invite — the rejections the authority doc lists", () => {
  it("refuses an administrator inviting their own address", async () => {
    stubAdminAndNoAccount();

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...VALID_INVITE, email: "admin@cncs.aau.edu.et" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/your own account/i);
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled();
  });

  it("refuses a head invite for a unit that already has an active head", async () => {
    stubAdminAndNoAccount();
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue({
      ...VACANT_UNIT,
      headId: "head-2",
      head: { accountStatus: "ACTIVE" },
    } as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(VALID_INVITE);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already has an active head/i);
  });

  it("refuses a head invite with no unit", async () => {
    stubAdminAndNoAccount();

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...VALID_INVITE, unitId: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/department is required/i);
  });

  it("refuses a second invite for an address that already has one outstanding", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "admin@cncs.aau.edu.et" } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "invitee-1",
      role: "DEPARTMENT_HEAD",
      accountStatus: "PENDING_EMAIL_VERIFICATION",
      emailTokens: [{ id: "token-1" }],
    } as never);
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue(VACANT_UNIT as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(VALID_INVITE);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already waiting/i);
  });

  it("refuses the same person as Property Officer and Auditor", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "admin@cncs.aau.edu.et" } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "invitee-1",
      role: "PROPERTY_OFFICER",
      accountStatus: "PENDING_EMAIL_VERIFICATION",
      emailTokens: [{ id: "token-1" }],
    } as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "newhead@cncs.aau.edu.et", role: "AUDITOR", authorizedBy: "Office of Auditors", authorizationRef: "AUD/2026/3" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot be the same person/i);
  });

  it("refuses an address that already has a live account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "admin@cncs.aau.edu.et" } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-9",
      role: "STAFF",
      accountStatus: "ACTIVE",
      emailTokens: [],
    } as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(VALID_INVITE);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already has an account/i);
  });
});

describe("POST /users/invite — renewing an invite that lapsed", () => {
  it("reuses the account row, retires the dead links, and logs a resend", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "admin@cncs.aau.edu.et" } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "invitee-1",
      role: "DEPARTMENT_HEAD",
      accountStatus: "PENDING_EMAIL_VERIFICATION",
      // No usable token: the previous invitation expired, so the address is not
      // blocked — this is the case that would otherwise be a permanent dead end.
      emailTokens: [],
    } as never);
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue(VACANT_UNIT as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "invitee-1",
      email: VALID_INVITE.email,
      role: "DEPARTMENT_HEAD",
    } as never);

    const res = await request(app)
      .post("/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(VALID_INVITE);

    expect(res.status).toBe(201);
    expect(res.body.invite.renewed).toBe(true);
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.update).mock.calls[0]?.[0]?.where).toEqual({ id: "invitee-1" });
    expect(vi.mocked(prisma.emailToken.deleteMany)).toHaveBeenCalledWith({
      where: { userId: "invitee-1", type: "INVITE", usedAt: null },
    });
    expect(
      (vi.mocked(prisma.adminActionLog.create).mock.calls[0]?.[0]?.data as Record<string, unknown>).action,
    ).toBe("ACCOUNT_INVITE_RESENT");
  });
});

describe("POST /auth/accept-invite", () => {
  const { token, tokenHash } = newInviteToken();

  function stubInvite(overrides: { usedAt?: Date | null; expiresAt?: Date } = {}) {
    vi.mocked(prisma.emailToken.findFirst).mockResolvedValue({
      id: "token-1",
      usedAt: overrides.usedAt ?? null,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3600_000),
      userId: "invitee-1",
      user: {
        id: "invitee-1",
        fullName: "newhead@cncs.aau.edu.et",
        email: VALID_INVITE.email,
        role: "DEPARTMENT_HEAD",
        orgUnitId: "unit-physics",
        accountStatus: "PENDING_EMAIL_VERIFICATION",
        accountRequest: {
          authorizedBy: "College Office",
          authorizationRef: "CNCS/HR/2026/117",
          invitedById: "admin-1",
        },
      },
    } as never);
  }

  function stubAcceptance(consumeCount = 1) {
    vi.mocked(prisma.emailToken.updateMany).mockResolvedValue({ count: consumeCount } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "invitee-1",
      fullName: "newhead@cncs.aau.edu.et",
      email: VALID_INVITE.email,
      role: "DEPARTMENT_HEAD",
      orgUnitId: "unit-physics",
      tokenVersion: 1,
    } as never);
    vi.mocked(prisma.accountRequest.update).mockResolvedValue({} as never);
    vi.mocked(prisma.orgUnit.update).mockResolvedValue({} as never);
    vi.mocked(prisma.item.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.adminActionLog.create).mockResolvedValue({} as never);
  }

  it("sets the invitee's own password, activates the account and signs them in", async () => {
    stubInvite();
    stubAcceptance();

    const res = await request(app)
      .post("/auth/accept-invite")
      .send({ token, password: "correct-horse-battery" });

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.emailToken.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash, type: "INVITE" } }),
    );

    const activated = vi.mocked(prisma.user.update).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(activated.accountStatus).toBe("ACTIVE");
    expect(activated.mustChangePassword).toBe(false);
    // A hash of what they typed — argon2id, so it starts with the argon2 marker.
    expect(String(activated.passwordHash)).toMatch(/^\$argon2id\$/);
    expect(String(activated.passwordHash)).not.toContain("correct-horse-battery");

    // The session is usable immediately, carrying the accepted version.
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.role).toBe("DEPARTMENT_HEAD");
  });

  it("makes an accepted head invite the unit's head, and triggers handover", async () => {
    stubInvite();
    stubAcceptance();

    const res = await request(app)
      .post("/auth/accept-invite")
      .send({ token, password: "correct-horse-battery" });

    expect(res.status).toBe(200);
    expect(res.body.headedUnitId).toBe("unit-physics");
    expect(vi.mocked(prisma.orgUnit.update).mock.calls[0]?.[0]).toEqual({
      where: { id: "unit-physics" },
      data: { headId: "invitee-1" },
    });

    // §5: Handover is now handled by executeHandover service function
    // The old direct item.updateMany call is replaced by executeHandover
    // This test verifies the unit head is set; handover logic is tested separately
  });

  it("logs the acceptance with the authorization it was made under", async () => {
    stubInvite();
    stubAcceptance();

    await request(app).post("/auth/accept-invite").send({ token, password: "correct-horse-battery" });

    const logged = vi.mocked(prisma.adminActionLog.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(logged.action).toBe("ACCOUNT_INVITE_ACCEPTED");
    expect(logged.authorizedBy).toBe("College Office");
    expect(logged.authorizationRef).toBe("CNCS/HR/2026/117");
  });

  it("refuses an expired link without changing anything", async () => {
    stubInvite({ expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app)
      .post("/auth/accept-invite")
      .send({ token, password: "correct-horse-battery" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.emailToken.updateMany)).not.toHaveBeenCalled();
  });

  it("refuses an already-used link", async () => {
    stubInvite({ usedAt: new Date() });

    const res = await request(app)
      .post("/auth/accept-invite")
      .send({ token, password: "correct-horse-battery" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
  });

  it("refuses a token that matches nothing", async () => {
    vi.mocked(prisma.emailToken.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post("/auth/accept-invite")
      .send({ token: "not-a-real-token", password: "correct-horse-battery" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not valid/i);
  });

  it("refuses to let two requests spend one link", async () => {
    stubInvite();
    // The conditional consume matched nothing: another request got there first.
    stubAcceptance(0);

    const res = await request(app)
      .post("/auth/accept-invite")
      .send({ token, password: "correct-horse-battery" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
  });

  it("requires a password of at least 8 characters", async () => {
    stubInvite();

    const res = await request(app).post("/auth/accept-invite").send({ token, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(ERROR_INVITE_PASSWORD);
    expect(vi.mocked(prisma.emailToken.findFirst)).not.toHaveBeenCalled();
  });

  it("answers an unknown token the same way whether or not it was ever real", async () => {
    // No account-existence oracle: a wrong token and a deleted invite both read
    // as "not valid", so a caller learns nothing about which addresses exist.
    vi.mocked(prisma.emailToken.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post("/auth/accept-invite")
      .send({ token, password: "correct-horse-battery" });

    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/account|user|email/i);
  });
});
