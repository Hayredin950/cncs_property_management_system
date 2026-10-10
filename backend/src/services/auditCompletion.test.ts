import { describe, expect, it } from "vitest";
import { collapseAuditRows, computeAuditResults } from "./auditCompletion.js";

describe("computeAuditResults", () => {
  it("classifies an all-found audit", () => {
    expect(computeAuditResults(["item-1", "item-2"], ["item-1", "item-2"])).toEqual({
      found: ["item-1", "item-2"],
      missing: [],
      locationMismatch: [],
    });
  });

  it("classifies an all-missing audit", () => {
    expect(computeAuditResults(["item-1", "item-2"], [])).toEqual({
      found: [],
      missing: ["item-1", "item-2"],
      locationMismatch: [],
    });
  });

  it("classifies an all-mismatched audit", () => {
    expect(computeAuditResults([], ["item-1", "item-2"])).toEqual({
      found: [],
      missing: [],
      locationMismatch: ["item-1", "item-2"],
    });
  });

  it("classifies a realistic mixed audit", () => {
    expect(
      computeAuditResults(["item-1", "item-2", "item-3"], ["item-1", "item-3", "item-4"]),
    ).toEqual({
      found: ["item-1", "item-3"],
      missing: ["item-2"],
      locationMismatch: ["item-4"],
    });
  });

  it("treats a scan against an empty scope as a mismatch", () => {
    expect(computeAuditResults([], ["item-1"])).toEqual({
      found: [],
      missing: [],
      locationMismatch: ["item-1"],
    });
  });

  it("returns empty classifications for a fully empty audit", () => {
    expect(computeAuditResults([], [])).toEqual({
      found: [],
      missing: [],
      locationMismatch: [],
    });
  });

  it("collapses duplicate scanned ids to one logical FOUND item", () => {
    expect(computeAuditResults(["item-1"], ["item-1", "item-1", "item-1"])).toEqual({
      found: ["item-1"],
      missing: [],
      locationMismatch: [],
    });
  });

  it("does not mutate either input array", () => {
    const inScope = ["item-1", "item-2"];
    const scanned = ["item-1", "item-1", "item-3"];

    computeAuditResults(inScope, scanned);

    expect(inScope).toEqual(["item-1", "item-2"]);
    expect(scanned).toEqual(["item-1", "item-1", "item-3"]);
  });
});

describe("collapseAuditRows", () => {
  const row = (itemId: string, scannedAt: Date | null) => ({ itemId, scannedAt });

  it("keeps one row per item, in order of first appearance", () => {
    const collapsed = collapseAuditRows([
      row("item-1", new Date("2026-01-01T10:00:00.000Z")),
      row("item-2", new Date("2026-01-01T10:01:00.000Z")),
      row("item-1", new Date("2026-01-01T10:02:00.000Z")),
    ]);

    expect(collapsed.map((r) => r.itemId)).toEqual(["item-1", "item-2"]);
  });

  it("keeps the latest scannedAt when a sticker is scanned twice", () => {
    const collapsed = collapseAuditRows([
      row("item-1", new Date("2026-01-01T10:00:00.000Z")),
      row("item-1", new Date("2026-01-01T11:30:00.000Z")),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.scannedAt).toEqual(new Date("2026-01-01T11:30:00.000Z"));
  });

  it("prefers a real scan over a completion-written MISSING row (scannedAt null)", () => {
    const collapsed = collapseAuditRows([
      row("item-1", null),
      row("item-1", new Date("2026-01-01T10:00:00.000Z")),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.scannedAt).not.toBeNull();
  });

  it("is a no-op when no item repeats", () => {
    const rows = [row("a", null), row("b", null), row("c", null)];
    expect(collapseAuditRows(rows)).toEqual(rows);
  });
});
