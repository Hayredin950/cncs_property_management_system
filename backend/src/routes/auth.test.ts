import argon2 from "argon2";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => {
  return {
    prisma: {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      // The account-request intake resolves the applicant's unit before it can
      // write anything — a request that names no real unit cannot be scoped to
      // a head, so it is refused rather than filed as an orphan.
      orgUnit: {
        findFirst: vi.fn(),
      },
      accountRequest: {
        create: vi.fn(),
      },
      // The user row and its request row are written together, in one
      // transaction, so a request can never exist without its queue row.
      $transaction: vi.fn(),
    },
  };
});

function createToken(payload: {
  id: string;
  role: "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "PROPERTY_OFFICER" | "DEPARTMENT_HEAD" | "STAFF" | "AUDITOR";
}) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("POST /auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully logs in with valid credentials, returning a signed JWT and safe user object", async () => {
    const rawPassword = "ValidPassword123!";
    const passwordHash = await argon2.hash(rawPassword, { type: argon2.argon2id });

    const mockUser = {
      id: "user-42",
      fullName: "Dawit Bekele",
      email: "dawit@cncs.aau.edu.et",
      passwordHash,
      role: "STAFF" as const,
      accountStatus: "ACTIVE" as const,
      createdAt: new Date("2026-09-02T10:00:00.000Z"),
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser as never);

    const res = await request(app).post("/auth/login").send({
      email: "dawit@cncs.aau.edu.et",
      password: rawPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // Verify JWT payload contains ONLY id and role, no PII (no name, email, etc.)
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(decoded.id).toBe("user-42");
    expect(decoded.role).toBe("STAFF");
    expect(decoded.email).toBeUndefined();
    expect(decoded.fullName).toBeUndefined();
    expect(decoded.name).toBeUndefined();
    expect(decoded.exp).toBeDefined(); // Explicit expiration set

    // Verify safe user payload and exclusion of password/hash
    expect(res.body.id).toBe("user-42");
    expect(res.body.fullName).toBe("Dawit Bekele");
    expect(res.body.email).toBe("dawit@cncs.aau.edu.et");
    expect(res.body.role).toBe("STAFF");
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(passwordHash);
  });

  it("matches the email without regard to case", async () => {
    const rawPassword = "ValidPassword123!";
    const passwordHash = await argon2.hash(rawPassword, { type: argon2.argon2id });

    const mockUser = {
      id: "user-44",
      fullName: "Sara Mekonnen",
      email: "sara@cncs.aau.edu.et",
      passwordHash,
      role: "STAFF" as const,
      accountStatus: "ACTIVE" as const,
      createdAt: new Date(),
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser as never);

    const res = await request(app).post("/auth/login").send({
      email: "Sara@CNCS.AAU.EDU.ET",
      password: rawPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("user-44");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    /**
     * The address is what a person types, so it is matched as typed but without
     * regard to case; the `id` arm stays exact, because an id is an identifier
     * and two ids differing only by case are two ids.
     */
    const where = vi.mocked(prisma.user.findFirst).mock.calls[0]?.[0]?.where as {
      OR: Array<{ email?: { equals: string; mode: string }; id?: string }>;
    };
    expect(where.OR[0]?.email).toEqual({
      equals: "Sara@CNCS.AAU.EDU.ET",
      mode: "insensitive",
    });
    expect(where.OR[1]).toEqual({ id: "Sara@CNCS.AAU.EDU.ET" });
  });

  it("successfully logs in using ID instead of email", async () => {
    const rawPassword = "ValidPassword123!";
    const passwordHash = await argon2.hash(rawPassword, { type: argon2.argon2id });

    const mockUser = {
      id: "STAFF-999",
      fullName: "Aster Aweke",
      email: "STAFF-999",
      passwordHash,
      role: "STAFF" as const,
      accountStatus: "ACTIVE" as const,
      createdAt: new Date(),
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser as never);

    const res = await request(app).post("/auth/login").send({
      id: "STAFF-999",
      password: rawPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.id).toBe("STAFF-999");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("surfaces mustChangePassword so a first sign-in is sent to the change screen", async () => {
    const rawPassword = "Temporary123!";
    const passwordHash = await argon2.hash(rawPassword, { type: argon2.argon2id });

    // A freshly registered account: the server created it flagged.
    const mockUser = {
      id: "new-user-1",
      fullName: "New Holder",
      email: "new.holder@cncs.aau.edu.et",
      passwordHash,
      role: "STAFF" as const,
      accountStatus: "ACTIVE" as const,
      createdAt: new Date(),
      tokenVersion: 0,
      mustChangePassword: true,
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser as never);

    const res = await request(app).post("/auth/login").send({
      email: "new.holder@cncs.aau.edu.et",
      password: rawPassword,
    });

    expect(res.status).toBe(200);
    /*
      This is the contract the web `RequireAuth` and the mobile go_router guard
      branch on: the flag has to survive into the login response (here and in the
      nested user object) or the "forced" change is silently skipped and the
      account keeps the administrator-typed password.
    */
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it("rejects login with generic error when user is not found", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);

    const res = await request(app).post("/auth/login").send({
      email: "nonexistent@cncs.aau.edu.et",
      password: "somePassword123",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
    expect(res.body.token).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("rejects login with same generic error when password is wrong", async () => {
    const correctPassword = "CorrectPassword123!";
    const passwordHash = await argon2.hash(correctPassword, { type: argon2.argon2id });

    const mockUser = {
      id: "user-43",
      fullName: "Tadesse Gemechu",
      email: "tadesse@cncs.aau.edu.et",
      passwordHash,
      role: "STAFF" as const,
      accountStatus: "ACTIVE" as const,
      createdAt: new Date(),
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser as never);

    const res = await request(app).post("/auth/login").send({
      email: "tadesse@cncs.aau.edu.et",
      password: "WrongPassword123!",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
    expect(res.body.token).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(passwordHash);
  });

  it("rejects login when email/id or password is missing (400 Bad Request)", async () => {
    const res1 = await request(app).post("/auth/login").send({
      password: "password123",
    });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toBeDefined();

    const res2 = await request(app).post("/auth/login").send({
      email: "test@example.com",
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBeDefined();
  });
});

describe("GET /auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the authenticated user profile excluding password hash with valid token", async () => {
    const token = createToken({ id: "user-profile-1", role: "SYSTEM_ADMIN" });

    const mockUser = {
      id: "user-profile-1",
      fullName: "Eleni Gebre",
      email: "eleni@cncs.aau.edu.et",
      role: "SYSTEM_ADMIN" as const,
      createdAt: new Date("2026-09-02T10:00:00.000Z"),
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("user-profile-1");
    expect(res.body.fullName).toBe("Eleni Gebre");
    expect(res.body.email).toBe("eleni@cncs.aau.edu.et");
    expect(res.body.role).toBe("SYSTEM_ADMIN");
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("rejects request with 401 when Authorization header is missing", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing or malformed Authorization header");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("rejects request with 401 when token is invalid or expired", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired token");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("returns 404 when user from token is no longer in the database", async () => {
    const token = createToken({ id: "deleted-user", role: "STAFF" });

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});

/**
 * `POST /auth/account-requests` — the door the supervisor's feedback asked for
 * (spec 3.1.2).
 *
 * The rule under test is one sentence: **nobody self-registers into an active
 * account.** Knocking on this door creates a `PENDING_APPROVAL` row and no token,
 * so the next thing the person can do is wait — the decision belongs to
 * `POST /users/:id/approve`, and to somebody else.
 */
describe("POST /auth/account-requests", () => {
  const REQUEST_BODY = {
    fullName: "Hanna Tesfaye",
    email: "Hanna@cncs.aau.edu.et",
    password: "ChosenByMe123",
    department: "Computer Science",
  };

  // This file's earlier suites create rows, and `not.toHaveBeenCalled()` below is a
  // statement about *this* test — so the counters start clean per case.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The unit the applicant asked for. The intake resolves it before writing
   * anything — a request has to land in a real unit or the approval queue has
   * no way to scope it to a head.
   */
  const CS_UNIT = {
    id: "unit-cs",
    name: "Computer Science",
    isActive: true,
    acceptsSelfReg: true,
  };

  /** The transaction callback the route runs, with both writes mocked. */
  function mockTransaction() {
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: "pending-1",
      fullName: REQUEST_BODY.fullName,
      email: "hanna@cncs.aau.edu.et",
      accountStatus: "PENDING_APPROVAL",
      createdAt: new Date("2026-10-12T10:00:00.000Z"),
    } as never);
    vi.mocked(prisma.accountRequest.create).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      (async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: prisma.user,
          accountRequest: prisma.accountRequest,
        })) as never,
    );
  }

  it("creates a pending account, normalises the email, and issues no token", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.orgUnit.findFirst).mockResolvedValueOnce(CS_UNIT as never);
    mockTransaction();

    const res = await request(app).post("/auth/account-requests").send(REQUEST_BODY);

    expect(res.status).toBe(201);
    expect(res.body.request.accountStatus).toBe("PENDING_APPROVAL");
    // No token, no user object: there is nothing this request may do yet, and a
    // token would be a session the login gate refuses anyway.
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const call = vi.mocked(prisma.user.create).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.email).toBe("hanna@cncs.aau.edu.et");
    expect(call.data.accountStatus).toBe("PENDING_APPROVAL");
    // A request asks as STAFF and carries no role field at all, so no payload turns
    // a request into a privileged account.
    expect(call.data.role).toBe("STAFF");
    // The person chose this password (spec 3.3.7/12.5), so there is no shared
    // secret to replace and nothing to force a change of.
    expect(call.data.mustChangePassword).toBeUndefined();
    // The request is filed against a REAL unit — this is what makes it visible
    // to that unit's head and nobody else's.
    expect(call.data.orgUnitId).toBe("unit-cs");
    // The legacy `department` free-text column is gone from the schema; writing
    // it was what made every sign-up fail with a Prisma validation error.
    expect(call.data.department).toBeUndefined();
  });

  it("files the queue row in the same transaction, so a request cannot exist without one", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.orgUnit.findFirst).mockResolvedValueOnce(CS_UNIT as never);
    mockTransaction();

    const res = await request(app).post("/auth/account-requests").send(REQUEST_BODY);

    expect(res.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalled();
    const requestCall = vi.mocked(prisma.accountRequest.create).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(requestCall.data.userId).toBe("pending-1");
    expect(requestCall.data.requestedUnitId).toBe("unit-cs");
    expect(requestCall.data.status).toBe("PENDING_APPROVAL");
  });

  it("refuses a request that names a department the college does not have", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.orgUnit.findFirst).mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/auth/account-requests")
      .send({ ...REQUEST_BODY, department: "Astrology" });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  /**
   * The regression that blocked every sign-up on the deployment (28 Oct): the
   * web form's select carries a unit **id**, and it was posted under
   * `department`, which the server resolves as a **name**. Every applicant was
   * told "Unknown department. Pick one from the list." after picking one.
   *
   * The client now sends `departmentId`; these two cases pin both halves of the
   * fix so the key/value pair cannot drift again.
   */
  it("resolves the unit from departmentId, the key both clients now send", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.orgUnit.findFirst).mockResolvedValueOnce(CS_UNIT as never);
    mockTransaction();

    const res = await request(app)
      .post("/auth/account-requests")
      .send({
        ...REQUEST_BODY,
        department: undefined,
        departmentId: "f68bf808-2ce1-441e-b16c-13d421255ac7",
      });

    expect(res.status).toBe(201);
    expect(prisma.orgUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f68bf808-2ce1-441e-b16c-13d421255ac7" },
      }),
    );
    const call = vi.mocked(prisma.user.create).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.orgUnitId).toBe("unit-cs");
  });

  it("still accepts a UUID sent under department, so a rolled-back client can sign up", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.orgUnit.findFirst).mockResolvedValueOnce(CS_UNIT as never);
    mockTransaction();

    const res = await request(app)
      .post("/auth/account-requests")
      .send({ ...REQUEST_BODY, department: "f68bf808-2ce1-441e-b16c-13d421255ac7" });

    expect(res.status).toBe(201);
    expect(prisma.orgUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f68bf808-2ce1-441e-b16c-13d421255ac7" },
      }),
    );
  });

  it("refuses a request from an address outside the institution", async () => {
    const res = await request(app)
      .post("/auth/account-requests")
      .send({ ...REQUEST_BODY, email: "hanna@gmail.com" });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("does not require a token — asking is public, approving is not", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.orgUnit.findFirst).mockResolvedValueOnce(CS_UNIT as never);
    mockTransaction();

    const res = await request(app).post("/auth/account-requests").send(REQUEST_BODY);

    expect(res.status).toBe(201);
  });

  it("rejects a short password and a malformed email", async () => {
    const shortPassword = await request(app)
      .post("/auth/account-requests")
      .send({ ...REQUEST_BODY, password: "short" });
    expect(shortPassword.status).toBe(400);

    const badEmail = await request(app)
      .post("/auth/account-requests")
      .send({ ...REQUEST_BODY, email: "not-an-email" });
    expect(badEmail.status).toBe(400);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("answers 409 for an address that already has a row, pending or not", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: "pending-1" } as never);

    const res = await request(app).post("/auth/account-requests").send(REQUEST_BODY);

    expect(res.status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

/**
 * The other end of the same rule: a status that is not `ACTIVE` cannot sign in,
 * however good the password is.
 *
 * 403 with the reason rather than 401 "Invalid credentials" — the credential check
 * passed, and telling someone their password is wrong when the real answer is
 * "nobody has approved you yet" is the unhelpful half of the same message.
 */
describe("POST /auth/login — account status gate", () => {
  const RAW_PASSWORD = "CorrectHorseBattery1";

  async function loginAs(accountStatus: string) {
    const passwordHash = await argon2.hash(RAW_PASSWORD, { type: argon2.argon2id });
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: "user-90",
      fullName: "Hanna Tesfaye",
      email: "hanna@cncs.aau.edu.et",
      passwordHash,
      role: "STAFF" as const,
      accountStatus,
      orgUnitId: null,
      createdAt: new Date(),
      tokenVersion: 0,
      mustChangePassword: false,
    } as never);

    return request(app)
      .post("/auth/login")
      .send({ email: "hanna@cncs.aau.edu.et", password: RAW_PASSWORD });
  }

  it("refuses a request nobody has approved yet", async () => {
    const res = await loginAs("PENDING_APPROVAL");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/waiting for approval/i);
    expect(res.body.token).toBeUndefined();
  });

  it("refuses a rejected account and a deactivated one", async () => {
    const rejected = await loginAs("REJECTED");
    expect(rejected.status).toBe(403);
    expect(rejected.body.error).toMatch(/declined/i);

    const deactivated = await loginAs("DEACTIVATED");
    expect(deactivated.status).toBe(403);
    expect(deactivated.body.error).toMatch(/deactivated/i);
  });

  it("still answers a plain 401 for a wrong password, whatever the status", async () => {
    // The status gate runs after the password check on purpose: telling an
    // unauthenticated caller that an address has a pending account would make this
    // endpoint an account-existence oracle.
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: "user-90",
      fullName: "Hanna Tesfaye",
      email: "hanna@cncs.aau.edu.et",
      passwordHash: await argon2.hash(RAW_PASSWORD, { type: argon2.argon2id }),
      role: "STAFF" as const,
      accountStatus: "PENDING_APPROVAL",
      orgUnitId: null,
      createdAt: new Date(),
      tokenVersion: 0,
      mustChangePassword: false,
    } as never);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "hanna@cncs.aau.edu.et", password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });
});
