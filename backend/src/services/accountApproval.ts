import { httpError } from "../lib/httpError.js";

/**
 * The account-approval rules (spec 3.1.2).
 *
 * The workflow the supervisor flagged as the biggest issue on record: a person asks
 * for an account, a `SYSTEM_ADMIN` decides, and **nobody becomes active by their own
 * action**. The rule that carries that sentence is `assertCanReview` below, and it
 * lives here — in a service, on the server — rather than in the queue screen, for
 * the same reason `assertDecidable` lives in `requestWorkflow.ts`: a UI that hides a
 * button has denied nothing, and the API is reachable without the UI.
 *
 * The pure half has no database access, so the rules are tested directly; the routes
 * call them before any write.
 */

/** Mirrors the Prisma `AccountStatus` enum. */
export type AccountStatusValue =
  | "ACTIVE"
  | "PENDING_EMAIL_VERIFICATION"
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "DEACTIVATED";

/**
 * Error strings are exported constants, not literals at the throw site: routes,
 * tests and both clients quote them, and they must never drift apart.
 *
 * `ERROR_SELF_REVIEW` is the one the supervisor's rule is about. It is deliberately
 * distinct from a generic 403: "you cannot approve your own account" is a different
 * fact from "you are not allowed to approve accounts at all", and the two must not
 * read the same in a log or in a test.
 */
export const ERROR_SELF_REVIEW = "You cannot approve or reject your own account";
export const ERROR_NOT_PENDING = "This account is not waiting for approval";
export const ERROR_APPROVE_NOT_FOUND = "Account not found";
export const ERROR_REJECTION_REASON = "A reason of 3 to 500 characters is required";

/**
 * Why this account cannot sign in, or null when it can.
 *
 * One function rather than a status comparison at each of the two sign-in paths
 * (`POST /auth/login` and `POST /auth/change-password`): the messages a person reads
 * while locked out are the whole value of the status column, and they have to be the
 * same whichever door they tried.
 *
 * 401 vs 403: the account exists and the password may well be right — that is a
 * refusal to let this session start, not a failed credential check, so it answers
 * 403 with the reason instead of the misleading "Invalid credentials".
 */
/**
 * The sentence the sign-in screen shows when an account exists but may not
 * sign in.
 *
 * `reason` is the decision note, when there is one. It is the applicant's own
 * request, so it is theirs to read: being told only "contact the property
 * office" leaves them with nothing to act on, while "the staff ID does not
 * match the college register" is something they can fix.
 */
export function signInRefusal(
  status: AccountStatusValue,
  context: { reason?: string | null } = {},
): string | null {
  const reason = context.reason?.trim();
  switch (status) {
    case "ACTIVE":
      return null;
    case "PENDING_APPROVAL":
      return "This account is waiting for approval. You will be able to sign in once it is approved.";
    case "PENDING_EMAIL_VERIFICATION":
      return "Confirm your email address before signing in.";
    case "REJECTED":
      return reason
        ? `This account's request was declined: ${reason} Contact the property office if you believe that is wrong.`
        : "This account's request was declined. Contact the property office if you believe that is wrong.";
    case "DEACTIVATED":
      return "This account has been deactivated. Contact the property office.";
    default:
      return "This account cannot sign in. Contact the property office.";
  }
}

/** A status a signed-in session may act from. Used by `authenticate`. */
export function canHoldSession(status: AccountStatusValue): boolean {
  return status === "ACTIVE";
}

export interface ReviewabilityInput {
  /** The account being approved or rejected. */
  targetId: string;
  targetStatus: AccountStatusValue;
  /** The administrator doing it. */
  reviewerId: string;
}

/**
 * The no-self-approval rule, plus the guard that a decision is only possible while
 * the account is actually pending.
 *
 * Self-review is checked **first**, before the status. Both can be true at once
 * (an administrator whose own request is still pending), and "you may not decide
 * this at all" is the more accurate answer — it stays true whatever the status
 * becomes, whereas "not waiting for approval" would read as a transient state.
 *
 * This is the server-side enforcement of the supervisor's rule. The queue screen
 * also omits the buttons on your own row, but that is a courtesy: a request that
 * reaches the API without the UI still lands here.
 */
export function assertCanReview(input: ReviewabilityInput): void {
  if (input.targetId === input.reviewerId) {
    throw httpError(403, ERROR_SELF_REVIEW);
  }
  if (input.targetStatus !== "PENDING_APPROVAL") {
    throw httpError(409, ERROR_NOT_PENDING);
  }
}
