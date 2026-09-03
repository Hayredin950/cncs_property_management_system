import { describe, expect, it } from "vitest";
import {
  activeItemsWhere,
  allItemsWhere,
  DISPOSED_PUBLIC_MESSAGE,
  PUBLIC_ITEM_FIELDS,
  publicItemView,
  RESTRICTED_ITEM_FIELDS,
} from "./itemVisibility.js";

/**
 * These helpers are the substitute for two exit criteria Phase 2 cannot test end
 * to end: "a disposed item disappears from the default GET /items" and F7.3's
 * public lookup of a disposed tag. Neither route exists — the Items track was
 * never built — so the rules ship as unit-tested helpers plus the written contract
 * in docs/phase-2.md, and the Items track wires them into its `where` clauses.
 */

describe("activeItemsWhere", () => {
  it("pins status ACTIVE onto any filter (F7.2 — disposal is a status, not a delete)", () => {
    expect(activeItemsWhere()).toEqual({ status: "ACTIVE" });
    expect(activeItemsWhere({ department: "Computer Science" })).toEqual({
      department: "Computer Science",
      status: "ACTIVE",
    });
  });

  it("cannot be widened by a caller passing its own status", () => {
    // This is the whole reason the helper exists rather than a literal spread:
    // `status` is applied LAST, so an unvalidated `?status=DISPOSED` reaching the
    // filter object cannot resurrect disposed items into a default listing.
    expect(activeItemsWhere({ status: "DISPOSED" })).toEqual({ status: "ACTIVE" });
    expect(activeItemsWhere({ status: undefined })).toEqual({ status: "ACTIVE" });
  });
});

describe("allItemsWhere", () => {
  it("is an identity function that makes including disposed items greppable", () => {
    // Phase 3's disposal report needs them. A bare `where` with no status key is
    // indistinguishable from having forgotten one, which is what this fixes.
    expect(allItemsWhere()).toEqual({});
    expect(allItemsWhere({ department: "Computer Science" })).toEqual({
      department: "Computer Science",
    });
    expect(allItemsWhere({ status: "DISPOSED" })).toEqual({ status: "DISPOSED" });
  });
});

describe("publicItemView", () => {
  const item = {
    id: "item-1",
    tagId: "CNCS-DEMO-0001",
    name: "Dell Latitude Laptop",
    category: { id: "cat-1", name: "Electronics" },
    categoryId: "cat-1",
    department: "Computer Science",
    building: "CNCS Building",
    floor: "3",
    room: "312",
    condition: "GOOD",
    brand: "Dell",
    model: "Latitude 5420",
    serialNumber: "SN-12345",
    photoUrl: "/uploads/item-1.png",
    notes: "Screen replaced in 2025",
    status: "ACTIVE",
    ownerId: "staff-1",
    owner: { id: "staff-1", fullName: "Demo Staff" },
    purchaseCost: "45000.00",
    currentValue: "32000.00",
    disposalReason: null,
    disposedAt: null,
    registeredAt: new Date("2026-09-01T00:00:00.000Z"),
    lastAuditedAt: null,
    parentItemId: null,
  };

  it("strips every restricted field for a guest (SDS 3.2)", () => {
    const view = publicItemView(item, null);

    for (const field of RESTRICTED_ITEM_FIELDS) {
      expect(view).not.toHaveProperty(field);
    }
    // Named explicitly as well as by loop: these are the ones that matter.
    expect(view.purchaseCost).toBeUndefined();
    expect(view.currentValue).toBeUndefined();
    expect(view.ownerId).toBeUndefined();
    expect(view.owner).toBeUndefined();
    expect(view.serialNumber).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("45000");
    expect(JSON.stringify(view)).not.toContain("Demo Staff");
  });

  it("keeps the allow-listed fields and flattens category to its name", () => {
    const view = publicItemView(item, undefined);

    expect(view).toEqual({
      tagId: "CNCS-DEMO-0001",
      name: "Dell Latitude Laptop",
      category: "Electronics",
      department: "Computer Science",
      building: "CNCS Building",
      floor: "3",
      room: "312",
      condition: "GOOD",
      brand: "Dell",
      model: "Latitude 5420",
      status: "ACTIVE",
    });
    expect(Object.keys(view).every((key) => PUBLIC_ITEM_FIELDS.includes(key as never))).toBe(true);
  });

  it("is an allow-list, so a column added later is private until published", () => {
    const view = publicItemView({ ...item, insurancePolicyNumber: "POL-999" }, null);
    expect(view).not.toHaveProperty("insurancePolicyNumber");
  });

  it("collapses a disposed item to the F7.3 message rather than 404", () => {
    const view = publicItemView(
      { ...item, status: "DISPOSED", disposalReason: "Beyond repair" },
      null,
    );

    // The tag is real: scanning it should say what happened, not imply the record
    // was lost. And the reason why is internal information.
    expect(view).toEqual({
      tagId: "CNCS-DEMO-0001",
      name: "Dell Latitude Laptop",
      status: "DISPOSED",
      message: DISPOSED_PUBLIC_MESSAGE,
    });
    expect(JSON.stringify(view)).not.toContain("Beyond repair");
  });

  it("hands the row through untouched to staff and admins", () => {
    expect(publicItemView(item, { role: "STAFF" })).toBe(item);
    expect(publicItemView(item, { role: "ADMIN" })).toBe(item);
    // Including a disposed one — internal users need to see what was disposed.
    const disposed = { ...item, status: "DISPOSED" };
    expect(publicItemView(disposed, { role: "ADMIN" })).toBe(disposed);
  });
});
