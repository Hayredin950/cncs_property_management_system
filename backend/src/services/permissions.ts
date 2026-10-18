import type { UserRole } from "../middleware/auth.js";

export type BaseRole = UserRole;

/**
 * The unified permission capabilities across CNCS Property Management System (Master Plan v3).
 *
 * One central place decides whether a user has the capability, and evaluate scope in the
 * `allow(user, capability, targetScope)` function rather than baking scopes into capability names.
 */
export type Capability =
  /** Register an item individually or by bulk import (Property Officer only). */
  | "ITEM_CREATE"
  /** Edit identity and financial fields — name, category, brand, model, serial, cost, value (Property Officer only). */
  | "ITEM_EDIT_IDENTITY"
  /** Edit condition, notes, photo on an item you hold (Holders: STAFF, DEPT_HEAD, PO). */
  | "ITEM_EDIT_CUSTODY"
  /** Claim or refuse a pending item assigned to you / your department / college (Holders). */
  | "ITEM_CLAIM"
  /** Void an unclaimed item with no history (Property Officer only). */
  | "ITEM_VOID"
  /** Read full item detail (Property Officer, Auditor). */
  | "ITEM_READ_ALL"
  /** Maintain buildings (Property Officer only). */
  | "BUILDING_MANAGE"
  /** Generate and manage QR tags (Property Officer only). */
  | "TAG_MANAGE"
  /** Create, rename and delete categories (Property Officer only). */
  | "CATEGORY_MANAGE"
  /** Run an audit session (Auditors only). */
  | "AUDIT_RUN"
  /** Read audit history and reports (Auditors, Property Officer). */
  | "AUDIT_VIEW"
  /** Request an audit (Property Officer, Department Head). */
  | "AUDIT_REQUEST"
  /** Acknowledge and sign off an audit report (Property Officer only). */
  | "AUDIT_ACKNOWLEDGE"
  /** Read every request college-wide (Property Officer only). */
  | "REQUEST_READ_ALL"
  /** General decision on requests (Department Head, Property Officer). */
  | "REQUEST_DECIDE"
  /** Approve transfer (Department Head for own dept; Property Officer for cross-dept / head-held). */
  | "TRANSFER_APPROVE"
  | "TRANSFER_APPROVE_STAGE1"
  | "TRANSFER_APPROVE_STAGE2"
  /** Recommend disposal (Department Head). */
  | "DISPOSAL_RECOMMEND"
  /** Finalise disposal (Property Officer only). */
  | "DISPOSAL_APPROVE"
  | "DISPOSAL_FINALIZE"
  /** Approve loans (Department Head for dept items; Property Officer for college items). */
  | "LOAN_APPROVE"
  /** Read college/department reports (Property Officer, Department Head, Auditor). */
  | "REPORT_VIEW_ALL"
  /** Account administration (Account Admin, System Admin technical). */
  | "ACCOUNT_MANAGE"
  /** Approve staff self-registrations (Department Head within own dept; Account Admin fallback only; never System Admin). */
  | "ACCOUNT_APPROVE"
  | "ACCOUNT_APPROVE_OWN_UNIT"
  | "ACCOUNT_APPROVE_ANY"
  /** Invite privileged accounts (Account Admin only; System Admin seeds first Account Admin). */
  | "ACCOUNT_INVITE"
  /** Grant or revoke designations (Account Admin only). */
  | "DESIGNATION_MANAGE"
  /** Deactivate accounts according to duty separation rules. */
  | "ACCOUNT_DEACTIVATE"
  | "ACCOUNT_DEACTIVATE_OWN_UNIT"
  | "ACCOUNT_DEACTIVATE_PRIVILEGED"
  /** Technical system configuration & health (System Admin only). */
  | "SYSTEM_CONFIG"
  /** Read account directory (Property Officer, Account Admin, Department Head, Auditor). */
  | "USER_READ";

export interface ActiveDesignation {
  designation: string;
  orgUnitId?: string | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}

export interface UserContext {
  id: string;
  role: BaseRole;
  orgUnitId?: string | null;
  designations?: ActiveDesignation[];
}

export interface ScopeTarget {
  orgUnitId?: string | null;
  targetUserId?: string | null;
  targetUserRole?: BaseRole | null;
  targetUserUnitId?: string | null;
  isOwnItem?: boolean;
  isOwnUnitItem?: boolean;
  isCollegeItem?: boolean;
  fallbackTriggerMet?: boolean;
}

