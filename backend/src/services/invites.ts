import argon2 from "argon2";
import crypto from "node:crypto";
import { httpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { normalizeEmail } from "../utils/email.js";
import { executeHandover } from "./handover.js";

/**
 * Privileged account invites (T6) — the only door a Head, Property Officer,
 * Auditor or SYSTEM_ADMIN account can come through.
 *
 * ── Why there is no admin-set password here ────────────────────────────────
 * The legacy flow this replaces (`POST /auth/register`) had an administrator type
 * a password and read it out loud, then handed over an account already `ACTIVE`
 * with whatever role was picked at that moment. Two things are wrong with that
 * and both are the requirements this file exists to meet:
 *
 *   1. **The administrator knows the credential.** Nothing records that they
 *      gave it up, and the account is only as private as that conversation. Here
 *      the row is created with a password hash of a random secret nobody holds,
 *      the account stays `PENDING_EMAIL_VERIFICATION`, and the invitee is the
 *      only person who ever types a password — into `POST /auth/accept-invite`.
 *   2. **The authorization is invisible.** D3 (authority doc §1): no role inside
 *      the app sits above a Head, an Officer or an Auditor, so SYSTEM_ADMIN
 *      cannot verify who was appointed. The appointing authority is outside the
 *      system, and `authorizedBy` + `authorizationRef` are how the system records
 *      that the decision was made elsewhere rather than pretending to make it.
 *      They are **required**, not optional, and they are copied onto the
 *      append-only `AdminActionLog` row so the record survives any later edit of
 *      the invite.
 *
 * ── Where the rules live ───────────────────────────────────────────────────
 * `assertInvitable` is pure: it takes the facts it needs and throws `HttpError`.
 * Two reasons, and they are the same two reasons the rest of this codebase splits
 * this way — the rules are tested directly instead of through a mocked database,
 * and the route calls them *before* any write, so a rejected invite cannot leave
 * a half-created account behind.
 */

/** The roles D2 says are never self-registered. Anyone else asks for an account. */
export const INVITABLE_ROLES = [
  "DEPARTMENT_HEAD",
  "PROPERTY_OFFICER",
  "AUDITOR",
  "ACCOUNT_ADMIN",
  "SYSTEM_ADMIN",
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * Error strings are exported constants, for the reason `accountApproval.ts` gives:
 * the route, the tests and both clients quote them, and a reworded copy in one
 * place would silently stop matching.
 *
 * Each one names the *fact* that failed, not the field. "An authorization
 * reference is required" tells an administrator what to go and find; "invalid
 * payload" tells them to guess.
 */
export const ERROR_INVITE_AUTHORIZED_BY = "Record who authorized this account outside the system — a name or office is required";
export const ERROR_INVITE_AUTHORIZATION_REF = "Record the letter number or equivalent reference for that authorization";
export const ERROR_INVITE_SELF = "You cannot invite your own account — a second System Admin has to invite you";
export const ERROR_INVITE_UNIT_REQUIRED = "A department is required when inviting a department head";
export const ERROR_INVITE_UNIT_UNKNOWN = "That department does not exist or is not active";
export const ERROR_INVITE_UNIT_HEADED = "That department already has an active head";
export const ERROR_INVITE_DUPLICATE_INVITE = "An invite for this address is already waiting to be accepted";
export const ERROR_INVITE_EMAIL_TAKEN =
  "This email already has an account. Change that account's role instead of inviting it again.";
export const ERROR_INVITE_ROLE_PAIR =
  "Property Officer and Auditor cannot be the same person, and this address already holds the other one.";
export const ERROR_INVITE_INVALID = "This invite link is not valid. Ask an administrator for a new one.";
export const ERROR_INVITE_USED = "This invite link has already been used. Ask an administrator for a new one.";
export const ERROR_INVITE_EXPIRED = "This invite link has expired. Ask an administrator for a new one.";
export const ERROR_INVITE_PASSWORD = "Choose a password of at least 8 characters";

/**
 * How long an invite stays usable.
 *
 * An invite is a credential-bearing link in an email, so it must expire, and the
 * window has to be long enough for a real appointee to get to it. Three days is
 * the compromise: long enough to survive a weekend, short enough that a link
 * forwarded to the wrong mailbox is not indefinitely live. Unlike the accept
 * step, an expired invite is not lost work — the invite row survives with its
 * authorization fields, so an administrator can see the appointment happened and
 * issue a new link.
 */
export const INVITE_TTL_HOURS = 72;

/** The complementary pair one person may not hold (authority doc §2). */
const PAIR: Record<string, string> = {
  PROPERTY_OFFICER: "AUDITOR",
  AUDITOR: "PROPERTY_OFFICER",
};

/**
 * A fresh single-use token and the hash that goes in the database.
 *
 * Only the hash is stored, exactly as with a password: a leaked database read
 * then yields nothing that can be replayed against `POST /auth/accept-invite`.
 * 32 random bytes is far beyond guessing, and base64url keeps it safe in a URL
 * and in a query string without escaping.
 */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/** sha256, not argon2: the token is high-entropy already, so it needs no stretching. */
export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function inviteExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * The hash an invited-but-unaccepted account carries: argon2id over a random
 * 32-byte secret that is discarded on the spot.
 *
 * Why a real hash at all, rather than a sentinel string like `"!invited"`: the
 * column is not nullable, and — the part that decides it — `argon2.verify`
 * **throws** on a malformed encoding. A sentinel would turn "sign in with an
 * invited address before accepting" from the 403 refusal `signInRefusal` gives
 * for `PENDING_EMAIL_VERIFICATION` into a 500 from the password check that runs
 * first. A real hash of an unknowable secret makes that path answer false, which
 * is the truth.
 *
 * Computed **once and reused** for every invite. Each hash costs ~800 ms at
 * argon2id's defaults, which is time an administrator spends staring at an invite
 * button, and re-deriving it per invite buys nothing: the secret is never
 * revealed, never stored, and cannot be produced by anyone else, so no holder of
 * it exists for a shared value to leak. What it must not be is guessable, and 32
 * random bytes is not.
 */
let placeholderHash: string | null = null;

async function unusablePasswordHash(): Promise<string> {
  if (placeholderHash) return placeholderHash;
  const hash = await argon2.hash(crypto.randomBytes(32).toString("hex"), {
    type: argon2.argon2id,
  });
  placeholderHash = hash;
  return hash;
}

/**
 * The origin the invite link points at.
 *
 * Read inside the function, never at module load — the same rule
 * `services/email.ts` follows, so a test can set the variable and get an answer.
 * `APP_URL` is the explicit setting; `CORS_ORIGINS` is the browsable frontend
 * origin the deployment has *already* had to configure, so falling back to its
 * first entry means a working deployment needs no second variable. localhost is
 * the development default and is never right in production, where CORS_ORIGINS is
 * required to be set anyway.
 */
export function inviteBaseUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const fromCors = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)[0];
  if (fromCors) return fromCors.replace(/\/+$/, "");

  return "http://localhost:5173";
}

