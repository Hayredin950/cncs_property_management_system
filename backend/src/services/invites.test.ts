import { describe, expect, it } from "vitest";
import {
  assertInvitable,
  ERROR_INVITE_AUTHORIZATION_REF,
  ERROR_INVITE_AUTHORIZED_BY,
  ERROR_INVITE_DUPLICATE_INVITE,
  ERROR_INVITE_EMAIL_TAKEN,
  ERROR_INVITE_ROLE_PAIR,
  ERROR_INVITE_SELF,
  ERROR_INVITE_UNIT_HEADED,
  ERROR_INVITE_UNIT_REQUIRED,
  ERROR_INVITE_UNIT_UNKNOWN,
  hashInviteToken,
  inviteBaseUrl,
  inviteExpiresAt,
  inviteUrl,
  INVITE_TTL_HOURS,
  newInviteToken,
  type InviteContext,
  type InviteRequest,
} from "./invites.js";

process.env.JWT_SECRET = "test_jwt_secret";

/** A valid head invite, which each test breaks in exactly one way. */
function request(overrides: Partial<InviteRequest> = {}): InviteRequest {
  return {
    role: "DEPARTMENT_HEAD",
    email: "newhead@cncs.aau.edu.et",
    unitId: "unit-physics",
    authorizedBy: "College Office",
    authorizationRef: "CNCS/HR/2026/117",
    ...overrides,
  };
}

function context(overrides: Partial<InviteContext> = {}): InviteContext {
  return {
    actor: { id: "admin-1", email: "admin@cncs.aau.edu.et" },
    unit: { id: "unit-physics", name: "Physics", isActive: true, headId: null, headIsActive: false },
    existingAccount: null,
    liveInviteRole: null,
    ...overrides,
  };
}

