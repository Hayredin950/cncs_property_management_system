import { describe, expect, it } from "vitest";
import { HttpError } from "../lib/httpError.js";
import {
  assertDecidable,
  buildAccessoryCascade,
  buildDisposalChanges,
  buildTransferChanges,
  ERROR_ALREADY_DECIDED,
  ERROR_ITEM_DISPOSED,
  ERROR_SELF_DECISION,
  hasChanges,
} from "./requestWorkflow.js";

/**
 * The pure half of the approval state machine: no database, no mocks, nothing to
 * stub. Everything here is a function of its arguments, which is why the rules
 * live in a service instead of inline in the route handler.
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

describe("assertDecidable", () => {
  const decidable = {
    requestStatus: "PENDING" as const,
    itemStatus: "ACTIVE" as const,
    requestedById: "staff-1",
    reviewerId: "admin-1",
  };

  it("permits a pending request on an active item, decided by someone else", () => {
    expect(() => assertDecidable(decidable)).not.toThrow();
  });

  it("refuses self-decision with 403 (F6.2 is an authorization rule)", () => {
    expectHttpError(
      () => assertDecidable({ ...decidable, reviewerId: "staff-1" }),
      403,
      ERROR_SELF_DECISION,
    );
  });

  it("checks self-decision before status, so the answer stays accurate", () => {
    // Both rules apply here. "You may not decide this at all" is more accurate
    // than "it was already decided", and it stays true whatever the status becomes.
    expectHttpError(
      () =>
        assertDecidable({
          ...decidable,
          reviewerId: "staff-1",
          requestStatus: "APPROVED",
        }),
      403,
      ERROR_SELF_DECISION,
    );
  });

  it("refuses an already-decided request with 409", () => {
    expectHttpError(
      () => assertDecidable({ ...decidable, requestStatus: "APPROVED" }),
      409,
      ERROR_ALREADY_DECIDED,
    );
    expectHttpError(
      () => assertDecidable({ ...decidable, requestStatus: "REJECTED" }),
      409,
      ERROR_ALREADY_DECIDED,
    );
  });

  it("refuses a decision on a disposed item with 409", () => {
    expectHttpError(
      () => assertDecidable({ ...decidable, itemStatus: "DISPOSED" }),
      409,
      ERROR_ITEM_DISPOSED,
    );
  });
});

describe("buildTransferChanges", () => {
  const nothingRequested = {
    newLocationBuilding: null,
    newLocationFloor: null,
    newLocationRoom: null,
    newOwnerId: null,
  };

  it("writes only the fields the request actually named", () => {
    // A request that moves an item to a new room must not blank its building.
    expect(
      buildTransferChanges({
        ...nothingRequested,
        newLocationFloor: "1",
        newLocationRoom: "101",
      }),
    ).toEqual({ floor: "1", room: "101" });
  });

  it("maps every transfer field to its Item column", () => {
    expect(
      buildTransferChanges({
        newLocationBuilding: "Science Block",
        newLocationFloor: "2",
        newLocationRoom: "204",
        newOwnerId: "staff-2",
      }),
    ).toEqual({
      building: "Science Block",
      floor: "2",
      room: "204",
      ownerId: "staff-2",
    });
  });

  it("produces an empty change set when the request named nothing", () => {
    const changes = buildTransferChanges(nothingRequested);
    expect(changes).toEqual({});
    expect(hasChanges(changes)).toBe(false);
  });
});

describe("buildDisposalChanges", () => {
  it("is a status change, never a row delete (F7.2)", () => {
    const disposedAt = new Date("2026-09-03T10:00:00.000Z");
    const changes = buildDisposalChanges({ reason: "Beyond economical repair", disposedAt });

    expect(changes).toEqual({
      status: "DISPOSED",
      disposalReason: "Beyond economical repair",
      disposedAt,
    });
    // Same instant as Request.decidedAt — passed in, never defaulted here.
    expect(changes.disposedAt).toBe(disposedAt);
  });
});

describe("buildAccessoryCascade", () => {
  const disposedAt = new Date("2026-09-03T10:00:00.000Z");

  it("propagates location and owner on a transfer (D6)", () => {
    // A charger whose record still says Room 312 after the laptop moved to Room
    // 101 is knowingly-wrong data; F7.2 exists so the system stops lying about
    // where things are.
    expect(
      buildAccessoryCascade({
        type: "TRANSFER",
        parentChanges: { floor: "1", room: "101", ownerId: "staff-2" },
        parentTagId: "CNCS-DEMO-0001",
        reason: "Moving to the new staff office",
        disposedAt,
      }),
    ).toEqual({ floor: "1", room: "101", ownerId: "staff-2" });
  });

  it("never propagates a disposal field through the transfer branch", () => {
    const cascade = buildAccessoryCascade({
      type: "TRANSFER",
      parentChanges: {
        room: "101",
        status: "DISPOSED",
        disposalReason: "should not travel",
        disposedAt,
      },
      parentTagId: "CNCS-DEMO-0001",
      reason: "Moving to the new staff office",
      disposedAt,
    });

    expect(cascade).toEqual({ room: "101" });
    expect(cascade.status).toBeUndefined();
    expect(cascade.disposalReason).toBeUndefined();
  });

  it("disposes accessories with a reason that names the parent tag", () => {
    expect(
      buildAccessoryCascade({
        type: "DISPOSAL",
        parentChanges: {
          status: "DISPOSED",
          disposalReason: "Beyond economical repair",
          disposedAt,
        },
        parentTagId: "CNCS-DEMO-0001",
        reason: "Beyond economical repair",
        disposedAt,
      }),
    ).toEqual({
      status: "DISPOSED",
      disposalReason: "Disposed with parent item CNCS-DEMO-0001: Beyond economical repair",
      disposedAt,
    });
  });

  it("leaves parentItemId alone on disposal, so the bundle stays recorded", () => {
    const cascade = buildAccessoryCascade({
      type: "DISPOSAL",
      parentChanges: { status: "DISPOSED", disposalReason: "Beyond repair", disposedAt },
      parentTagId: "CNCS-DEMO-0001",
      reason: "Beyond repair",
      disposedAt,
    });
    expect(cascade).not.toHaveProperty("parentItemId");
  });

  it("cascades nothing when the parent transfer changed nothing", () => {
    const cascade = buildAccessoryCascade({
      type: "TRANSFER",
      parentChanges: {},
      parentTagId: "CNCS-DEMO-0001",
      reason: "Moving to the new staff office",
      disposedAt,
    });
    expect(hasChanges(cascade)).toBe(false);
  });
});

describe("hasChanges", () => {
  it("reports whether a change set would write anything", () => {
    expect(hasChanges({})).toBe(false);
    expect(hasChanges({ room: "101" })).toBe(true);
    expect(hasChanges({ status: "DISPOSED" })).toBe(true);
  });
});

