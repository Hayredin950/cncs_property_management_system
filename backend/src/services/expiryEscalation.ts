import type { DbClient } from "../lib/dbClient.js";

/**
 * Workflow-completeness-spec.md §7: Expiry and escalation
 * One consistent mechanism applied to every pending-human-action state.
 * 
 * This module provides functions to check and handle expired claims, approvals,
 * return confirmations, and handover verifications.
 */

const CLAIM_WINDOW_DAYS = 7;
const APPROVAL_ESCALATION_DAYS = 7;
const RETURN_CONFIRMATION_DAYS = 7;
const HANDOVER_VERIFICATION_DAYS = 14;

/**
 * Check for expired claims (PENDING_CLAIM items where claimDueAt has passed)
 * and escalate to Property Officer.
 */
export async function checkExpiredClaims(prisma: DbClient): Promise<number> {
  const now = new Date();
  let escalatedCount = 0;

  const expiredItems = await prisma.item.findMany({
    where: {
      status: "PENDING_CLAIM",
      claimDueAt: { lt: now },
    },
    select: {
      id: true,
      tagId: true,
      name: true,
      holderType: true,
      holderId: true,
      orgUnitId: true,
      claimDueAt: true,
    },
  });

  for (const item of expiredItems) {
    await prisma.$transaction(async (tx) => {
      // Revert item to ACTIVE with COLLEGE holder
      await tx.item.update({
        where: { id: item.id },
        data: {
          status: "ACTIVE",
          holderType: "COLLEGE",
          holderId: null,
          claimDueAt: null,
          claimedAt: null,
        },
      });

      // Record custody event
      await tx.custodyEvent.create({
        data: {
          itemId: item.id,
          eventType: "CLAIM_EXPIRED",
          fromHolderType: item.holderType,
          fromHolderId: item.holderId,
          toHolderType: "COLLEGE",
          toHolderId: null,
          actingUserId: (await tx.user.findFirst({
            where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
            select: { id: true },
          }))?.id ?? "",
          reason: `Claim expired after ${CLAIM_WINDOW_DAYS} days without action`,
        },
      });

      // Notify the claimant (if staff)
      if (item.holderId && item.holderType === "STAFF") {
        await tx.notification.create({
          data: {
            userId: item.holderId,
            message: `Your claim for item ${item.tagId} (${item.name}) has expired and been reverted to the college pool.`,
          },
        });
      }

      // Escalate to Property Officer
      const propertyOfficer = await tx.user.findFirst({
        where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
        select: { id: true },
      });
      if (propertyOfficer) {
        await tx.notification.create({
          data: {
            userId: propertyOfficer.id,
            message: `[CLAIM_EXPIRED] Item ${item.tagId} (${item.name}) claim expired. Was assigned to ${item.holderType === "STAFF" ? "staff" : "department"} ${item.holderId}. Reverted to college pool.`,
          },
        });
      }
    });

    escalatedCount++;
  }

  return escalatedCount;
}

/**
 * Check for expired approvals (requests in PENDING, PENDING_STAGE1, PENDING_STAGE2
 * that have been pending for more than APPROVAL_ESCALATION_DAYS)
 * and escalate to the next level.
 */
export async function checkExpiredApprovals(prisma: DbClient): Promise<number> {
  const cutoffDate = new Date(Date.now() - APPROVAL_ESCALATION_DAYS * 24 * 60 * 60 * 1000);
  let escalatedCount = 0;

  const staleRequests = await prisma.request.findMany({
    where: {
      status: { in: ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2"] },
      createdAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      type: true,
      status: true,
      reason: true,
      itemId: true,
      requestedById: true,
      reviewedById: true,
      reviewNote: true,
      item: { select: { tagId: true, name: true, orgUnitId: true } },
    },
  });

  for (const request of staleRequests) {
    const reviewerId = request.reviewedById;
    if (!reviewerId) continue;

    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { id: true, role: true, orgUnitId: true },
    });
    if (!reviewer) continue;

    await prisma.$transaction(async (tx) => {
      let escalationTarget: string | null = null;

      if (request.type === "TRANSFER") {
        if (request.status === "PENDING" || request.status === "PENDING_STAGE1") {
          // Find receiving head or Property Officer
          if (request.item.orgUnitId) {
            const receivingUnit = await tx.orgUnit.findUnique({
              where: { id: request.item.orgUnitId },
              select: { headId: true },
            });
            if (receivingUnit?.headId) {
              escalationTarget = receivingUnit.headId;
            }
          }
        } else if (request.status === "PENDING_STAGE2") {
          // Escalate to Property Officer
          const propertyOfficer = await tx.user.findFirst({
            where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
            select: { id: true },
          });
          escalationTarget = propertyOfficer?.id ?? null;
        }
      } else {
        // Disposal or Loan - escalate to Property Officer
        const propertyOfficer = await tx.user.findFirst({
          where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
          select: { id: true },
        });
        escalationTarget = propertyOfficer?.id ?? null;
      }

      if (!escalationTarget) return;

      // Fetch current rejectionReason first
      const currentRequest = await tx.request.findUnique({
        where: { id: request.id },
        select: { rejectionReason: true },
      });

      await tx.request.update({
        where: { id: request.id },
        data: {
          reviewedById: escalationTarget,
          rejectionReason: (currentRequest?.rejectionReason ?? "")
            + `\n[ESCALATED] Auto-escalated after ${APPROVAL_ESCALATION_DAYS} days`,
        },
      });

      await tx.notification.create({
        data: {
          userId: escalationTarget,
          message: `[ESCALATED] Request ${request.id} for item ${request.item.tagId} (${request.item.name}) has been escalated to you after ${APPROVAL_ESCALATION_DAYS} days without a decision.`,
        },
      });
    });

    escalatedCount++;
  }

  return escalatedCount;
}

