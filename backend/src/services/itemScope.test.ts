import { describe, expect, it } from "vitest";
import {
  canOpenItem,
  itemInScope,
  itemListScope,
  resolveItemScope,
  type ScopedItem,
  type ScopedUser,
} from "./itemScope.js";

/**
 * Item visibility, exercised as **rows** rather than as query fragments.
 *
 * This is the direct answer to "do two Department Heads see two different lists?"
 * `GET /items` builds a `where` fragment and `GET /items/:id` calls `itemInScope`;
 * both are this one function (`itemScope.ts`, which is the point of it). Applying
 * the rule to a concrete set of rows is what shows the *outcome* — a fragment that
 * mentioned the right column but matched every row would still pass a test that
 * only read the fragment.
 *
 * There is no database harness in this project (every route suite mocks Prisma —
 * see the note at the top of `audits.integration.test.ts`), so "log in as two
 * Department Heads and compare" is done here at the rule both endpoints share,
 * plus the HTTP-level listing test in `routes/items.test.ts`.
 */

const CS = "org-unit-cs";
const BIO = "org-unit-bio";

const headCs: ScopedUser = { id: "head-cs", role: "DEPARTMENT_HEAD", orgUnitId: CS };
const headBio: ScopedUser = { id: "head-bio", role: "DEPARTMENT_HEAD", orgUnitId: BIO };
const admin: ScopedUser = { id: "admin-1", role: "SYSTEM_ADMIN", orgUnitId: null };
const officer: ScopedUser = { id: "officer-1", role: "PROPERTY_OFFICER" };

const csDepartmentItem: ScopedItem = {
  id: "cs-dept",
  orgUnitId: CS,
  holderType: "DEPARTMENT",
  holderId: CS,
  ownerId: null,
};
const bioDepartmentItem: ScopedItem = {
  id: "bio-dept",
  orgUnitId: BIO,
  holderType: "DEPARTMENT",
  holderId: BIO,
  ownerId: null,
};
const csStaffItem: ScopedItem = {
  id: "cs-staff",
  orgUnitId: CS,
  holderType: "STAFF",
  holderId: "staff-cs",
  ownerId: "staff-cs",
};
const bioStaffItem: ScopedItem = {
  id: "bio-staff",
  orgUnitId: BIO,
  holderType: "STAFF",
  holderId: "staff-bio",
  ownerId: "staff-bio",
};

/** What this viewer's list would contain, in order. */
function visible(user: ScopedUser, rows: ScopedItem[]): Array<string | null | undefined> {
  return rows.filter((row) => itemInScope(user, row)).map((row) => row.id);
}

const DEPARTMENT_ROWS = [csDepartmentItem, bioDepartmentItem, csStaffItem, bioStaffItem];

describe("Department Head item visibility", () => {
  it("gives two heads of two units two different, non-overlapping lists", () => {
    // The comparison that matters. "Is a head scoped?" passes for any rule that
    // narrows at all; "is the *second* head's list a different list?" is what
    // catches a rule that quietly returns the whole register to both.
    expect(visible(headCs, DEPARTMENT_ROWS)).toEqual(["cs-dept", "cs-staff"]);
    expect(visible(headBio, DEPARTMENT_ROWS)).toEqual(["bio-dept", "bio-staff"]);
  });

  it("keeps a head's personal holdings visible even when the item sits in another unit", () => {
    // A CS head personally holds an item that is recorded in Biology. Both heads
    // see it, and that is correct: the holder link follows the person, and the
    // unit that the item belongs to is still overseen by its own head.
    const crossUnitPersonal: ScopedItem = {
      id: "cs-head-holds-bio-item",
      orgUnitId: BIO,
      holderType: "STAFF",
      holderId: "head-cs",
      ownerId: "head-cs",
    };

    expect(itemInScope(headCs, crossUnitPersonal)).toBe(true);
    expect(itemInScope(headBio, crossUnitPersonal)).toBe(true);
    // A head from a third unit sees none of it.
    expect(
      itemInScope({ id: "head-phys", role: "DEPARTMENT_HEAD", orgUnitId: "org-unit-phys" }, crossUnitPersonal),
    ).toBe(false);
  });

  it("shows the SYSTEM_ADMIN nothing, as a filter that matches nothing", () => {
    expect(visible(admin, DEPARTMENT_ROWS)).toEqual([]);
    // Expressed as an empty `in` list rather than a missing clause: a forgotten
    // clause matches everything, which is the shape of the original leak.
    expect(itemListScope(admin)).toEqual({ id: { in: [] } });
  });

  it("leaves the college-wide roles unrestricted, by design", () => {
    expect(visible(officer, DEPARTMENT_ROWS)).toEqual(["cs-dept", "bio-dept", "cs-staff", "bio-staff"]);
    expect(itemListScope(officer)).toBeUndefined();
  });

  it("fails closed when there is no authenticated user", () => {
    // No user is a caller error on a route that requires a token — never "public".
    expect(itemListScope(null)).toEqual({ id: { in: [] } });
    expect(itemInScope(null, csDepartmentItem)).toBe(false);
    expect(itemInScope(undefined, csDepartmentItem)).toBe(false);
  });
});

