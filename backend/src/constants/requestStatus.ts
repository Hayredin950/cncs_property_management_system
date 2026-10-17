/**
 * Shared request status enum - mirror this in frontend types/enums.ts
 * Keep in sync with Prisma schema.prisma RequestStatus enum
 */
export const REQUEST_STATUSES = [
  "PENDING",
  "PENDING_STAGE1",
  "PENDING_STAGE2",
  "APPROVED",
  "REJECTED",
  "WAITLISTED",
  "WITHDRAWN",
  "INVALIDATED",
  "RETURN_PENDING_CONFIRMATION",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: "Pending review",
  PENDING_STAGE1: "Stage 1 approved",
  PENDING_STAGE2: "Stage 2 approved",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WAITLISTED: "Waitlisted",
  WITHDRAWN: "Withdrawn",
  INVALIDATED: "Invalidated",
  RETURN_PENDING_CONFIRMATION: "Return pending",
};