/**
 * The link the invitee opens. The token is the only thing in it — no email, no
 * role, nothing that would let someone reading a forwarded link learn who it was
 * for.
 */
export function inviteUrl(token: string, baseUrl: string = inviteBaseUrl()): string {
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

export interface InviteRequest {
  role: InvitableRole;
  email: string;
  unitId: string | null;
  authorizedBy: string;
  authorizationRef: string;
  authorizationNote?: string | null;
}

export interface InviteContext {
  /** The administrator issuing the invite. */
  actor: { id: string; email: string };
  /**
   * The unit named by `unitId`, or null when the id names nothing.
   * `headIsActive` is what makes "already has a head" mean a *working* head: a
   * unit whose head has been deactivated is vacant, which is the whole point of
   * `resolveApprover`'s fallback.
   */
  unit: { id: string; name: string; isActive: boolean; headId: string | null; headIsActive: boolean } | null;
  /**
   * A live account already registered under the invited address, if any.
   *
   * "Live" excludes a lapsed invite: an account still `PENDING_EMAIL_VERIFICATION`
   * whose link has expired has never been used by anyone, so it is not a duplicate
   * — it is an invitation that ran out, and re-inviting is how it is renewed.
   */
  existingAccount: { id: string; role: string } | null;
  /** The role on an invite for this address that is still usable (unused, unexpired). */
  liveInviteRole: string | null;
}

/**
 * Every rule the authority doc's T6/§4 lists, checked before anything is written.
 *   * Order matters for the messages, not for the outcome: self-invite is checked
   * before the duplicates because "you cannot invite your own account" is true
   * whatever else is wrong, and is the more useful answer when both are true. The
   * outstanding-invite checks come before the account check for the same reason:
   * the second invite for one address is a duplicate *invite*, and saying so is
   * more useful than "this email already has an account" — which is also true,
   * because an unaccepted invite does have an account row behind it.
 *
 * Note what is deliberately *not* here: a duplicate of the unit check for the
 * college-wide roles. A unit only means something for a head — Property
 * Officers, Auditors and System Admins are college-scoped — so an invite for one
 * of them carries no unit at all.
 */
export function assertInvitable(request: InviteRequest, context: InviteContext): void {
  const email = normalizeEmail(request.email);
  const authorizedBy = request.authorizedBy.trim();
  const authorizationRef = request.authorizationRef.trim();

  /**
   * D3, enforced. These two are the difference between "the system decided" and
   * "the system recorded who decided", and only the second one is true: nothing
   * in the app outranks the person being appointed.
   */
  if (!authorizedBy) {
    throw httpError(400, ERROR_INVITE_AUTHORIZED_BY, { field: "authorizedBy" });
  }
  if (!authorizationRef) {
    throw httpError(400, ERROR_INVITE_AUTHORIZATION_REF, { field: "authorizationRef" });
  }

  if (email === normalizeEmail(context.actor.email)) {
    throw httpError(400, ERROR_INVITE_SELF);
  }

  if (request.role === "DEPARTMENT_HEAD") {
    if (!request.unitId) {
      throw httpError(400, ERROR_INVITE_UNIT_REQUIRED, { field: "unitId" });
    }
    if (!context.unit || !context.unit.isActive) {
      throw httpError(400, ERROR_INVITE_UNIT_UNKNOWN, { field: "unitId" });
    }
    /**
     * One active head per unit (authority doc §2). A head whose account is not
     * ACTIVE does not count — they cannot decide anything, so the unit is vacant
     * and an appointment is exactly what is needed.
     */
    if (context.unit.headId && context.unit.headIsActive) {
      throw httpError(400, ERROR_INVITE_UNIT_HEADED, { field: "unitId" });
    }
  }

  if (context.liveInviteRole) {
    /**
     * Row 14 of the live-verification table. Checked against the *outstanding
     * invite* as well as the account because the pair is what is forbidden, not
     * the second invite on its own: a Property Officer invite that has not been
     * accepted still means this person is on their way to holding it.
     */
    if (PAIR[context.liveInviteRole] === request.role) {
      throw httpError(409, ERROR_INVITE_ROLE_PAIR);
    }
    throw httpError(409, ERROR_INVITE_DUPLICATE_INVITE);
  }

  /**
   * An account already exists for this address. That is a promotion, not an
   * invite, and `POST /users/:id/promote` is the operation for it — allowing the
   * invite would create a second row for one person, and two rows is how the
   * identity, the audit trail and the tokenVersion all start to disagree.
   */
  if (context.existingAccount) {
    throw httpError(409, ERROR_INVITE_EMAIL_TAKEN);
  }
}

export interface CreatedInvite {
  userId: string;
  email: string;
  role: InvitableRole;
  unitId: string | null;
  status: string;
  expiresAt: Date;
  /** The single-use link. Returned to the issuing administrator, never stored raw. */
  inviteUrl: string;
}

/**
 * Creates the invite: the account row, the `AccountRequest` that carries the
 * authorization, the single-use token, and the log entry — in one transaction, so
 * an invite that is reported as sent cannot be missing its authorization record.
 *
 * The account is created `PENDING_EMAIL_VERIFICATION` with a **hash of a random
 * secret** in `passwordHash`. `passwordHash` is not nullable, and a sentinel
 * string would be worse than this: `argon2.verify` against a malformed hash
 * throws, which would turn "sign in with the invitee's email before they accept"
 * into a 500 instead of the refusal it should be. Hashing 32 random bytes costs
 * one argon2 call per invite — paid once, by an administrator, on a screen that
 * already waits on the database.
 */
export async function createPrivilegedInvite(
  request: InviteRequest,
  actor: { id: string; email: string },
  /**
   * Set when this invite renews a lapsed one: the account row still exists in
   * `PENDING_EMAIL_VERIFICATION` and is reused rather than duplicated. See
   * `InviteContext.existingAccount` for why a lapsed invite is not a duplicate.
   */
  reissueUserId?: string | null,
): Promise<CreatedInvite> {
  const email = normalizeEmail(request.email);
  const requestedUnitId = request.role === "DEPARTMENT_HEAD" ? request.unitId! : null;

  const { token, tokenHash } = newInviteToken();
  const expiresAt = inviteExpiresAt();
  const placeholder = await unusablePasswordHash();

  /**
   * `requestedUnitId` is required and non-null on `AccountRequest`, which is
   * shaped for staff self-registration into a unit. A college-wide invite has no
   * unit of its own, so it records the acting department's unit when there is one
   * and the college root otherwise — the column has to hold something, and "the
   * college" is the honest value for a role that covers the college.
   */
  const unitId =
    requestedUnitId ??
    (await prisma.orgUnit.findFirst({ where: { type: "COLLEGE" }, select: { id: true } }))?.id;

  if (!unitId) {
    throw httpError(500, "No unit is configured for this invite. Seed the college unit first.");
  }

  const created = await prisma.$transaction(async (tx) => {
    /**
     * A renewal rewrites the same row and retires every earlier link for it. The
     * superseded tokens are deleted rather than marked used: "used" would claim
     * somebody accepted an invitation they never opened, and the trail that
     * matters — who authorized what — is on the log below, not on the token.
     */
    if (reissueUserId) {
      await tx.emailToken.deleteMany({
        where: { userId: reissueUserId, type: "INVITE", usedAt: null },
      });
    }

    const user = reissueUserId
      ? await tx.user.update({
          where: { id: reissueUserId },
          data: {
            role: request.role,
            orgUnitId: requestedUnitId,
            passwordHash: placeholder,
            accountStatus: "PENDING_EMAIL_VERIFICATION",
          },
          select: { id: true, email: true, role: true },
        })
      : await tx.user.create({
          data: {
            fullName: email,
            email,
            passwordHash: placeholder,
            role: request.role,
            orgUnitId: requestedUnitId,
            accountStatus: "PENDING_EMAIL_VERIFICATION",
            mustChangePassword: false,
          },
          select: { id: true, email: true, role: true },
        });

    const inviteFields = {
      authorizedBy: request.authorizedBy.trim(),
      authorizationRef: request.authorizationRef.trim(),
      authorizationNote: request.authorizationNote?.trim() || null,
      invitedById: actor.id,
      invitedAt: new Date(),
    };

    const request_ = await tx.accountRequest.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        requestedUnitId: unitId,
        status: "PENDING_APPROVAL",
        ...inviteFields,
      },
      update: {
        requestedUnitId: unitId,
        status: "PENDING_APPROVAL",
        decidedAt: null,
        decidedById: null,
        decisionNote: null,
        rejectionReason: null,
        ...inviteFields,
      },
      select: { status: true },
    });

    await tx.emailToken.create({
      data: { userId: user.id, type: "INVITE", tokenHash, expiresAt },
    });

    /**
     * §0.4: every state-changing account action is logged, append-only, and the
     * log carries the outside-system authorization with it. The invite row can be
     * re-read; this cannot be rewritten.
     */
    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: reissueUserId ? "ACCOUNT_INVITE_RESENT" : "ACCOUNT_INVITE_SENT",
        targetUserId: user.id,
        unitId: requestedUnitId,
        after: {
          email: user.email,
          role: user.role,
          authorizedBy: request.authorizedBy.trim(),
          authorizationRef: request.authorizationRef.trim(),
          expiresAt: expiresAt.toISOString(),
        },
        authorizedBy: request.authorizedBy.trim(),
        authorizationRef: request.authorizationRef.trim(),
      },
    });

    return { userId: user.id, status: request_.status };
  });

  return {
    userId: created.userId,
    email,
    role: request.role,
    unitId: requestedUnitId,
    status: created.status,
    expiresAt,
    inviteUrl: inviteUrl(token),
  };
}

