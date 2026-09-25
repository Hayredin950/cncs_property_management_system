import { describe, expect, it } from "vitest";
import { mergeStoredScans } from "./auditWalkthrough";
import { AUDIT_READBACK, AUDIT_STORED_ROWS, PRIVILEGED_ITEM } from "../test/fixtures";
import type { ScannedAuditItem } from "../types/audit";

/**
 * The merge is the whole reason the walkthrough stops looking like it lost
 * everything: `sessionStorage` is per tab, so a new tab used to show an empty list
 * while the server already held every scan.
 */
describe("mergeStoredScans", () => {
  const localScan: ScannedAuditItem = {
    itemId: "item-local",
    tagId: "CNCS-LOCAL000",
    name: "Scanned in this tab",
    room: "Room 1",
    scannedAt: "2026-09-22T08:10:00.000Z",
  };

  it("returns the local list unchanged when there is no read-back", () => {
    expect(mergeStoredScans([localScan], undefined)).toEqual([localScan]);
  });

  it("adds stored scans to the local list, oldest first", () => {
    const merged = mergeStoredScans(
      [localScan],
      AUDIT_READBACK("audit-1", { rows: AUDIT_STORED_ROWS }),
    );

    expect(merged.map((entry) => entry.itemId)).toEqual([PRIVILEGED_ITEM.id, "item-local", "item-6"]);
  });

  it("skips rows for items nobody scanned", () => {
    const merged = mergeStoredScans([], AUDIT_READBACK("audit-1", { rows: AUDIT_STORED_ROWS }));

    // A `MISSING` row is written by completion and has no `scannedAt` — listing it
    // as scanned would claim the walk visited an item it never saw.
    expect(merged.map((entry) => entry.name)).not.toContain("Missing Monitor");
    // A `LOCATION_MISMATCH` row *was* scanned, just in the wrong place, so it stays.
    expect(merged.map((entry) => entry.name)).toContain("Misplaced Projector");
  });

  it("counts a scan once when it is in both lists", () => {
    const stored = AUDIT_READBACK("audit-1", { rows: AUDIT_STORED_ROWS });
    const local: ScannedAuditItem = {
      itemId: PRIVILEGED_ITEM.id,
      tagId: PRIVILEGED_ITEM.tagId,
      name: PRIVILEGED_ITEM.name,
      room: PRIVILEGED_ITEM.room,
      // The local copy is the one this tab just made — the same scan, not a second.
      scannedAt: "2026-09-22T08:06:00.000Z",
    };

    const merged = mergeStoredScans([local], stored);

    expect(merged.filter((entry) => entry.itemId === PRIVILEGED_ITEM.id)).toHaveLength(1);
    // The local timestamp wins, because the local entry is the one the client made.
    expect(merged.find((entry) => entry.itemId === PRIVILEGED_ITEM.id)?.scannedAt).toBe(
      "2026-09-22T08:06:00.000Z",
    );
  });

  it("leaves the local list alone when the session has no rows yet", () => {
    expect(mergeStoredScans([localScan], AUDIT_READBACK("audit-1"))).toEqual([localScan]);
  });
});
