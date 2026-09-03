export interface RequestingUser {
  id: string;
  role: 'ADMIN' | 'STAFF';
}

/**
 * Strips restricted fields server-side before responding to any client.
 *
 * Rules (SDS Section 3.2 & SRS Section 3.4):
 * - Staff and Admin see all fields.
 * - The assigned owner (custodian) sees all fields when logged in.
 * - Public / Anonymous / Non-owner logged-in users NEVER receive:
 *   purchaseCost, currentValue, brand, model, serialNumber,
 *   notes, accessories, or owner/custodian identity details.
 */
export function sanitizeItem(
  item: Record<string, any>,
  user?: RequestingUser | null
): Record<string, any> {
  const isPrivileged = user && (user.role === 'ADMIN' || user.role === 'STAFF');
  const isOwner = user && user.id === item.ownerId;

  // Privileged staff/admin or verified item owner gets the complete record
  if (isPrivileged || isOwner) {
    return item;
  }

  // Strip all restricted fields completely before returning
  const {
    purchaseCost,
    currentValue,
    brand,
    model,
    serialNumber,
    notes,
    accessories,
    ownerId,
    owner,
    ...publicSafeFields
  } = item;

  return publicSafeFields;
}