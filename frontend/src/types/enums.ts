/**
 * Mirrored from `backend/prisma/schema.prisma`. Keep these in lockstep with the
 * schema by hand — there is no generated client shared across the monorepo
 * (frontend-plan.md §13: "No OpenAPI spec... types drift silently").
 */

export const ROLES = ["ADMIN", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "BEYOND_REPAIR"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const ITEM_STATUSES = ["ACTIVE", "DISPOSED"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const REQUEST_TYPES = ["TRANSFER", "DISPOSAL"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const AUDIT_ITEM_RESULTS = ["FOUND", "MISSING", "LOCATION_MISMATCH"] as const;
export type AuditItemResult = (typeof AUDIT_ITEM_RESULTS)[number];

export const NOTIFICATION_CODES = [
  "REQUEST_SUBMITTED",
  "REQUEST_APPROVED",
  "REQUEST_REJECTED",
] as const;
export type NotificationCode = (typeof NOTIFICATION_CODES)[number];

/** `frontend-design-system.md` §3.2 — human labels for every enum value, one place. */
export const CONDITION_LABELS: Record<Condition, string> = {
  NEW: "New",
  GOOD: "Good",
  FAIR: "Fair",
  DAMAGED: "Damaged",
  BEYOND_REPAIR: "Beyond repair",
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  ACTIVE: "In service",
  DISPOSED: "Disposed",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  TRANSFER: "Transfer",
  DISPOSAL: "Disposal",
};

export const AUDIT_RESULT_LABELS: Record<AuditItemResult, string> = {
  FOUND: "Found",
  MISSING: "Missing",
  LOCATION_MISMATCH: "Wrong location",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  STAFF: "Staff",
};