export interface AcceptedInvite {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  /**
   * The account's session version, returned so the route can mint a token without
   * a second read: `authenticate` compares this against the row, and a token
   * carrying a stale value would be refused the moment it was handed out.
   */
  tokenVersion: number;
  /** Set when the accepted invite made this person the head of a unit. */
  headedUnitId: string | null;
}

/**
 * `POST /auth/accept-invite`'s whole body: consume the token, set the password the
 * invitee chose, and let the account in.
 *
 * Three properties this has to have, and where each one comes from:
 *
 *   - **Single use, even under a race.** The token is consumed with a conditional
 *     `updateMany` (`usedAt: null` in the `where`), so two requests arriving
 *     together cannot both see an unused token and both proceed: the second one's
 *     update matches zero rows and is refused. Checking `usedAt` and then writing
 *     it would leave exactly that window.
 *   - **Nothing happens on an expired or used link.** The lookup happens before
 *     the transaction and refuses there, so an expired link changes no row at all
 *     — row 19 of the live-verification table.
 *   - **The authorization record survives.** `authorizedBy`/`authorizationRef`
 *     are copied from the invite onto the log row, so accepting can be traced to
 *     the appointment that allowed it.
 *
 * The one thing this does *not* do is re-check whether the unit still has a head.
 * Two accepts of two different invites for one unit cannot both happen — the
 * second invite could not have been issued (`ERROR_INVITE_UNIT_HEADED`) — and the
 * update below is the last word either way.
 */
