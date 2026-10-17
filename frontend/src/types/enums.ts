/**
 * Mirrored from `backend/prisma/schema.prisma`. Keep these in lockstep with the
 * schema by hand — there is no generated client shared across the monorepo
 * (frontend-plan.md §13: "No OpenAPI spec... types drift silently").
 */

export const ROLES = [
  "SYSTEM_ADMIN",
  "PROPERTY_OFFICER",
  "DEPARTMENT_HEAD",
  "STAFF",
  "AUDITOR",
] as const;
export type Role = (typeof ROLES)[number];

/**
 * The roles that are **never self-registered** (authority doc D2): a Head,
 * Property Officer, Auditor and System Admin account comes only through an invite
 * an administrator issues with a recorded outside authorization. Everyone else
 * asks for an account through `/request-account`.
 *
 * Mirrors `INVITABLE_ROLES` in `backend/src/services/invites.ts`, which is the
 * server's half of the same rule — the client decides which roles the form
 * *offers*, the server decides which the API *accepts*.
 */
export const INVITABLE_ROLES = [
  "DEPARTMENT_HEAD",
  "PROPERTY_OFFICER",
  "AUDITOR",
  "SYSTEM_ADMIN",
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

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

export const REQUEST_STATUSES = ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2", "APPROVED", "REJECTED", "WAITLISTED", "WITHDRAWN", "INVALIDATED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const AUDIT_ITEM_RESULTS = [
  "PENDING",
  "FOUND",
  "LOCATION_MISMATCH",
  "DAMAGED",
  "NOT_LOCATED",
  "NOT_ACCESSIBLE",
  "CHECK_AGAIN",
  "MISSING",
] as const;
export type AuditItemResult = (typeof AUDIT_ITEM_RESULTS)[number];

export const AUDIT_SESSION_STATUSES = [
  "IN_PROGRESS",
  "SORTING",
  "COMPLETED",
  "ACKNOWLEDGED",
] as const;
export type AuditSessionStatus = (typeof AUDIT_SESSION_STATUSES)[number];

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
  PENDING_STAGE1: "Stage 1 pending approval",
  PENDING_STAGE2: "Stage 2 pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WAITLISTED: "Waitlisted",
  WITHDRAWN: "Withdrawn",
  INVALIDATED: "Invalidated",
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  TRANSFER: "Transfer",
  DISPOSAL: "Disposal",
};

export const AUDIT_RESULT_LABELS: Record<AuditItemResult, string> = {
  PENDING: "Pending scan",
  FOUND: "Found",
  LOCATION_MISMATCH: "Wrong location",
  DAMAGED: "Damaged",
  NOT_LOCATED: "Not located",
  NOT_ACCESSIBLE: "Not accessible",
  CHECK_AGAIN: "Check again",
  MISSING: "Missing",
};

export const AUDIT_SESSION_STATUS_LABELS: Record<AuditSessionStatus, string> = {
  IN_PROGRESS: "In progress",
  SORTING: "Sorting / Review",
  COMPLETED: "Completed (Locked)",
  ACKNOWLEDGED: "Acknowledged & Signed Off",
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
  PROPERTY_OFFICER: "Property Officer",
  DEPARTMENT_HEAD: "Department Head",
  STAFF: "Staff",
  AUDITOR: "Auditor",
};
