import type { DbClient } from "../lib/dbClient.js";

/**
 * In-app notifications (SRS F8.1/F8.2).
 *
 * ── Decision D3: why messages carry a bracketed code ──────────────────────
 * `Notification` has no `type` column and Phase 2 adds no migration, but the
 * frontend needs to branch on what happened (icon, colour, where a click goes).
 * So the code is stored as a `[CODE]` prefix inside `message` and stripped out
 * again by `parseNotificationMessage()` before the API responds. Rows written by
 * anything else — a future feature, a hand-inserted row — simply parse as
 * `{ code: null, message: <raw> }`, which is what makes this safe with no schema
 * change and no backfill.
 *
 * Messages always identify things by `tagId` and `fullName`, never by uuid:
 * these strings are read by humans in a notification list.
 */

export const NOTIFICATION_CODES = {
  REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
  REQUEST_APPROVED: "REQUEST_APPROVED",
  REQUEST_REJECTED: "REQUEST_REJECTED",
} as const;

export type NotificationCode = (typeof NOTIFICATION_CODES)[keyof typeof NOTIFICATION_CODES];

const KNOWN_CODES: ReadonlySet<string> = new Set<string>(Object.values(NOTIFICATION_CODES));

/** Matches a leading "[CODE] " prefix. `[\s\S]` so a multi-line message survives. */
const CODE_PREFIX = /^\[([A-Z_]+)\]\s*([\s\S]*)$/;

export const MAX_REJECTION_REASON_LENGTH = 500;

export type RequestTypeValue = "TRANSFER" | "DISPOSAL";
export type DecisionValue = "APPROVED" | "REJECTED";

export interface RequestSubmittedInput {
  requesterName: string;
  requestType: RequestTypeValue;
  itemTagId: string;
  itemName: string;
}

/** "[REQUEST_SUBMITTED] Demo Staff requested a TRANSFER for item CNCS-DEMO-0001 (Dell Latitude Laptop) and it needs your review." */
export function renderRequestSubmitted(input: RequestSubmittedInput): string {
  return (
    `[${NOTIFICATION_CODES.REQUEST_SUBMITTED}] ${input.requesterName} requested a ` +
    `${input.requestType} for item ${input.itemTagId} (${input.itemName}) ` +
    `and it needs your review.`
  );
}

export interface RequestDecidedInput {
  decision: DecisionValue;
  requestType: RequestTypeValue;
  itemTagId: string;
  itemName: string;
  reviewerName: string;
  rejectionReason?: string | undefined;
}

/**
 * "[REQUEST_APPROVED] Your TRANSFER request for item CNCS-DEMO-0001 (Dell Latitude Laptop) was approved by System Admin."
 * "[REQUEST_REJECTED] Your DISPOSAL request for item CNCS-DEMO-0003 (Microscope) was rejected by System Admin. Reason: Item is still serviceable."
 */
export function renderRequestDecided(input: RequestDecidedInput): string {
  const code =
    input.decision === "APPROVED"
      ? NOTIFICATION_CODES.REQUEST_APPROVED
      : NOTIFICATION_CODES.REQUEST_REJECTED;
  const verb = input.decision === "APPROVED" ? "approved" : "rejected";

  let message =
    `[${code}] Your ${input.requestType} request for item ${input.itemTagId} ` +
    `(${input.itemName}) was ${verb} by ${input.reviewerName}.`;

  const reason = input.rejectionReason?.trim();
  if (input.decision === "REJECTED" && reason) {
    message += ` Reason: ${reason.slice(0, MAX_REJECTION_REASON_LENGTH)}`;
  }

  return message;
}

/**
 * Splits the stored `[CODE] text` form back apart for the API response.
 * An unrecognised or absent prefix yields `{ code: null, message: <raw> }` —
 * the message is still shown, just without a code to branch on.
 */
export function parseNotificationMessage(raw: string): {
  code: NotificationCode | null;
  message: string;
} {
  const match = CODE_PREFIX.exec(raw);
  const candidate = match?.[1];
  if (!match || !candidate || !KNOWN_CODES.has(candidate)) {
    return { code: null, message: raw };
  }
  return { code: candidate as NotificationCode, message: match[2] ?? "" };
}

/**
 * Decision D2 — who is told a request needs review.
 *
 * `Request.reviewedById` is null at submit time, so there is nobody specific to
 * notify: fan out to everyone who is allowed to decide it. Approval is
 * ADMIN-only (SRS §9 leaves the reviewer role unresolved; ADMIN-only is the
 * reading that needs no schema change), minus the requester — an admin who filed
 * the request already knows about it and is barred from deciding it anyway.
 */
export function reviewerRecipientsWhere(requesterId: string): {
  role: "ADMIN";
  id: { not: string };
} {
  return { role: "ADMIN", id: { not: requesterId } };
}

export async function resolveReviewerRecipients(
  client: DbClient,
  requesterId: string,
): Promise<Array<{ id: string; email: string; fullName: string }>> {
  return client.user.findMany({
    where: reviewerRecipientsWhere(requesterId),
    select: { id: true, email: true, fullName: true },
  });
}

export interface NotifyReviewersInput extends RequestSubmittedInput {
  requestId: string;
  requesterId: string;
  createdAt: Date;
}

/**
 * Writes one notification per eligible reviewer in a single `createMany`.
 * Call this inside the same transaction that creates the Request so a request
 * can never exist unnotified.
 *
 * Returns the recipients so the caller can fire the email side-channel after
 * the transaction commits.
 */
export async function notifyReviewersOfNewRequest(
  client: DbClient,
  input: NotifyReviewersInput,
): Promise<Array<{ id: string; email: string; fullName: string }>> {
  const recipients = await resolveReviewerRecipients(client, input.requesterId);

  if (recipients.length === 0) {
    // A request nobody can see is an operational hazard, not a validation
    // error: the request is still created, but say so loudly in the logs.
    console.warn(
      `No eligible reviewer for request ${input.requestId} — no ADMIN exists other than the requester.`,
    );
    return recipients;
  }

  const message = renderRequestSubmitted(input);
  await client.notification.createMany({
    data: recipients.map((recipient) => ({
      userId: recipient.id,
      message,
      relatedRequestId: input.requestId,
      createdAt: input.createdAt,
    })),
  });

  return recipients;
}

export interface NotifyRequesterInput extends RequestDecidedInput {
  requestId: string;
  requesterId: string;
  decidedAt: Date;
}

/** Single row back to whoever filed the request (F8.2). */
export async function notifyRequesterOfDecision(
  client: DbClient,
  input: NotifyRequesterInput,
): Promise<string> {
  const message = renderRequestDecided(input);
  await client.notification.create({
    data: {
      userId: input.requesterId,
      message,
      relatedRequestId: input.requestId,
      createdAt: input.decidedAt,
    },
  });
  return message;
}

/** Subject line for the optional email side-channel (services/email.ts). */
export function emailSubjectFor(code: NotificationCode | null): string {
  switch (code) {
    case NOTIFICATION_CODES.REQUEST_SUBMITTED:
      return "CNCS Property: a request needs your review";
    case NOTIFICATION_CODES.REQUEST_APPROVED:
      return "CNCS Property: your request was approved";
    case NOTIFICATION_CODES.REQUEST_REJECTED:
      return "CNCS Property: your request was rejected";
    default:
      return "CNCS Property: notification";
  }
}