/**
 * The `?scope=` views the listing offers (the web's and the phone's filter rows).
 *
 * `all` means "no restriction", `mine` means the caller's own holdings, and an
 * unknown value falls back to the role's own scope rather than widening it.
 */
describe("canOpenItem", () => {
  // Every signed-in reader may open a row the register shows them. The 26 Oct
  // device pass found the contradiction: a CS head's "All departments" list
  // drew the Physics pool, and tapping one answered "This item is not assigned
  // to you". A listed row must open; only editing stays unit-scoped.
  it("lets staff and heads open another unit's pooled item", () => {
    const staffCs: ScopedUser = { id: "staff-cs", role: "STAFF", orgUnitId: CS };
    expect(itemInScope(staffCs, bioDepartmentItem)).toBe(false);
    expect(canOpenItem(staffCs, bioDepartmentItem)).toBe(true);
    expect(itemInScope(headCs, bioDepartmentItem)).toBe(false);
    expect(canOpenItem(headCs, bioDepartmentItem)).toBe(true);
  });

  it("still refuses a role with no asset access", () => {
    expect(canOpenItem(admin, csStaffItem)).toBe(false);
    expect(canOpenItem(null, csStaffItem)).toBe(false);
  });
});

describe("resolveItemScope", () => {
  it("narrows an officer's 'mine' to the officer's own holdings", () => {
    // The bug this pins: the college-wide roles answered every value except `all`
    // with `itemListScope`, which for them is *undefined* — so "My items" listed
    // the whole register. The scope is a view, not a capability.
    expect(resolveItemScope(officer, "mine")).toEqual({
      OR: [{ ownerId: officer.id }, { holderType: "STAFF", holderId: officer.id }],
    });
  });

  it("narrows an auditor's 'mine' the same way", () => {
    const auditor: ScopedUser = { id: "auditor-1", role: "AUDITOR" };
    expect(resolveItemScope(auditor, "mine")).toEqual({
      OR: [{ ownerId: auditor.id }, { holderType: "STAFF", holderId: auditor.id }],
    });
  });

  it("leaves 'all' unrestricted for the college-wide roles", () => {
    expect(resolveItemScope(officer, "all")).toBeUndefined();
  });

  it("falls back to the role's scope for an unknown value", () => {
    // Not a widening: an unrecognised string must never become "everything".
    expect(resolveItemScope(officer, "somebody-elses")).toBeUndefined();
    expect(resolveItemScope(headCs, "somebody-elses")).toEqual(itemListScope(headCs));
    expect(resolveItemScope({ id: "staff-cs", role: "STAFF", orgUnitId: CS }, "nonsense")).toEqual(
      itemListScope({ id: "staff-cs", role: "STAFF", orgUnitId: CS }),
    );
  });

  it("gives 'department' and 'other' to a head, and never the other unit's rows", () => {
    expect(resolveItemScope(headCs, "department")).toEqual({
      OR: [{ orgUnitId: CS }, { holderType: "DEPARTMENT", holderId: CS }, { ownerId: "head-cs" }],
    });
    expect(resolveItemScope(headCs, "other")).toEqual({
      NOT: { OR: [{ orgUnitId: CS }, { holderType: "DEPARTMENT", holderId: CS }] },
    });
  });

  it("gives a staff member the same 'other departments' meaning as a head", () => {
    // The bug this pins: `other` used to mean "not mine" for STAFF, so a CS
    // staff member's "Other departments" list still held the 52 CS items and a
    // request could be filed against the unit's own pool. Same rule as a head:
    // a row is in another department when neither its unit nor its department
    // holder is the caller's unit.
    const staffCs: ScopedUser = { id: "staff-cs", role: "STAFF", orgUnitId: CS };
    expect(resolveItemScope(staffCs, "other")).toEqual({
      NOT: { OR: [{ orgUnitId: CS }, { holderType: "DEPARTMENT", holderId: CS }] },
    });
    // The fragment is the same one the head gets, which is the point: "other
    // departments" cannot mean "not mine" for one role and "not my unit" for
    // another without the filter row lying to somebody.
    expect(resolveItemScope(staffCs, "other")).toEqual(resolveItemScope(headCs, "other"));
  });

  it("leaves a staff member without an org unit on their role scope for 'other'", () => {
    // No unit means there is no "other" to name; fall back rather than invent a
    // view that would return the whole college.
    const staffNoUnit: ScopedUser = { id: "staff-1", role: "STAFF", orgUnitId: null };
    expect(resolveItemScope(staffNoUnit, "other")).toEqual(itemListScope(staffNoUnit));
  });
});