/** Base grants per role (without scope checks). */
const GRANTS: Record<BaseRole, readonly Capability[]> = {
  SYSTEM_ADMIN: [
    "ACCOUNT_MANAGE",
    "ACCOUNT_INVITE",
    "ACCOUNT_DEACTIVATE",
    "ACCOUNT_DEACTIVATE_PRIVILEGED",
    "SYSTEM_CONFIG",
    "USER_READ",
  ],
  ACCOUNT_ADMIN: [
    "ACCOUNT_MANAGE",
    "ACCOUNT_APPROVE",
    "ACCOUNT_APPROVE_ANY",
    "ACCOUNT_INVITE",
    "DESIGNATION_MANAGE",
    "ACCOUNT_DEACTIVATE",
    "ACCOUNT_DEACTIVATE_PRIVILEGED",
    "USER_READ",
  ],
  PROPERTY_OFFICER: [
    "ITEM_CREATE",
    "ITEM_EDIT_IDENTITY",
    "ITEM_EDIT_CUSTODY",
    "ITEM_CLAIM",
    "ITEM_VOID",
    "ITEM_READ_ALL",
    "BUILDING_MANAGE",
    "TAG_MANAGE",
    "CATEGORY_MANAGE",
    "AUDIT_VIEW",
    "AUDIT_REQUEST",
    "AUDIT_ACKNOWLEDGE",
    "REQUEST_DECIDE",
    "REQUEST_READ_ALL",
    "TRANSFER_APPROVE",
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
    "DISPOSAL_APPROVE",
    "DISPOSAL_FINALIZE",
    "LOAN_APPROVE",
    "REPORT_VIEW_ALL",
    "USER_READ",
  ],
  DEPARTMENT_HEAD: [
    "ITEM_EDIT_CUSTODY",
    "ITEM_CLAIM",
    "AUDIT_REQUEST",
    "REQUEST_DECIDE",
    "TRANSFER_APPROVE",
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
    "DISPOSAL_RECOMMEND",
    "LOAN_APPROVE",
    "REPORT_VIEW_ALL",
    "ACCOUNT_APPROVE",
    "ACCOUNT_APPROVE_OWN_UNIT",
    "ACCOUNT_DEACTIVATE",
    "ACCOUNT_DEACTIVATE_OWN_UNIT",
    "USER_READ",
  ],
  STAFF: [
    "ITEM_EDIT_CUSTODY",
    "ITEM_CLAIM",
  ],
  AUDITOR: [
    "ITEM_READ_ALL",
    "AUDIT_RUN",
    "AUDIT_VIEW",
    "REPORT_VIEW_ALL",
    "USER_READ",
  ],
};

export function hasCapability(role: BaseRole, capability: Capability): boolean {
  return GRANTS[role]?.includes(capability) ?? false;
}

export function capabilitiesFor(role: BaseRole): readonly Capability[] {
  return GRANTS[role] ?? [];
}

/** Check if designation is currently active */
function isDesignationActive(d: ActiveDesignation): boolean {
  if (d.revokedAt != null) return false;
  if (d.expiresAt != null && new Date(d.expiresAt) <= new Date()) return false;
  return true;
}

/**
 * Central capability and scope evaluation function (Section 2.2).
 * Takes a user (or role), the desired capability, and the target scope, returning allow or deny.
 */
