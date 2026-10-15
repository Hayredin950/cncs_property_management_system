import type { DbClient } from "../lib/dbClient.js";
import { httpError } from "../lib/httpError.js";

/**
 * Workflow-completeness-spec.md §5: Structured handover flow
 * When a DEPARTMENT_HEAD is activated/changed, trigger structured handover.
 */
export async function executeHandover(
  prisma: DbClient,
  input: {
    unitId: string;
    previousHeadId: string | null;
    newHeadId: string;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. Mark all department-held items as REVERTED_UNVERIFIED
    await tx.item.updateMany({
      where: {
        orgUnitId: input.unitId,
        holderType: "DEPARTMENT",
        status: "ACTIVE",
      },
      data: {
        status: "REVERTED_UNVERIFIED",
      },
    });

    // 2. Reassign pending approvals from old head to new head
    if (input.previousHeadId) {
      await tx.request.updateMany({
        where: {
          reviewedById: input.previousHeadId,
          status: { in: ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2"] },
        },
        data: {
          reviewedById: input.newHeadId,
        },
      });
    }
  });
}
