export interface RequestingUser {
  id: string;
  role: "ADMIN" | "STAFF";
}

const RESTRICTED_FIELDS = new Set([
  "purchaseCost",
  "currentValue",
  "brand",
  "model",
  "serialNumber",
  "notes",
  "accessories",
  "ownerId",
  "owner",
]);

export function sanitizeItem(
  item: Record<string, unknown>,
  user?: RequestingUser | null
): Record<string, unknown> {
  const isPrivileged = user && (user.role === "ADMIN" || user.role === "STAFF");
  const isOwner = user && typeof item.ownerId === "string" && user.id === item.ownerId;

  if (isPrivileged || isOwner) {
    return item;
  }

  const publicSafeFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!RESTRICTED_FIELDS.has(key)) {
      publicSafeFields[key] = value;
    }
  }

  return publicSafeFields;
}