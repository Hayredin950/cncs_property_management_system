export interface AuditResults {
  found: string[];
  missing: string[];
  locationMismatch: string[];
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
