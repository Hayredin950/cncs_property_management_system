import type { Role } from "../types/enums";

/**
 * The frontend half of the permission matrix (`backend/src/services/permissions.ts`).
 *
 * It exists to decide **what to render** — which nav entries, which buttons, which
 * columns. It is never a control: the server re-checks every one of these on the
 * request, and a client that hides a button has not denied anything. Keep the two
 * lists in step by hand, the same way `types/enums.ts` is kept in step with the
 * Prisma schema.
 */
export type Capability =
  | "ITEM_CREATE"
  | "ITEM_EDIT_IDENTITY"
  | "ITEM_EDIT_CUSTODY"
  | "ITEM_CLAIM"
  | "ITEM_VOID"
  | "ITEM_READ_ALL"
  | "BUILDING_MANAGE"
  | "TAG_MANAGE"
  | "CATEGORY_MANAGE"
  | "AUDIT_RUN"
  | "AUDIT_VIEW"
  | "AUDIT_REQUEST"
  | "AUDIT_ACKNOWLEDGE"
  | "REQUEST_DECIDE"
  | "TRANSFER_APPROVE"
  | "TRANSFER_APPROVE_STAGE1"
  | "TRANSFER_APPROVE_STAGE2"
  | "DISPOSAL_RECOMMEND"
  | "DISPOSAL_APPROVE"
  | "DISPOSAL_FINALIZE"
  | "LOAN_APPROVE"
  | "REQUEST_READ_ALL"
  | "REPORT_VIEW_ALL"
  | "ACCOUNT_MANAGE"
  | "ACCOUNT_APPROVE"
  | "ACCOUNT_APPROVE_OWN_UNIT"
  | "ACCOUNT_APPROVE_ANY"
  | "ACCOUNT_INVITE"
  | "DESIGNATION_MANAGE"
  | "ACCOUNT_DEACTIVATE"
  | "ACCOUNT_DEACTIVATE_OWN_UNIT"
  | "ACCOUNT_DEACTIVATE_PRIVILEGED"
  | "SYSTEM_CONFIG"
  | "USER_READ";

/**
 * Everyone except the SYSTEM_ADMIN and ACCOUNT_ADMIN — the roles that may see asset data at all
 * (spec 2.1.1). Declared once, here, and imported wherever a screen has to ask
 * "is this viewer an asset role?": `app/router.tsx` guards the asset routes with
 * it, and the dashboard gates its asset tiles on it.
 */
export const ASSET_ROLES: Role[] = ["PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"];

/**
 * Does this role see asset data at all? Both SYSTEM_ADMIN and ACCOUNT_ADMIN are account/technical
 * roles and see none — the rule the whole server-side scope is built around
 * (`backend/src/services/itemScope.ts`).
 */
export const seesAssetData = (role: Role | undefined | null): boolean =>
  role != null && ASSET_ROLES.includes(role);

const GRANTS: Record<Role, readonly Capability[]> = {
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
    "REQUEST_DECIDE",
    "TRANSFER_APPROVE",
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
    "DISPOSAL_APPROVE",
    "DISPOSAL_FINALIZE",
    "LOAN_APPROVE",
    "REQUEST_READ_ALL",
    "REPORT_VIEW_ALL",
    "AUDIT_VIEW",
    "AUDIT_REQUEST",
    "AUDIT_ACKNOWLEDGE",
    "USER_READ",
  ],
  DEPARTMENT_HEAD: [
    "ITEM_EDIT_CUSTODY",
    "ITEM_CLAIM",
    "REQUEST_DECIDE",
    "TRANSFER_APPROVE",
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
    "DISPOSAL_RECOMMEND",
    "LOAN_APPROVE",
    "ACCOUNT_APPROVE",
    "ACCOUNT_APPROVE_OWN_UNIT",
    "ACCOUNT_DEACTIVATE",
    "ACCOUNT_DEACTIVATE_OWN_UNIT",
    "REPORT_VIEW_ALL",
    "AUDIT_REQUEST",
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

export function hasCapability(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  return GRANTS[role]?.includes(capability) ?? false;
}

/** Register an item — Property Officer only (spec 4.3). */
export const canCreateItems = (role: Role | undefined | null) => hasCapability(role, "ITEM_CREATE");
/** Decide a transfer or disposal request. */
export const canDecideRequests = (role: Role | undefined | null) =>
  hasCapability(role, "REQUEST_DECIDE");
/** Run an audit session — auditors only (spec 8.1). */
export const canRunAudits = (role: Role | undefined | null) => hasCapability(role, "AUDIT_RUN");
/** Read audit history and reports. */
export const canViewAudits = (role: Role | undefined | null) => hasCapability(role, "AUDIT_VIEW");
/** Formal audit acknowledgement & sign-off — Property Officer. */
export const canAcknowledgeAudit = (role: Role | undefined | null) =>
  hasCapability(role, "AUDIT_ACKNOWLEDGE");
/** Read college-wide reports. */
export const canViewReports = (role: Role | undefined | null) =>
  hasCapability(role, "REPORT_VIEW_ALL");
/** Account administration — invites, approvals, deactivation, resets. */
export const canManageAccounts = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_MANAGE");
/** Read the account list (holder pickers). */
export const canReadUsers = (role: Role | undefined | null) => hasCapability(role, "USER_READ");
/** See every item's detail, whichever role holds it. */
export const seesAllItems = (role: Role | undefined | null) => hasCapability(role, "ITEM_READ_ALL");

/** View own filed requests (STAFF and any role with REQUEST_DECIDE). */
export const canViewOwnRequests = (role: Role | undefined | null) =>
  hasCapability(role, "REQUEST_DECIDE") || role === "STAFF";
/** Approve first stage of a transfer (releasing head / property officer). */
export const canApproveTransferStage1 = (role: Role | undefined | null) =>
  hasCapability(role, "TRANSFER_APPROVE_STAGE1");
/** Approve second stage of a transfer (receiving head / property officer). */
export const canApproveTransferStage2 = (role: Role | undefined | null) =>
  hasCapability(role, "TRANSFER_APPROVE_STAGE2");
/** Approve a disposal request (property officer only). */
export const canApproveDisposal = (role: Role | undefined | null) =>
  hasCapability(role, "DISPOSAL_APPROVE");
/** Approve a loan request (property officer only). */
export const canApproveLoan = (role: Role | undefined | null) =>
  hasCapability(role, "LOAN_APPROVE");
/** Approve staff self-registrations in own unit (Department Head). */
export const canApproveOwnUnitAccounts = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_APPROVE_OWN_UNIT");
/** Approve any account request (Account Admin fallback). */
export const canApproveAnyAccount = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_APPROVE_ANY");
/** Invite privileged accounts (Account Admin). */
export const canInviteAccounts = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_INVITE");
/** Deactivate staff in own unit (Department Head). */
export const canDeactivateOwnUnitStaff = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_DEACTIVATE_OWN_UNIT");
/** Deactivate privileged roles (Account Admin for heads/auditors; System Admin for account admins). */
export const canDeactivatePrivileged = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_DEACTIVATE_PRIVILEGED");
