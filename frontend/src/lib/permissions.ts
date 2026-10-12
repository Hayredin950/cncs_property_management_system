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
  | "REQUEST_DECIDE"
  | "REQUEST_READ_ALL"
  | "REPORT_VIEW_ALL"
  | "ACCOUNT_MANAGE"
  | "USER_READ";

const GRANTS: Record<Role, readonly Capability[]> = {
  SYSTEM_ADMIN: ["ACCOUNT_MANAGE", "USER_READ"],
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
    "REQUEST_READ_ALL",
    "REPORT_VIEW_ALL",
    "AUDIT_VIEW",
    "USER_READ",
  ],
  DEPARTMENT_HEAD: ["ITEM_EDIT_CUSTODY", "ITEM_CLAIM", "REQUEST_DECIDE"],
  STAFF: ["ITEM_EDIT_CUSTODY", "ITEM_CLAIM"],
  AUDITOR: ["ITEM_READ_ALL", "AUDIT_RUN", "AUDIT_VIEW", "REPORT_VIEW_ALL"],
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