export async function acceptInvite(input: {
  token: string;
  password: string;
  /**
   * The invitee's own name, asked for here because the invite does not ask
   * anybody else for it. An invitation is addressed to an email and an
   * appointment, not to a name — and the alternative is an account whose display
   * name is its email address until an administrator edits it, which is what the
   * first run of this flow produced.
   *
   * Optional, and skipped when blank: the account keeps the email as its name
   * rather than being set to an empty string, which `fullName` (non-nullable, and
   * rendered in lists and pickers) has no sensible use for.
   */
  fullName?: string | undefined;
}): Promise<AcceptedInvite> {
  const tokenHash = hashInviteToken(input.token);

  const record = await prisma.emailToken.findFirst({
    where: { tokenHash, type: "INVITE" },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          orgUnitId: true,
          accountStatus: true,
          accountRequest: {
            select: { authorizedBy: true, authorizationRef: true, invitedById: true },
          },
        },
      },
    },
  });

  if (!record) {
    throw httpError(400, ERROR_INVITE_INVALID);
  }
  if (record.usedAt) {
    throw httpError(400, ERROR_INVITE_USED);
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw httpError(400, ERROR_INVITE_EXPIRED);
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const fullName = input.fullName?.trim();

  return prisma.$transaction(async (tx) => {
    // Claim the token first: if another request got here first, this matches
    // nothing and the whole acceptance is refused before any account changes.
    const claimed = await tx.emailToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw httpError(400, ERROR_INVITE_USED);
    }

    const user = await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        ...(fullName ? { fullName } : {}),
        mustChangePassword: false,
        accountStatus: "ACTIVE",
        // A fresh account has no sessions to revoke, but the bump keeps the
        // invariant "role or credential changed ⇒ old tokens die" unconditional.
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        orgUnitId: true,
        tokenVersion: true,
      },
    });

    /**
     * The invite has served its purpose. Marking the request APPROVED records the
     * decision, and the reason says *why* it was approved: an administrator put
     * their name and a letter number behind it, which is a different fact from a
     * head approving a staff self-registration.
     */
    await tx.accountRequest.update({
      where: { userId: user.id },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedById: record.user.accountRequest?.invitedById ?? null,
        decisionNote: record.user.accountRequest?.authorizedBy
          ? `Invite accepted by the account holder. Authorized by ${record.user.accountRequest.authorizedBy} (${record.user.accountRequest.authorizationRef ?? "no reference"}).`
          : "Invite accepted by the account holder.",
      },
    });

    let headedUnitId: string | null = null;

    if (user.role === "DEPARTMENT_HEAD" && user.orgUnitId) {
      /**
       * §5: Trigger structured handover when a DEPARTMENT_HEAD accepts invite
       */
      const unit = await tx.orgUnit.findUnique({
        where: { id: user.orgUnitId },
        select: { headId: true },
      });
      if (unit && unit.headId && unit.headId !== user.id) {
        await executeHandover(tx, {
          unitId: user.orgUnitId,
          previousHeadId: unit.headId,
          newHeadId: user.id,
        });
      }
      /**
       * `OrgUnit.headId` is how `resolveApprover` finds a head, so an invitation
       * that never set it would create a head nobody can route a request to —
       * which is exactly the "vacant head" bug in reverse.
       */
      await tx.orgUnit.update({
        where: { id: user.orgUnitId },
        data: { headId: user.id },
      });

      await tx.item.updateMany({
        where: {
          orgUnitId: user.orgUnitId,
          holderType: "DEPARTMENT",
          status: { notIn: ["DISPOSED", "VOIDED", "LOST"] },
        },
        data: {
          status: "REVERTED_UNVERIFIED",
        },
      });

      headedUnitId = user.orgUnitId;
    }

    await tx.adminActionLog.create({
      data: {
        actorId: user.id,
        action: "ACCOUNT_INVITE_ACCEPTED",
        targetUserId: user.id,
        unitId: user.orgUnitId,
        before: { accountStatus: record.user.accountStatus },
        after: { accountStatus: "ACTIVE", role: user.role },
        authorizedBy: record.user.accountRequest?.authorizedBy ?? null,
        authorizationRef: record.user.accountRequest?.authorizationRef ?? null,
      },
    });

    return {
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      headedUnitId,
    };
  });
}
