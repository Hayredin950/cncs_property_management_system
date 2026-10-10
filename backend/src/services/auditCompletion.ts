export interface AuditResults {
  found: string[];
  missing: string[];
  locationMismatch: string[];
}

/**
 * Collapses repeated scan rows down to one row per item, keeping the row with
 * the latest `scannedAt` and preserving the order of first appearance.
 *
 * The schema deliberately permits more than one row for the same item in one
 * session — a second device scanning the same sticker appends a second `FOUND`
 * row, because the scan endpoint is a log, not an upsert. Classification already
 * collapses those (`computeAuditResults` works on a `Set`), but the *readers* did
 * not: `GET /audits`, `GET /audits/:id` and the audit CSV each counted rows, so a
 * double-scan inflated the FOUND figure and produced a duplicate CSV line. This
 * is the one place that collapse happens for reads, so all three agree.
 *
 * `scannedAt === null` sorts as oldest, so a real scan always beats a
 * completion-written `MISSING` row for the same item.
 */
export function collapseAuditRows<T extends { itemId: string; scannedAt: Date | string | null }>(
  rows: T[],
): T[] {
  const indexByItem = new Map<string, number>();
  const collapsed: T[] = [];

  for (const row of rows) {
    const at = indexByItem.get(row.itemId);
    if (at === undefined) {
      indexByItem.set(row.itemId, collapsed.length);
      collapsed.push(row);
      continue;
    }
    const existing = collapsed[at]!;
    if (timeOf(row.scannedAt) > timeOf(existing.scannedAt)) {
      collapsed[at] = row;
    }
  }

  return collapsed;
}

function timeOf(value: Date | string | null): number {
  if (value === null) {
    return Number.NEGATIVE_INFINITY;
  }
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Classifies an audit's item ids without knowing anything about persistence.
 * Callers collapse repeated scan rows before calling this function because the
 * schema deliberately permits multiple rows for one item in one session.
 */
export function computeAuditResults(
  inScopeItemIds: string[],
  scannedItemIds: string[],
): AuditResults {
  const inScopeIds = new Set(inScopeItemIds);
  const scannedIds = new Set(scannedItemIds);

  const found = inScopeItemIds.filter((itemId) => scannedIds.has(itemId));
  const missing = inScopeItemIds.filter((itemId) => !scannedIds.has(itemId));
  const locationMismatch = [...scannedIds].filter((itemId) => !inScopeIds.has(itemId));

  return { found, missing, locationMismatch };
}