export function allow(
  userOrRole: UserContext | BaseRole,
  capability: Capability,
  targetScope?: ScopeTarget,
): boolean {
  const user: UserContext = typeof userOrRole === "string"
    ? { id: "", role: userOrRole, orgUnitId: null }
    : userOrRole;

  const role = user.role;

  // Active designations held by the user
  const activeDesignations = (user.designations ?? []).filter(isDesignationActive);

  // 1. Check capability base grant
  const hasBase = hasCapability(role, capability);

  // Check if designation grants it (e.g. DEPARTMENT_CUSTODIAN)
  const isDeptCustodian = activeDesignations.some(
    (d) => d.designation === "DEPARTMENT_CUSTODIAN" && (!targetScope?.orgUnitId || d.orgUnitId === targetScope.orgUnitId),
  );

  let hasCapOrDesignation = hasBase;
  if (isDeptCustodian) {
    if (capability === "ITEM_CLAIM" || capability === "LOAN_APPROVE") {
      hasCapOrDesignation = true;
    }
  }

  if (!hasCapOrDesignation) return false;

  // If no scope is specified, return true based on capability
  if (!targetScope) return true;

  // 2. Evaluate scope in one place
  switch (capability) {
    case "ACCOUNT_APPROVE":
    case "ACCOUNT_APPROVE_OWN_UNIT":
    case "ACCOUNT_APPROVE_ANY": {
      // System Admin is strictly excluded from registrations
      if (role === "SYSTEM_ADMIN") return false;

      // Department Head: can only approve in own department
      if (role === "DEPARTMENT_HEAD") {
        if (!user.orgUnitId || !targetScope.orgUnitId) return false;
        return user.orgUnitId === targetScope.orgUnitId;
      }

      // Account Admin: fallback queue only (head vacant OR pending > 5 days)
      if (role === "ACCOUNT_ADMIN") {
        return Boolean(targetScope.fallbackTriggerMet);
      }

      return false;
    }

    case "ACCOUNT_INVITE": {
      if (role === "ACCOUNT_ADMIN") return true;
      if (role === "SYSTEM_ADMIN") {
        // System Admin can ONLY seed an Account Admin
        return targetScope.targetUserRole === "ACCOUNT_ADMIN";
      }
      return false;
    }

    case "ACCOUNT_DEACTIVATE":
    case "ACCOUNT_DEACTIVATE_OWN_UNIT":
    case "ACCOUNT_DEACTIVATE_PRIVILEGED": {
      if (user.id && targetScope.targetUserId && user.id === targetScope.targetUserId) {
        return false; // No self-deactivation
      }
      if (role === "DEPARTMENT_HEAD") {
        // Can deactivate staff in own department only
        return (
          targetScope.targetUserRole === "STAFF" &&
          Boolean(user.orgUnitId && targetScope.targetUserUnitId === user.orgUnitId)
        );
      }
      if (role === "ACCOUNT_ADMIN") {
        // Can deactivate Heads and Auditors
        return (
          targetScope.targetUserRole === "DEPARTMENT_HEAD" ||
          targetScope.targetUserRole === "AUDITOR"
        );
      }
      if (role === "SYSTEM_ADMIN") {
        // Can deactivate Account Admins
        return targetScope.targetUserRole === "ACCOUNT_ADMIN";
      }
      return false;
    }

    case "ITEM_CLAIM": {
      if (role === "PROPERTY_OFFICER") return Boolean(targetScope.isCollegeItem);
      if (role === "DEPARTMENT_HEAD") {
        return Boolean(targetScope.isOwnItem || targetScope.isOwnUnitItem);
      }
      if (isDeptCustodian && targetScope.isOwnUnitItem) return true;
      if (role === "STAFF") return Boolean(targetScope.isOwnItem);
      return false;
    }

    case "ITEM_EDIT_CUSTODY": {
      if (role === "PROPERTY_OFFICER") return true;
      return Boolean(targetScope.isOwnItem);
    }

    case "TRANSFER_APPROVE":
    case "TRANSFER_APPROVE_STAGE1":
    case "TRANSFER_APPROVE_STAGE2": {
      if (role === "PROPERTY_OFFICER") return true;
      if (role === "DEPARTMENT_HEAD") {
        return Boolean(user.orgUnitId && targetScope.orgUnitId === user.orgUnitId);
      }
      return false;
    }

    case "LOAN_APPROVE": {
      if (role === "PROPERTY_OFFICER") return Boolean(targetScope.isCollegeItem);
      if (role === "DEPARTMENT_HEAD") {
        return Boolean(user.orgUnitId && targetScope.orgUnitId === user.orgUnitId);
      }
      if (isDeptCustodian) {
        return Boolean(targetScope.isOwnUnitItem);
      }
      return false;
    }

    default:
      return true;
  }
}

/** True when a role may read an item's full detail. */
export function seesFullItemDetail(role: BaseRole): boolean {
  return hasCapability(role, "ITEM_READ_ALL");
}

/** Proves Property Officer and Auditor exclusion (Section 2.1). */
export function assertOfficerAuditorExclusion(currentRole: BaseRole, targetRole: BaseRole): void {
  if (
    (currentRole === "PROPERTY_OFFICER" && targetRole === "AUDITOR") ||
    (currentRole === "AUDITOR" && targetRole === "PROPERTY_OFFICER")
  ) {
    throw new Error("Property Officer and Auditor cannot be the same person");
  }
}
