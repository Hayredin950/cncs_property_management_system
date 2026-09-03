import { describe, expect, it, vi } from "vitest";
import {
  buildEditLogRows,
  diffItemFields,
  serializeFieldValue,
  TRACKED_ITEM_FIELDS,
  writeEditLogRows,
} from "./itemEditLog.js";

/**
 * Decision D1 lives or dies here: `oldValue`/`newValue` are `String?` in the
 * schema, so every tracked column — Decimal, DateTime, enum, uuid — needs one
 * agreed textual form, and the approval path and the future `PUT /items/:id`
 * must produce the identical string for the identical change.
 */

describe("serializeFieldValue", () => {
  it("maps null and undefined to SQL NULL, never the string \"null\"", () => {
    expect(serializeFieldValue("notes", null)).toBeNull();
    expect(serializeFieldValue("notes", undefined)).toBeNull();
    // The distinction that makes it worth stating: a user typing "null" is data.
    expect(serializeFieldValue("notes", "null")).toBe("null");
  });

  it("formats Decimal columns to two places so 45000 and 45000.00 are one value", () => {
    expect(serializeFieldValue("purchaseCost", 45000)).toBe("45000.00");
    expect(serializeFieldValue("purchaseCost", "45000")).toBe("45000.00");
    expect(serializeFieldValue("currentValue", 32000.5)).toBe("32000.50");
    // Prisma hands back a Decimal object, not a number.
    const decimalLike = { toFixed: (digits: number) => (45000).toFixed(digits) };
    expect(serializeFieldValue("purchaseCost", decimalLike)).toBe("45000.00");
  });

  it("writes DateTime as ISO 8601 UTC", () => {
    expect(serializeFieldValue("disposedAt", new Date("2026-09-02T08:00:00.000Z"))).toBe(
      "2026-09-02T08:00:00.000Z",
    );
  });

  it("keeps enums as their schema name and trims plain strings", () => {
    expect(serializeFieldValue("status", "DISPOSED")).toBe("DISPOSED");
    expect(serializeFieldValue("name", "  Dell Latitude Laptop  ")).toBe("Dell Latitude Laptop");
  });

  it("renders booleans as true/false", () => {
    expect(serializeFieldValue("notes", true)).toBe("true");
    expect(serializeFieldValue("notes", false)).toBe("false");
  });

  it("expands a foreign key to \"<name> (<id>)\", and falls back to the bare id", () => {
    expect(serializeFieldValue("ownerId", "staff-1", { "staff-1": "Demo Staff" })).toBe(
      "Demo Staff (staff-1)",
    );
    // A name alone would break the moment someone is renamed; an id alone is
    // unreadable. With no label available the id is still better than nothing.
    expect(serializeFieldValue("ownerId", "staff-1")).toBe("staff-1");
    // Only foreign-key columns get the treatment.
    expect(serializeFieldValue("room", "312", { "312": "Room 312" })).toBe("312");
  });
});

describe("diffItemFields", () => {
  it("compares only the fields named in `after`", () => {
    const changes = diffItemFields(
      { room: "312", floor: "3", name: "Dell Latitude Laptop" },
      { room: "101" },
    );
    expect(changes).toEqual([{ fieldChanged: "room", oldValue: "312", newValue: "101" }]);
  });

  it("drops no-op changes rather than logging them", () => {
    expect(diffItemFields({ room: "312" }, { room: "312" })).toEqual([]);
    // Equal after serialization counts as equal: 45000 vs "45000.00".
    expect(diffItemFields({ purchaseCost: 45000 }, { purchaseCost: "45000.00" })).toEqual([]);
  });

  it("ignores fields outside the tracked list", () => {
    const changes = diffItemFields(
      { name: "Dell Latitude Laptop" },
      { tagId: "CNCS-DEMO-9999", id: "item-2", registeredAt: new Date(), room: "101" } as never,
    );
    expect(changes.map((change) => change.fieldChanged)).toEqual(["room"]);
  });

  it("records a first value being set and a value being cleared", () => {
    expect(diffItemFields({ notes: null }, { notes: "Screen replaced" })).toEqual([
      { fieldChanged: "notes", oldValue: null, newValue: "Screen replaced" },
    ]);
    expect(diffItemFields({ notes: "Screen replaced" }, { notes: null })).toEqual([
      { fieldChanged: "notes", oldValue: "Screen replaced", newValue: null },
    ]);
  });

  it("keeps tagId and id out of the tracked list on purpose", () => {
    expect(TRACKED_ITEM_FIELDS).not.toContain("id");
    expect(TRACKED_ITEM_FIELDS).not.toContain("tagId");
    expect(TRACKED_ITEM_FIELDS).not.toContain("registeredAt");
    expect(TRACKED_ITEM_FIELDS).not.toContain("lastAuditedAt");
  });
});

describe("buildEditLogRows", () => {
  const editedAt = new Date("2026-09-03T10:00:00.000Z");

  it("writes one row per changed field, all sharing editedById and editedAt", () => {
    const rows = buildEditLogRows({
      itemId: "item-1",
      editedById: "admin-1",
      editedAt,
      before: { building: "CNCS Building", floor: "3", room: "312", ownerId: "staff-1" },
      after: { floor: "1", room: "101", ownerId: "staff-2" },
      labels: { "staff-1": "Demo Staff", "staff-2": "Second Staff" },
    });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.editedAt === editedAt)).toBe(true);
    expect(rows.every((row) => row.editedById === "admin-1")).toBe(true);
    expect(rows.every((row) => row.itemId === "item-1")).toBe(true);
    expect(rows).toContainEqual({
      itemId: "item-1",
      editedById: "admin-1",
      fieldChanged: "ownerId",
      oldValue: "Demo Staff (staff-1)",
      newValue: "Second Staff (staff-2)",
      editedAt,
    });
  });

  it("returns nothing for an edit that changed nothing", () => {
    expect(
      buildEditLogRows({
        itemId: "item-1",
        editedById: "admin-1",
        editedAt,
        before: { room: "312" },
        after: { room: "312" },
      }),
    ).toEqual([]);
  });
});

describe("writeEditLogRows", () => {
  it("skips the round trip entirely for an empty diff", async () => {
    const createMany = vi.fn();
    const written = await writeEditLogRows({ itemEditLog: { createMany } } as never, []);

    expect(written).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("inserts every row in one call and returns the count", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const rows = buildEditLogRows({
      itemId: "item-1",
      editedById: "admin-1",
      editedAt: new Date("2026-09-03T10:00:00.000Z"),
      before: { floor: "3", room: "312" },
      after: { floor: "1", room: "101" },
    });

    const written = await writeEditLogRows({ itemEditLog: { createMany } } as never, rows);

    expect(written).toBe(2);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({ data: rows });
  });
});