/**
 * Check for expired return confirmations (RETURN_PENDING_CONFIRMATION requests
 * where the lender hasn't confirmed for more than RETURN_CONFIRMATION_DAYS)
 * and escalate to Property Officer.
 */
export async function checkExpiredReturnConfirmations(prisma: DbClient): Promise<number> {
  const cutoffDate = new Date(Date.now() - RETURN_CONFIRMATION_DAYS * 24 * 60 * 60 * 1000);
  let escalatedCount = 0;

  const staleReturns = await prisma.request.findMany({
    where: {
      status: "RETURN_PENDING_CONFIRMATION",
      updatedAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      itemId: true,
      requestedById: true,
      item: { select: { tagId: true, name: true } },
    },
  });

  for (const request of staleReturns) {
    await prisma.$transaction(async (tx) => {
      // Revert request status back to APPROVED (loan still active)
      await tx.request.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          rejectionReason: `RETURN_EXPIRED: Auto-reverted after ${RETURN_CONFIRMATION_DAYS} days without lender confirmation`,
        },
      });

      // Notify borrower
      await tx.notification.create({
        data: {
          userId: request.requestedById,
          message: `Your return initiation for item ${request.item.tagId} (${request.item.name}) has expired without lender confirmation. The loan remains active.`,
        },
      });

      // Escalate to Property Officer
      const propertyOfficer = await tx.user.findFirst({
        where: { role: "PROPERTY_OFFICER", accountStatus: "ACTIVE" },
        select: { id: true },
      });
      if (propertyOfficer) {
        await tx.notification.create({
          data: {
            userId: propertyOfficer.id,
            message: `[RETURN_EXPIRED] Return for item ${request.item.tagId} (${request.item.name}) expired without confirmation. Loan remains active.`,
          },
        });
      }
    });

    escalatedCount++;
  }

  return escalatedCount;
}

/**
 * Check for expired handover verifications (REVERTED_UNVERIFIED items that
 * haven't been verified for more than HANDOVER_VERIFICATION_DAYS)
 * and escalate to SYSTEM_ADMIN.
 */
export async function checkExpiredHandoverVerifications(prisma: DbClient): Promise<number> {
  const cutoffDate = new Date(Date.now() - HANDOVER_VERIFICATION_DAYS * 24 * 60 * 60 * 1000);
  let escalatedCount = 0;

  const unverifiedItems = await prisma.item.findMany({
    where: {
      status: "REVERTED_UNVERIFIED",
      updatedAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      tagId: true,
      name: true,
      orgUnitId: true,
    },
  });

  for (const item of unverifiedItems) {
    await prisma.$transaction(async (tx) => {
      // Flag the item as overdue verification
      await tx.itemEditLog.create({
        data: {
          itemId: item.id,
          editedById: (await tx.user.findFirst({
            where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
            select: { id: true },
          }))?.id ?? "",
          fieldChanged: "verification",
          oldValue: "REVERTED_UNVERIFIED",
          newValue: "VERIFICATION_OVERDUE",
          editedAt: new Date(),
        },
      });

      // Notify new department head
      if (item.orgUnitId) {
        const unit = await tx.orgUnit.findUnique({
          where: { id: item.orgUnitId },
          select: { headId: true },
        });
        if (unit?.headId) {
          await tx.notification.create({
            data: {
              userId: unit.headId,
              message: `[HANDOVER_OVERDUE] Item ${item.tagId} (${item.name}) verification is overdue by ${HANDOVER_VERIFICATION_DAYS} days. Please complete handover verification.`,
            },
          });
        }
      }

      // Escalate to SYSTEM_ADMIN
      const systemAdmins = await tx.user.findMany({
        where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
        select: { id: true },
      });
      for (const admin of systemAdmins) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            message: `[HANDOVER_OVERDUE] Item ${item.tagId} (${item.name}) in department ${item.orgUnitId} verification overdue by ${HANDOVER_VERIFICATION_DAYS} days.`,
          },
        });
      }
    });

    escalatedCount++;
  }

  return escalatedCount;
}

/**
 * Run all expiry checks and escalations.
 * Can be called from a scheduled job or on-demand.
 */
export async function runAllExpiryChecks(prisma: DbClient): Promise<{
  expiredClaims: number;
  expiredApprovals: number;
  expiredReturnConfirmations: number;
  expiredHandoverVerifications: number;
}> {
  const [expiredClaims, expiredApprovals, expiredReturnConfirmations, expiredHandoverVerifications] = await Promise.all([
    checkExpiredClaims(prisma),
    checkExpiredApprovals(prisma),
    checkExpiredReturnConfirmations(prisma),
    checkExpiredHandoverVerifications(prisma),
  ]);

  return {
    expiredClaims,
    expiredApprovals,
    expiredReturnConfirmations,
    expiredHandoverVerifications,
  };
}