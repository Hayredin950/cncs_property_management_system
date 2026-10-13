import { prisma } from "../lib/prisma.js";

/**
 * Resolves the approver for a given OrgUnit.
 *
 * Resolution order:
 * 1. Active head of the unit (if head exists and account is ACTIVE)
 * 2. Active head of the parent unit (recursively)
 * 3. SYSTEM_ADMIN (fallback)
 */
export async function resolveApprover(
  unitId: string,
): Promise<{ type: "HEAD" | "PARENT_HEAD" | "SYSTEM_ADMIN"; userId: string }> {
  let currentUnitId: string | null = unitId;

  while (currentUnitId) {
    const unit = await prisma.orgUnit.findUnique({
      where: { id: currentUnitId },
      select: {
        id: true,
        headId: true,
        parentId: true,
        head: {
          select: { id: true, accountStatus: true },
        },
      },
    });

    if (!unit) {
      break;
    }

    // Check if unit has an active head
    if (unit.headId && unit.head?.accountStatus === "ACTIVE") {
      return {
        type: currentUnitId === unitId ? "HEAD" : "PARENT_HEAD",
        userId: unit.headId,
      };
    }

    // Move to parent
    currentUnitId = unit.parentId;
  }

  // Fallback: find a SYSTEM_ADMIN user
  const sysAdmin = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMIN", accountStatus: "ACTIVE" },
    select: { id: true },
  });

  if (sysAdmin) {
    return { type: "SYSTEM_ADMIN", userId: sysAdmin.id };
  }

  // This should never happen in a properly seeded system
  throw new Error("No approver available: no SYSTEM_ADMIN found");
}

/**
 * Checks if a user can decide on an account request.
 *
 * Rules:
 * - SYSTEM_ADMIN: allowed on any request (except their own), including escalated and stale requests
 * - DEPARTMENT_HEAD: allowed only if:
 *     - Actor's account is ACTIVE
 *     - Request is for STAFF self-registration
 *     - Request's unit is in actor's unit scope (actor's headed unit or its children)
 *     - Request is not escalated (escalated requests go to SYSTEM_ADMIN)
 * - Everyone else: denied
 * - Self-decision is always denied
 */
export async function canDecide(
  actor: { id: string; role: string; accountStatus: string; orgUnitId: string | null },
  request: {
    id: string;
    userId: string;
    requestedUnitId: string;
    status: string;
    escalatedAt?: Date | null;
  },
): Promise<{ allowed: boolean; reason?: string }> {
  // Self-decision check
  if (actor.id === request.userId) {
    return { allowed: false, reason: "You cannot approve or reject your own account request" };
  }

  // Status check
  if (request.status !== "PENDING_APPROVAL") {
    return { allowed: false, reason: "This request is not pending approval" };
  }

  // SYSTEM_ADMIN can decide on any request (except their own), including escalated and stale
  if (actor.role === "SYSTEM_ADMIN") {
    return { allowed: true };
  }

  // DEPARTMENT_HEAD can decide only on staff requests in their unit scope
  if (actor.role === "DEPARTMENT_HEAD") {
    if (actor.accountStatus !== "ACTIVE") {
      return { allowed: false, reason: "Your account is not active" };
    }

    if (!actor.orgUnitId) {
      return { allowed: false, reason: "You are not assigned to a department" };
    }

    // Check if the requested unit is in the head's scope (their unit or descendants)
    const inScope = await isUnitInScope(actor.orgUnitId, request.requestedUnitId);
    if (!inScope) {
      return { allowed: false, reason: "This request is not in your department scope" };
    }

    // DEPARTMENT_HEAD cannot decide on escalated requests
    if (request.escalatedAt) {
      return { allowed: false, reason: "This request has been escalated to SYSTEM_ADMIN" };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: "Insufficient permissions" };
}

/**
 * Checks if a target unit is within the scope of a head's unit
 * (i.e., target is the head's unit or a descendant of it)
 */
async function isUnitInScope(headUnitId: string, targetUnitId: string): Promise<boolean> {
  if (headUnitId === targetUnitId) {
    return true;
  }

  // Walk up from target to see if we reach head's unit
  let currentId: string | null = targetUnitId;
  while (currentId) {
    const unit = await prisma.orgUnit.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!unit) {
      break;
    }
    if (unit.parentId === headUnitId) {
      return true;
    }
    currentId = unit.parentId;
  }

  return false;
}

/**
 * Gets all units in a head's scope (their unit + all descendants)
 */
export async function getUnitScope(headUnitId: string): Promise<string[]> {
  const units: string[] = [headUnitId];
  const toVisit = [headUnitId];

  while (toVisit.length > 0) {
    const currentId = toVisit.pop()!;
    const children = await prisma.orgUnit.findMany({
      where: { parentId: currentId, isActive: true },
      select: { id: true },
    });
    for (const child of children) {
      units.push(child.id);
      toVisit.push(child.id);
    }
  }

  return units;
}