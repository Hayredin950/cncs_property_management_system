import { prisma } from "../lib/prisma.js";
import { httpError } from "../lib/httpError.js";

/**
 * Workflow-completeness-spec.md §7: Shared expiry/escalation mechanism
 *
 * Every state that waits on a specific person (claim, approval, return-confirm,
 * handover verification) needs the same two things:
 * 1. A configurable window (from environment variables)
 * 2. An escalation target when the window passes
 */

const CLAIM_WINDOW_DAYS = parseInt(process.env.CLAIM_WINDOW_DAYS || "7", 10);
const APPROVAL_ESCALATION_DAYS = parseInt(process.env.APPROVAL_ESCALATION_DAYS || "7", 10);
const RETURN_CONFIRM_WINDOW_DAYS = parseInt(process.env.RETURN_CONFIRM_WINDOW_DAYS || "7", 10);
const HANDOVER_VERIFICATION_WINDOW_DAYS = parseInt(process.env.HANDOVER_VERIFICATION_WINDOW_DAYS || "14", 10);

/**
 * Check and handle expired claims (PENDING_CLAIM items past claimDueAt)
 * Escalates to Property Officer
 */
export async function checkExpiredClaims(): Promise<number> {
  const now = new Date();
  
  const expiredItems = await prisma.item.findMany({
    where: {
      status: "PENDING_CLAIM",
      claimDueAt: { lt: now },
    },
    select: { id: true, holderId: true, orgUnitId: true },
  });

  if (expiredItems.length === 0) {
    return 0;
  }

  // Find a Property Officer to escalate to
  const propertyOfficer = await prisma.user.findFirst({
    where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
    select: { id: true },
  });

  if (!propertyOfficer) {
    // No Property Officer available - log and return
    console.error("No Property Officer available to escalate expired claims");
    return expiredItems.length;
  }

  let count = 0;
  for (const item of expiredItems) {
    await prisma.$transaction(async (tx) => {
      // Revert item to COLLEGE pool
      await tx.item.update({
        where: { id: item.id },
        data: {
          holderType: "COLLEGE",
          holderId: null,
          status: "ACTIVE",
          claimDueAt: null,
        },
      });

      // Record custody event
      await tx.custodyEvent.create({
        data: {
          itemId: item.id,
          eventType: "CLAIM_EXPIRED",
          fromHolderType: item.holderId ? "STAFF" : "DEPARTMENT",
          fromHolderId: item.holderId,
          toHolderType: "COLLEGE",
          toHolderId: null,
          actingUserId: propertyOfficer.id,
          reason: "Claim expired - escalated to Property Officer",
        },
      });

      // Notify the original claimant if they were a staff member
      if (item.holderId) {
        await tx.notification.create({
          data: {
            userId: item.holderId,
            message: `Your claim for item ${item.id} has expired. Please contact the Property Officer.`,
          },
        });
      }
    });
    count++;
  }

  return count;
}

/**
 * Check and handle expired return confirmations (RETURN_PENDING_CONFIRMATION past window)
 * Escalates to Property Officer
 */
export async function checkExpiredReturnConfirmations(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - RETURN_CONFIRM_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const expiredRequests = await prisma.request.findMany({
    where: {
      status: "RETURN_PENDING_CONFIRMATION",
      loanReturnedAt: { lt: cutoff },
    },
    select: { id: true, requestedById: true, itemId: true },
  });

  if (expiredRequests.length === 0) {
    return 0;
  }

  // Find a Property Officer to escalate to
  const propertyOfficer = await prisma.user.findFirst({
    where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
    select: { id: true },
  });

  if (!propertyOfficer) {
    console.error("No Property Officer available to escalate expired return confirmations");
    return expiredRequests.length;
  }

  let count = 0;
  for (const request of expiredRequests) {
    await prisma.$transaction(async (tx) => {
      // Add a note to the request
      await tx.request.update({
        where: { id: request.id },
        data: {
          rejectionReason: `Return confirmation expired ${new Date().toISOString()} - escalated to Property Officer for verification`,
        },
      });

      // Notify the borrower
      await tx.notification.create({
        data: {
          userId: request.requestedById,
          message: `Your return for item ${request.itemId} has not been confirmed. Contact the Property Officer.`,
          relatedRequestId: request.id,
        },
      });

      // Notify Property Officer
      await tx.notification.create({
        data: {
          userId: propertyOfficer.id,
          message: `Return confirmation expired for request ${request.id}. Please verify.`,
          relatedRequestId: request.id,
        },
      });
    });
    count++;
  }

  return count;
}

/**
 * Check and handle expired handover verifications (REVERTED_UNVERIFIED past window)
 * Escalates to SYSTEM_ADMIN
 */
export async function checkExpiredHandoverVerifications(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - HANDOVER_VERIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const expiredItems = await prisma.item.findMany({
    where: {
      status: "REVERTED_UNVERIFIED",
      updatedAt: { lt: cutoff },
    },
    select: { id: true, orgUnitId: true },
  });

  if (expiredItems.length === 0) {
    return 0;
  }

  // Find a SYSTEM_ADMIN to escalate to
  const sysAdmin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
    select: { id: true },
  });

  if (!sysAdmin) {
    console.error("No SYSTEM_ADMIN available to escalate expired handover verifications");
    return expiredItems.length;
  }

  let count = 0;
  for (const item of expiredItems) {
    await prisma.$transaction(async (tx) => {
      // Notify SYSTEM_ADMIN
      await tx.notification.create({
        data: {
          userId: sysAdmin.id,
          message: `Handover verification expired for item ${item.id} in unit ${item.orgUnitId}. Please investigate.`,
        },
      });
    });
    count++;
  }

  return count;
}

/**
 * Run all expiry checks at once
 * Returns counts of expired items for each category
 */
export async function checkAllExpiries(): Promise<{
  expiredClaims: number;
  expiredReturnConfirmations: number;
  expiredHandoverVerifications: number;
}> {
  const [expiredClaims, expiredReturnConfirmations, expiredHandoverVerifications] = await Promise.all([
    checkExpiredClaims(),
    checkExpiredReturnConfirmations(),
    checkExpiredHandoverVerifications(),
  ]);

  return {
    expiredClaims,
    expiredReturnConfirmations,
    expiredHandoverVerifications,
  };
}
