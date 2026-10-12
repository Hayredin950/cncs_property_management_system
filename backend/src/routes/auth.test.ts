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
    },
  };
});

function createToken(payload: {
  id: string;
  role: "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "PROPERTY_OFFICER" | "DEPARTMENT_HEAD" | "STAFF" | "AUDITOR";
}) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

describe("POST /auth/register", () => {
  // Registration is ACCOUNT_MANAGE — the Account Admin role.
  const adminToken = createToken({ id: "admin-1", role: "ACCOUNT_ADMIN" });
  const staffToken = createToken({ id: "staff-1", role: "STAFF" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication & Authorization", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).post("/auth/register").send({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
        role: "STAFF",
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Missing or malformed Authorization header");
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 401 when Authorization header has an invalid token", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", "Bearer invalid-token")
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid or expired token");
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 403 when authenticated as STAFF (Admin-only route)", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Insufficient permissions");
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });
  });

  describe("Input shape validation (before touching database)", () => {
    it("returns 400 when body is empty", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 400 when name/fullName is missing or whitespace", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "   ",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 400 when email or ID is missing", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 400 when password is empty", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "",
          role: "STAFF",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 400 when role is invalid", async () => {
      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "password123",
          role: "SUPERADMIN",
        });

      expect(res.status).toBe(400);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });
  });

  describe("Conflict handling", () => {
    it("returns 409 when a user with that email already exists", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "existing-user-id",
        fullName: "Existing User",
        email: "test@example.com",
        passwordHash: "somehash",
        role: "STAFF",
        departmentId: null,
        accountStatus: "ACTIVE",
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date(),
        tokenVersion: 0,
        mustChangePassword: false,
      });

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New User",
          email: "test@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("User with this email or ID already exists");
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 409 when a user with that ID already exists", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "EMP-001",
        fullName: "Existing User",
        email: "EMP-001",
        passwordHash: "somehash",
        role: "STAFF",
        departmentId: null,
        accountStatus: "ACTIVE",
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date(),
        tokenVersion: 0,
        mustChangePassword: false,
      });

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New User",
          id: "EMP-001",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("User with this email or ID already exists");
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("returns 409 for an email that differs only by case from an existing one", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "existing-user-id",
        fullName: "Existing User",
        email: "test@example.com",
        passwordHash: "somehash",
        role: "STAFF",
        departmentId: null,
        accountStatus: "ACTIVE",
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date(),
        tokenVersion: 0,
        mustChangePassword: false,
      });

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New User",
          email: "Test@Example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(409);
      expect(prisma.user.create).not.toHaveBeenCalled();

      // The stored value is lowercased before it reaches the check, so the two
      // spellings of one address collide here instead of becoming two accounts.
      const where = vi.mocked(prisma.user.findFirst).mock.calls[0]?.[0]?.where as {
        OR: Array<{ email?: { equals: string; mode: string }; id?: string }>;
      };
      expect(where.OR[0]?.email).toEqual({
        equals: "test@example.com",
        mode: "insensitive",
      });
    });

    it("returns 409 if database unique constraint triggers (P2002)", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockRejectedValueOnce({
        code: "P2002",
        message: "Unique constraint failed",
      });

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New User",
          email: "conflict@example.com",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("User with this email or ID already exists");
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });
  });

  describe("Successful registration", () => {
    it("successfully creates a user, hashes password with argon2id, and excludes password hash", async () => {
      const mockCreatedUser = {
        id: "new-uuid-1",
        fullName: "Abebe Kebede",
        email: "abebe@cncs.aau.edu.et",
        role: "STAFF" as const,
        accountStatus: "ACTIVE" as const,
        createdAt: new Date("2026-09-02T10:00:00.000Z"),
        mustChangePassword: true,
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as never);

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Abebe Kebede",
          email: "abebe@cncs.aau.edu.et",
          password: "SuperSecretPassword456!",
          role: "STAFF",
        });

      expect(res.status).toBe(201);

      // Verify Prisma create was called with argon2id hash and never plaintext password
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const createCallData = vi.mocked(prisma.user.create).mock.calls[0]?.[0]?.data;
      expect(createCallData).toBeDefined();
      expect(createCallData?.fullName).toBe("Abebe Kebede");
      expect(createCallData?.email).toBe("abebe@cncs.aau.edu.et");
      expect(createCallData?.role).toBe("STAFF");
      expect(createCallData?.passwordHash).toMatch(/^\$argon2id\$/);
      /*
        The admin typed this password to hand on, so the account must be forced
        to replace it at the first sign-in — the same guarantee a reset gives.
        Without this the login response carries `mustChangePassword: false` and
        the client routers let the account straight into the app.
      */
      expect(createCallData?.mustChangePassword).toBe(true);
      // Plaintext password must never be stored
      expect((createCallData as Record<string, unknown>).password).toBeUndefined();

      // Verify safe response excludes password and passwordHash
      expect(res.body.id).toBe("new-uuid-1");
      expect(res.body.fullName).toBe("Abebe Kebede");
      expect(res.body.email).toBe("abebe@cncs.aau.edu.et");
      expect(res.body.role).toBe("STAFF");
      expect(res.body.password).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      // The flag travels back too, so a client can route without a second call.
      expect(res.body.mustChangePassword).toBe(true);
      expect(res.body.user.mustChangePassword).toBe(true);
    });

    it("accepts id instead of email and assigns it properly", async () => {
      const mockCreatedUser = {
        id: "STAFF-007",
        fullName: "Chaltu Desta",
        email: "STAFF-007",
        role: "STAFF" as const,
        accountStatus: "ACTIVE" as const,
        createdAt: new Date(),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as never);

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Chaltu Desta",
          id: "STAFF-007",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(201);
      const createCallData = vi.mocked(prisma.user.create).mock.calls[0]?.[0]?.data;
      expect(createCallData?.id).toBe("STAFF-007");
      expect(createCallData?.email).toBe("STAFF-007");
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("stores a registered email lowercased", async () => {
      const mockCreatedUser = {
        id: "new-uuid-2",
        fullName: "Hanna Tesfaye",
        email: "hanna@cncs.aau.edu.et",
        role: "STAFF" as const,
        accountStatus: "ACTIVE" as const,
        createdAt: new Date(),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as never);

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Hanna Tesfaye",
          email: "Hanna@CNCS.AAU.edu.et",
          password: "password123",
          role: "STAFF",
        });

      expect(res.status).toBe(201);
      const createCallData = vi.mocked(prisma.user.create).mock.calls[0]?.[0]?.data;
      expect(createCallData?.email).toBe("hanna@cncs.aau.edu.et");
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("accepts fullName instead of name", async () => {
      const mockCreatedUser = {
        id: "admin-2",
        fullName: "Marta Alamu",
        email: "marta@example.com",
        role: "SYSTEM_ADMIN" as const,
        createdAt: new Date(),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as never);

      const res = await request(app)
        .post("/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fullName: "Marta Alamu",
          email: "marta@example.com",
          password: "password123",
          role: "SYSTEM_ADMIN",
        });

      expect(res.status).toBe(201);
      expect(res.body.fullName).toBe("Marta Alamu");
      expect(res.body.role).toBe("SYSTEM_ADMIN");
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });
  });
});

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
  };

  // This file's earlier suites create rows, and `not.toHaveBeenCalled()` below is a
  // statement about *this* test — so the counters start clean per case.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending account, normalises the email, and issues no token", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: "pending-1",
      fullName: REQUEST_BODY.fullName,
      email: "hanna@cncs.aau.edu.et",
      accountStatus: "PENDING_APPROVAL",
      createdAt: new Date("2026-10-12T10:00:00.000Z"),
    } as never);

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
  });

  it("does not require a token — asking is public, approving is not", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: "pending-1",
      fullName: REQUEST_BODY.fullName,
      email: "hanna@cncs.aau.edu.et",
      accountStatus: "PENDING_APPROVAL",
      createdAt: new Date(),
    } as never);

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
      departmentId: null,
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
      departmentId: null,
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
