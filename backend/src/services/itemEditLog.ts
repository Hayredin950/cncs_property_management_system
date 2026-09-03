import type { DbClient } from "../lib/dbClient.js";

/**
 * Item edit audit trail (SRS F2.3 / F6.3): one ItemEditLog row per changed
 * field, never one row per edit.
 *
 * ── Contract for the Items track ──────────────────────────────────────────
 * `PUT /items/:id` must call `buildEditLogRows()` + `writeEditLogRows()` inside
 * its own `prisma.$transaction`, passing the pre-update row as `before` and its
 * own update payload as `after`. Do NOT reimplement diffing or value formatting
 * there — the serialization rules below (decision D1 in docs/phase-2.md) are
 * what make history rows comparable across the approval path and the edit path,
 * and `services/itemEditLog.test.ts` is what pins them down.
 *
 * Correlating the rows written by one approval: every row from a single decision
 * shares an exact `editedAt`, created once before the transaction opens and also
 * written to `Request.decidedAt`. That timestamp is the correlation key —
 * `ItemEditLog` has no `requestId` column and Phase 2 adds no migration.
 */

/**
 * Closed list of Item columns whose changes are auditable. `fieldChanged` is
 * always the exact Prisma field name (`ownerId`, not `owner`) so a reader can
 * map a history row back to a column without guessing.
 *
 * Deliberately excluded: `id` and `tagId` (immutable identifiers — SDS 3.2),
 * `registeredAt` (set once at creation), and `lastAuditedAt` (maintained by the
 * Phase 3 audit run, not a user edit).
 */
export const TRACKED_ITEM_FIELDS = [
  "name",
  "categoryId",
  "department",
  "building",
  "floor",
  "room",
  "ownerId",
  "purchaseCost",
  "currentValue",
  "condition",
  "brand",
  "model",
  "serialNumber",
  "photoUrl",
  "notes",
  "status",
  "disposalReason",
  "disposedAt",
  "parentItemId",
] as const;

export type TrackedItemField = (typeof TRACKED_ITEM_FIELDS)[number];

const TRACKED_FIELD_SET: ReadonlySet<string> = new Set<string>(TRACKED_ITEM_FIELDS);

/** Prisma `Decimal` columns — formatted to two places so "45000" and "45000.00" never read as a change. */
const DECIMAL_ITEM_FIELDS: ReadonlySet<string> = new Set<string>(["purchaseCost", "currentValue"]);

/** Columns holding another row's id, rendered as "<display name> (<id>)". */
export const FOREIGN_KEY_ITEM_FIELDS: ReadonlySet<string> = new Set<string>([
  "categoryId",
  "ownerId",
  "parentItemId",
]);

/** Partial Item shape — only the fields a caller actually read or wrote. */
export type ItemFieldValues = Partial<Record<TrackedItemField, unknown>>;

/** id → human-readable label, used to expand foreign keys. */
export type DisplayLabels = Readonly<Record<string, string>>;

function hasToFixed(value: unknown): value is { toFixed(digits: number): string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  );
}

/**
 * Decision D1. `oldValue`/`newValue` are `String?` in the schema but the tracked
 * columns include Decimal, DateTime, enums and uuids, so every value needs one
 * agreed textual form:
 *
 *   null / undefined → SQL NULL (never the string "null", which would be
 *                      indistinguishable from a user typing "null")
 *   Decimal          → two decimal places
 *   DateTime         → ISO 8601 UTC
 *   boolean          → "true" / "false"
 *   enum             → the schema's own name, e.g. "DISPOSED"
 *   string           → trimmed
 *   foreign key      → "<display name> (<id>)" when a label is known, else the
 *                      bare id — both halves, because a uuid alone is unreadable
 *                      and a name alone breaks the moment someone is renamed
 */
export function serializeFieldValue(
  field: TrackedItemField,
  value: unknown,
  labels: DisplayLabels = {},
): string | null {
  if (value === null || value === undefined) return null;

  if (DECIMAL_ITEM_FIELDS.has(field)) {
    if (typeof value === "number") return value.toFixed(2);
    if (hasToFixed(value)) return value.toFixed(2);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value).trim();
  }

  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "bigint") return String(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!FOREIGN_KEY_ITEM_FIELDS.has(field)) return trimmed;
    const label = labels[trimmed];
    return label ? `${label} (${trimmed})` : trimmed;
  }

  return String(value);
}

export interface ItemFieldChange {
  fieldChanged: TrackedItemField;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Compares only the fields named in `after` — a Prisma update payload lists
 * exactly what the caller intends to change, so anything absent is untouched
 * and must not produce a row. Fields outside TRACKED_ITEM_FIELDS are ignored,
 * and a field whose serialized value is unchanged is dropped (no no-op rows).
 */
export function diffItemFields(
  before: ItemFieldValues,
  after: ItemFieldValues,
  labels: DisplayLabels = {},
): ItemFieldChange[] {
  const changes: ItemFieldChange[] = [];

  for (const key of Object.keys(after)) {
    if (!TRACKED_FIELD_SET.has(key)) continue;
    const field = key as TrackedItemField;

    const oldValue = serializeFieldValue(field, before[field], labels);
    const newValue = serializeFieldValue(field, after[field], labels);
    if (oldValue === newValue) continue;

    changes.push({ fieldChanged: field, oldValue, newValue });
  }

  return changes;
}

/** Exactly the columns ItemEditLog needs — safe to hand straight to createMany. */
export interface EditLogRow {
  itemId: string;
  editedById: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  editedAt: Date;
}

export interface BuildEditLogRowsInput {
  itemId: string;
  editedById: string;
  /**
   * Shared across every row written by one edit or one approval decision.
   * Passed in rather than relying on `@default(now())` so the parent item and
   * its cascaded accessories are provably part of the same event.
   */
  editedAt: Date;
  before: ItemFieldValues;
  after: ItemFieldValues;
  labels?: DisplayLabels;
}

export function buildEditLogRows(input: BuildEditLogRowsInput): EditLogRow[] {
  return diffItemFields(input.before, input.after, input.labels ?? {}).map((change) => ({
    itemId: input.itemId,
    editedById: input.editedById,
    fieldChanged: change.fieldChanged,
    oldValue: change.oldValue,
    newValue: change.newValue,
    editedAt: input.editedAt,
  }));
}

/**
 * Single insert for all rows. Returns the number written, and skips the round
 * trip entirely for an empty diff so `createMany` is never called with `[]`.
 */
export async function writeEditLogRows(client: DbClient, rows: EditLogRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await client.itemEditLog.createMany({ data: rows });
  return result.count;
}
