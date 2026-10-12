import { describe, expect, it } from "vitest";
import { HttpError } from "../lib/httpError.js";
import {
  assertCanReview,
  canHoldSession,
  ERROR_NOT_PENDING,
  ERROR_SELF_REVIEW,
  signInRefusal,
  type AccountStatusValue,
} from "./accountApproval.js";

/**
 * The account-approval rules (spec 3.1.2).
 *
 * The rule this file exists for is `assertCanReview`'s self-review refusal: the
 * supervisor's flagged issue is that nobody may become active by their own action,
 * and that has to be true on the *server* — a queue screen that hides the buttons on
 * your own row is a courtesy, not an enforcement. These tests call the rule the API
 * calls, with no HTTP layer in between.
 */

/** Asserts a thrown HttpError's status and message in one place. */
function expectHttpError(run: () => void, status: number, message: string): void {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    expect((err as HttpError).message).toBe(message);
    return;
  }
  throw new Error(`Expected ${status} ${message} to be thrown`);
}

describe("assertCanReview", () => {
  const pending = {
    targetId: "staff-9",
    targetStatus: "PENDING_APPROVAL" as AccountStatusValue,
    reviewerId: "admin-1",
  };

  it("allows an administrator to decide someone else's pending request", () => {
    expect(() => assertCanReview(pending)).not.toThrow();
  });

  it("refuses an administrator deciding their own account, on the server (403)", () => {
    // The supervisor's rule. Note this is the API's own guard: a request that never
    // went near the queue screen still lands here.
    expectHttpError(
      () => assertCanReview({ ...pending, reviewerId: pending.targetId }),
      403,
      ERROR_SELF_REVIEW,
    );
  });

  it("refuses self-review even when the account is not pending", () => {
    // "You may not decide this at all" is the more accurate answer, and it stays
    // true whatever the status becomes — so it is checked before the status.
    expectHttpError(
      () =>
        assertCanReview({
          targetId: "admin-1",
          targetStatus: "ACTIVE",
          reviewerId: "admin-1",
        }),
      403,
      ERROR_SELF_REVIEW,
    );
  });

  it("refuses a decision on an account that is not waiting (409)", () => {
    for (const status of ["ACTIVE", "REJECTED", "DEACTIVATED"] as AccountStatusValue[]) {
      expectHttpError(
        () => assertCanReview({ ...pending, targetStatus: status }),
        409,
        ERROR_NOT_PENDING,
      );
    }
  });
});

describe("signInRefusal", () => {
  it("lets an active account through", () => {
    expect(signInRefusal("ACTIVE")).toBeNull();
  });

  it("says wait, not no, for a request nobody has decided yet", () => {
    // The difference matters to the person reading it: one of these resolves itself.
    expect(signInRefusal("PENDING_APPROVAL")).toMatch(/waiting for approval/i);
  });

  it("names the reason for every other blocked status", () => {
    expect(signInRefusal("PENDING_EMAIL_VERIFICATION")).toMatch(/confirm your email/i);
    expect(signInRefusal("REJECTED")).toMatch(/declined/i);
    expect(signInRefusal("DEACTIVATED")).toMatch(/deactivated/i);
  });

  it("refuses an unrecognised status rather than defaulting to allow", () => {
    // Fails closed: a status this build has never heard of must not be a way in.
    expect(signInRefusal("SOMETHING_NEW" as AccountStatusValue)).toMatch(/cannot sign in/i);
  });
});

describe("canHoldSession", () => {
  it("is true only for ACTIVE", () => {
    expect(canHoldSession("ACTIVE")).toBe(true);
    for (const status of [
      "PENDING_APPROVAL",
      "PENDING_EMAIL_VERIFICATION",
      "REJECTED",
      "DEACTIVATED",
    ] as AccountStatusValue[]) {
      expect(canHoldSession(status)).toBe(false);
    }
  });
});
