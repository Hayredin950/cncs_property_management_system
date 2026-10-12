/**
 * Mirrored from `backend/prisma/schema.prisma`. Keep these in lockstep with the
 * schema by hand — there is no generated client shared across the monorepo
 * (frontend-plan.md §13: "No OpenAPI spec... types drift silently").
 */

export const ROLES = [
  "SYSTEM_ADMIN",
  "ACCOUNT_ADMIN",
  "PROPERTY_OFFICER",
  "DEPARTMENT_HEAD",
  "STAFF",
  "AUDITOR",
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Account lifecycle (spec 3.1.2). `PENDING_APPROVAL` is the state a self-request
 * lands in: it cannot sign in, and a SYSTEM_ADMIN decides it from the queue.
 */
export const ACCOUNT_STATUSES = [
  "ACTIVE",
  "PENDING_EMAIL_VERIFICATION",
  "PENDING_APPROVAL",
  "REJECTED",
  "DEACTIVATED",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "BEYOND_REPAIR"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const ITEM_STATUSES = [
  "ACTIVE",
  "PENDING_CLAIM",
  "REVERTED_UNVERIFIED",
  "LOANED",
  "LOST",
  "DISPOSED",
  "VOIDED",
] as const;
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
  PENDING_CLAIM: "Waiting for claim",
  REVERTED_UNVERIFIED: "Returned unverified",
  LOANED: "On loan",
  LOST: "Lost",
  DISPOSED: "Disposed",
  VOIDED: "Voided",
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

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  PENDING_EMAIL_VERIFICATION: "Email not confirmed",
  PENDING_APPROVAL: "Waiting for approval",
  REJECTED: "Declined",
  DEACTIVATED: "Deactivated",
};

export const ROLE_LABELS: Record<Role, string> = {
  SYSTEM_ADMIN: "System Admin",
  ACCOUNT_ADMIN: "Account Admin",
  PROPERTY_OFFICER: "Property Officer",
  DEPARTMENT_HEAD: "Department Head",
  STAFF: "Staff",
  AUDITOR: "Auditor",
};