/** Runs `assertInvitable` and returns the message it threw, or null if it passed. */
function refusal(req: InviteRequest, ctx: InviteContext): string | null {
  try {
    assertInvitable(req, ctx);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("assertInvitable — the authorization fields (D3)", () => {
  it("accepts an invite that records who authorized it and under which reference", () => {
    expect(refusal(request(), context())).toBeNull();
  });

  it("refuses an invite with no authorizedBy", () => {
    expect(refusal(request({ authorizedBy: "   " }), context())).toBe(ERROR_INVITE_AUTHORIZED_BY);
  });

  it("refuses an invite with no authorizationRef", () => {
    expect(refusal(request({ authorizationRef: "" }), context())).toBe(ERROR_INVITE_AUTHORIZATION_REF);
  });

  it("checks the authorization before anything else about the payload", () => {
    // Both the authorization and the unit are wrong; the authorization is the
    // answer, because it is the requirement rather than a data problem.
    const message = refusal(request({ authorizedBy: "", unitId: null }), context());
    expect(message).toBe(ERROR_INVITE_AUTHORIZED_BY);
  });
});

describe("assertInvitable — who may be invited", () => {
  it("refuses an administrator inviting the address they are signed in as", () => {
    const message = refusal(
      request({ email: "ADMIN@cncs.aau.edu.et" }),
      context(),
    );
    expect(message).toBe(ERROR_INVITE_SELF);
  });

  it("refuses a head invite with no unit", () => {
    expect(refusal(request({ unitId: null }), context({ unit: null }))).toBe(ERROR_INVITE_UNIT_REQUIRED);
  });

  it("refuses a head invite for a unit that does not exist or is inactive", () => {
    expect(refusal(request(), context({ unit: null }))).toBe(ERROR_INVITE_UNIT_UNKNOWN);
    expect(
      refusal(request(), context({ unit: { id: "unit-physics", name: "Physics", isActive: false, headId: null, headIsActive: false } })),
    ).toBe(ERROR_INVITE_UNIT_UNKNOWN);
  });

  it("refuses a head invite for a unit that already has an active head", () => {
    expect(
      refusal(
        request(),
        context({ unit: { id: "unit-physics", name: "Physics", isActive: true, headId: "head-2", headIsActive: true } }),
      ),
    ).toBe(ERROR_INVITE_UNIT_HEADED);
  });

  it("allows a head invite for a unit whose head is not active — the unit is vacant", () => {
    // The distinction that matters: a deactivated head decides nothing, so the
    // unit needs an appointment rather than being blocked from one.
    expect(
      refusal(
        request(),
        context({ unit: { id: "unit-physics", name: "Physics", isActive: true, headId: "head-2", headIsActive: false } }),
      ),
    ).toBeNull();
  });

  it("does not require a unit for the college-wide roles", () => {
    for (const role of ["PROPERTY_OFFICER", "AUDITOR", "SYSTEM_ADMIN"] as const) {
      expect(refusal(request({ role, unitId: null }), context())).toBeNull();
    }
  });

  it("refuses an invite for an address that already has a live account", () => {
    const message = refusal(request(), context({ existingAccount: { id: "user-9", role: "PROPERTY_OFFICER" } }));
    expect(message).toBe(ERROR_INVITE_EMAIL_TAKEN);
  });
});

describe("assertInvitable — the duplicate and pair rules", () => {
  it("refuses a second invite for an address that already has one outstanding", () => {
    expect(refusal(request(), context({ liveInviteRole: "DEPARTMENT_HEAD" }))).toBe(ERROR_INVITE_DUPLICATE_INVITE);
  });

  it("refuses inviting the same person as Property Officer and Auditor", () => {
    expect(
      refusal(
        request({ role: "AUDITOR", unitId: null }),
        context({ liveInviteRole: "PROPERTY_OFFICER" }),
      ),
    ).toBe(ERROR_INVITE_ROLE_PAIR);

    expect(
      refusal(
        request({ role: "PROPERTY_OFFICER", unitId: null }),
        context({ liveInviteRole: "AUDITOR" }),
      ),
    ).toBe(ERROR_INVITE_ROLE_PAIR);
  });

  it("reports the pair conflict, not the duplicate, when both are true of the outstanding invite", () => {
    // An outstanding Auditor invite being re-invited as Auditor is a duplicate;
    // as Property Officer it is the pair. This pins the pair to the case it is
    // about, so the two messages cannot collapse into one.
    expect(refusal(request({ role: "AUDITOR", unitId: null }), context({ liveInviteRole: "AUDITOR" }))).toBe(
      ERROR_INVITE_DUPLICATE_INVITE,
    );
  });
});

describe("invite tokens", () => {
  it("hash a fresh token deterministically, and never equal the token itself", () => {
    const { token, tokenHash } = newInviteToken();
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issue two different tokens, so a link cannot be guessed from a previous one", () => {
    expect(newInviteToken().token).not.toBe(newInviteToken().token);
  });

  it("expire after the documented window", () => {
    const from = new Date("2026-10-14T00:00:00.000Z");
    expect(inviteExpiresAt(from).toISOString()).toBe(
      new Date(from.getTime() + INVITE_TTL_HOURS * 3600_000).toISOString(),
    );
  });
});

describe("invite links", () => {
  it("put the token in the fragment-free query string, and nothing else", () => {
    const link = inviteUrl("tok+en/with=chars", "https://cncs.example.edu.et");
    expect(link).toBe("https://cncs.example.edu.et/accept-invite?token=tok%2Ben%2Fwith%3Dchars");
    expect(link).not.toContain("newhead@cncs.aau.edu.et");
  });

  it("prefer APP_URL, then the deployment's own CORS origin, then localhost", () => {
    const previous = { app: process.env.APP_URL, cors: process.env.CORS_ORIGINS };

    delete process.env.APP_URL;
    delete process.env.CORS_ORIGINS;
    expect(inviteBaseUrl()).toBe("http://localhost:5173");

    process.env.CORS_ORIGINS = "https://cncs.example.edu.et,https://cncs-pms.vercel.app";
    expect(inviteBaseUrl()).toBe("https://cncs.example.edu.et");

    process.env.APP_URL = "https://pms.aau.edu.et/";
    expect(inviteBaseUrl()).toBe("https://pms.aau.edu.et");

    if (previous.app === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous.app;
    if (previous.cors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previous.cors;
  });
});
