import { describe, expect, it } from "vitest";
import {
  activeItemsWhere,
  allItemsWhere,
  DISPOSED_PUBLIC_MESSAGE,
} from "./itemVisibility.js";

/**
 * `activeItemsWhere` is the enforcement point for one of Phase 2's exit criteria
 * — "a disposed item disappears from the default GET /items" — and the route test
 * that proves it is wired up lives in routes/items.test.ts ("pins status ACTIVE
 * into the where clause"). This file tests the rule itself, including the one
 * property a route test cannot show: that it holds no matter what the caller passes.
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

  it("leaves the caller's own filter object untouched", () => {
    // GET /items builds `filters` then passes it here; mutating it in place would
    // be an easy way to make a later `count({ where: filters })` disagree with the
    // `findMany` it is supposed to be counting.
    const filters = { department: "Biology" };
    activeItemsWhere(filters);
    expect(filters).toEqual({ department: "Biology" });
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

describe("DISPOSED_PUBLIC_MESSAGE", () => {
  it("quotes F7.3's sentence and carries nothing else", () => {
    // F7.3: a public tag lookup for a disposed item "shows 'this item is no longer
    // in service', nothing else". The acceptance criterion quotes the wording, so
    // the test does too — and asserts the string leaks no tag, reason or date.
    expect(DISPOSED_PUBLIC_MESSAGE.toLowerCase()).toBe("this item is no longer in service");
    expect(DISPOSED_PUBLIC_MESSAGE).not.toMatch(/CNCS-|disposed|reason/i);
  });
});
