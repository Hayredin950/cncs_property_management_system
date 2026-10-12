import { describe, expect, it } from "vitest";
import {
  buildCustodyEvent,
  COLLEGE_HOLDER,
  collegeHolderFields,
  custodyTransition,
  currentHolder,
  holderFields,
  sameHolder,
  staffHolder,
  staffHolderFields,
} from "./holder.js";

/**
 * The holder model's pure half (spec 4.1): what an item's holder is, how a move is
 * recorded, and — the rule that would otherwise be forgotten — when a move writes
 * *nothing*.
 *
 * No database here on purpose. The impure half (`recordCustodyEvent`,
 * `writeCustodyChange`) is exercised through the routes and the approval path,
 * where "the columns and the event were written together" is the property worth
 * asserting.
 */

describe("staffHolder / holderFields", () => {
  it("pairs the person with a STAFF holder type", () => {
    expect(staffHolder("staff-1")).toEqual({ holderType: "STAFF", holderId: "staff-1" });
  });

  it("writes the non-null pair for a write that provably has a person", () => {
    // `holderFields(staffHolder(id))` is `HolderType | null` and cannot be assigned
    // to a non-nullable column under `exactOptionalPropertyTypes` — which is why
    // the typed variant exists rather than a cast at every write.
    expect(staffHolderFields("staff-1")).toEqual({ holderType: "STAFF", holderId: "staff-1" });
  });

  it("gives the college a type and no id, because it has no single holder", () => {
    expect(collegeHolderFields()).toEqual({ holderType: "COLLEGE", holderId: null });
    expect(COLLEGE_HOLDER).toEqual({ holderType: "COLLEGE", holderId: null });
  });

  it("round-trips a holder through the column names", () => {
    expect(holderFields(staffHolder("staff-1"))).toEqual({
      holderType: "STAFF",
      holderId: "staff-1",
    });
  });
});

describe("currentHolder", () => {
  it("reads the holder columns first", () => {
    expect(
      currentHolder({ holderType: "STAFF", holderId: "staff-2", ownerId: "staff-1" }),
    ).toEqual({ holderType: "STAFF", holderId: "staff-2" });
  });

  it("falls back to ownerId for a row written before the holder columns existed", () => {
    // The backfill migration sets `holderType = 'STAFF', holderId = ownerId` on
    // exactly these rows; until it lands, this branch is what keeps an old item's
    // custodian visible to the person holding it.
    expect(currentHolder({ holderType: null, holderId: null, ownerId: "staff-1" })).toEqual({
      holderType: "STAFF",
      holderId: "staff-1",
    });
  });

  it("reports COLLEGE for an item with neither, rather than a holder of nobody", () => {
    expect(currentHolder({})).toEqual({ holderType: "COLLEGE", holderId: null });
  });

  it("keeps a DEPARTMENT holder's id, which is a department and not a person", () => {
    expect(currentHolder({ holderType: "DEPARTMENT", holderId: "dept-1" })).toEqual({
      holderType: "DEPARTMENT",
      holderId: "dept-1",
    });
  });
});

describe("sameHolder", () => {
  it("treats the same person, department or pool as unchanged", () => {
    expect(sameHolder(staffHolder("staff-1"), staffHolder("staff-1"))).toBe(true);
    expect(sameHolder(COLLEGE_HOLDER, collegeHolderFields())).toBe(true);
  });

  it("tells two people apart, and a person from the pool", () => {
    expect(sameHolder(staffHolder("staff-1"), staffHolder("staff-2"))).toBe(false);
    expect(sameHolder(COLLEGE_HOLDER, staffHolder("staff-1"))).toBe(false);
  });
});

describe("buildCustodyEvent", () => {
  it("records both ends of the move and who acted", () => {
    const event = buildCustodyEvent({
      eventType: "TRANSFERRED",
      from: staffHolder("staff-1"),
      to: staffHolder("staff-2"),
      actingUserId: "officer-1",
      reason: "Moving to the new staff office",
    });

    expect(event).toEqual({
      eventType: "TRANSFERRED",
      fromHolderType: "STAFF",
      fromHolderId: "staff-1",
      toHolderType: "STAFF",
      toHolderId: "staff-2",
      actingUserId: "officer-1",
      reason: "Moving to the new staff office",
      departmentHeadSnapshot: null,
    });
  });

  it("writes nulls where the caller knows nothing, not undefined", () => {
    // The columns are nullable and the route serializes this straight into an
    // insert; an `undefined` would be dropped by Prisma and read back as absent.
    const event = buildCustodyEvent({
      eventType: "CREATED",
      from: COLLEGE_HOLDER,
      to: staffHolder("staff-1"),
      actingUserId: "officer-1",
    });

    expect(event.reason).toBeNull();
    expect(event.departmentHeadSnapshot).toBeNull();
  });

  it("names the department head only when a caller has one to name", () => {
    const event = buildCustodyEvent({
      eventType: "TRANSFERRED",
      from: staffHolder("staff-1"),
      to: staffHolder("staff-2"),
      actingUserId: "officer-1",
      departmentHeadSnapshot: "Dr. Head",
    });
    expect(event.departmentHeadSnapshot).toBe("Dr. Head");
  });
});

describe("custodyTransition", () => {
  it("is the from/to half of the event, so one pair drives both writers", () => {
    expect(custodyTransition(COLLEGE_HOLDER, staffHolder("staff-1"))).toEqual({
      fromHolderType: "COLLEGE",
      fromHolderId: null,
      toHolderType: "STAFF",
      toHolderId: "staff-1",
    });
  });
});
