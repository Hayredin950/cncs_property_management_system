import type { Item } from "../types/item";
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
  /**
   * The right to use the register: list the rows the role's scope allows and
   * open any row that list shows. Distinct from `ITEM_READ_ALL`, which is the
   * full-detail grant; `ITEM_READ` is what every asset role holds, including
   * Staff, so a listed row is never a dead end.
   */
  | "ITEM_READ"
  | "DISPOSAL_REVERSE"
  | "SYSTEM_CONFIG"
  | "BUILDING_MANAGE"
  | "TAG_MANAGE"
  | "CATEGORY_MANAGE"
  | "AUDIT_RUN"
  | "AUDIT_VIEW"
  | "REQUEST_DECIDE"
  | "TRANSFER_APPROVE_STAGE1"
  | "TRANSFER_APPROVE_STAGE2"
  | "DISPOSAL_APPROVE"
  | "LOAN_APPROVE"
  | "REQUEST_READ_ALL"
  | "REPORT_VIEW_ALL"
  | "ACCOUNT_MANAGE"
  | "ACCOUNT_APPROVE_OWN_UNIT"
  | "ACCOUNT_APPROVE_ANY"
  | "ACCOUNT_INVITE"
  | "ACCOUNT_DEACTIVATE_OWN_UNIT"
  | "ACCOUNT_DEACTIVATE_PRIVILEGED"
  | "USER_READ";

/**
 * Does this role see asset data at all? The SYSTEM_ADMIN is an account role and
 * sees none — the rule the whole server-side scope is built around
 * (`backend/src/services/itemScope.ts`). This is the client-side twin, and the
 * check any asset UI should make before rendering. It is never a control: the
 * server still scopes every response, and the SYSTEM_ADMIN's scope is empty there
 * too. It exists so a new tile has an obvious predicate to call instead of
 * re-deriving the rule — and re-deriving it wrong, which is what happened three
 * times (the dashboard request list, `/system/events`, and the quick-action
 * tiles).
 */
export const seesAssetData = (role: Role | undefined | null): boolean =>
  hasCapability(role, "ITEM_READ");

const GRANTS: Record<Role, readonly Capability[]> = {
  SYSTEM_ADMIN: [
    "ACCOUNT_MANAGE",
    "ACCOUNT_APPROVE_ANY",
    "ACCOUNT_INVITE",
    "ACCOUNT_DEACTIVATE_PRIVILEGED",
    "SYSTEM_CONFIG",
    "USER_READ",
  ],
  PROPERTY_OFFICER: [
    "ITEM_CREATE",
    "ITEM_EDIT_IDENTITY",
    "ITEM_EDIT_CUSTODY",
    "ITEM_CLAIM",
    "ITEM_VOID",
    "ITEM_READ_ALL",
    "ITEM_READ",
    "BUILDING_MANAGE",
    "TAG_MANAGE",
    "CATEGORY_MANAGE",
    "REQUEST_DECIDE",
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
    "DISPOSAL_APPROVE",
    "DISPOSAL_REVERSE",
    "LOAN_APPROVE",
    "REQUEST_READ_ALL",
    "REPORT_VIEW_ALL",
    "AUDIT_VIEW",
    "USER_READ",
  ],
  DEPARTMENT_HEAD: [
    "ITEM_EDIT_CUSTODY",
    "ITEM_CLAIM",
    // A head reads the items of their own department in full — the field
    // filtering is per-item on the server, so the grant is what opens the
    // read routes (`/items/recent`, `/items/:id/history`) and the row scope is
    // what limits them to their unit.
    "ITEM_READ_ALL",
    "ITEM_READ",
    "REQUEST_DECIDE",
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
    "ACCOUNT_APPROVE_OWN_UNIT",
    "ACCOUNT_DEACTIVATE_OWN_UNIT",
    "REPORT_VIEW_ALL",
  ],
  STAFF: ["ITEM_EDIT_CUSTODY", "ITEM_CLAIM", "ITEM_READ"],
  AUDITOR: ["ITEM_READ_ALL", "ITEM_READ", "AUDIT_RUN", "AUDIT_VIEW", "REPORT_VIEW_ALL"],
};

/**
 * Everyone except the SYSTEM_ADMIN — the roles that may see asset data at all
 * (spec 2.1.1). Derived from the matrix rather than typed out, so a role that
 * gains or loses `ITEM_READ` is picked up everywhere at once: the router guards
 * the asset routes with it, and the dashboard gates its asset tiles on it. It
 * used to be a local const inside the router, so the dashboard had no such name
 * to reach for and wrote `!isAuditor` instead — which is how the SYSTEM_ADMIN
 * got the Scan/Browse tiles.
 */
export const ASSET_ROLES: Role[] = (Object.keys(GRANTS) as Role[]).filter((role) =>
  GRANTS[role].includes("ITEM_READ"),
);

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

/** May edit an item at all — the capability, before the row is considered. */
export const canEditItemCustody = (role: Role | undefined | null) =>
  hasCapability(role, "ITEM_EDIT_CUSTODY");

/** May change identity/financial/photo fields — the Property Officer's half (SRS 4.7). */
export const canEditItemIdentity = (role: Role | undefined | null) =>
  hasCapability(role, "ITEM_EDIT_IDENTITY");

/** Regenerate a printed tag's artwork (the tag id never changes). */
export const canManageTags = (role: Role | undefined | null) => hasCapability(role, "TAG_MANAGE");

/** File an item request. Every role but the SYSTEM_ADMIN, which the API refuses by name. */
export const canFileRequests = (role: Role | undefined | null) =>
  role != null && role !== "SYSTEM_ADMIN";

/**
 * May this viewer edit **this** item?
 *
 * The capability says *what* a role may edit; the row decides *which* rows.
 * Mirrors `itemInScope` in `backend/src/services/itemScope.ts`, which is the
 * authority — this exists so the UI does not offer a button the API refuses.
 *
 *   - STAFF: only items they hold (legacy `ownerId` or the holder fields).
 *   - DEPARTMENT_HEAD: items of their own unit, plus anything they hold.
 *   - PROPERTY_OFFICER: any row (`ITEM_EDIT_IDENTITY`).
 */
/**
 * May this viewer see the item's **full detail and change history**?
 *
 * Every item viewer may open the item, but the edit log names people and shows
 * old values of fields the viewer may not see — so history belongs to the
 * people who administer the row: the holder, their head, the Property Officer
 * and an Auditor (`seesFullItemDetail` in `backend/src/services/itemScope.ts`).
 * This is the same predicate, expressed as "can administer it" OR "reads the
 * whole college".
 */
export function seesFullItemDetail(
  role: Role | undefined | null,
  userId: string | undefined | null,
  departmentId: string | undefined | null,
  item: Pick<Item, "ownerId" | "holderType" | "holderId" | "orgUnitId">,
): boolean {
  // Mirrors `seesFullItemDetail` in `backend/src/utils/filterItemFields.ts`:
  // the college-wide administrators see any row, a custodian sees their own,
  // and a head sees their **own unit's** rows — `ITEM_READ_ALL` alone must not
  // open another department's history, or the tab answers 404.
  if (role === "PROPERTY_OFFICER" || role === "AUDITOR") return true;
  if (!userId) return false;
  if (item.ownerId === userId) return true;
  if (item.holderType === "STAFF" && item.holderId === userId) return true;
  if (role === "DEPARTMENT_HEAD" && departmentId != null) {
    if (item.orgUnitId === departmentId) return true;
    if (item.holderType === "DEPARTMENT" && item.holderId === departmentId) return true;
  }
  return false;
}

export function canEditItem(
  role: Role | undefined | null,
  userId: string | undefined | null,
  departmentId: string | undefined | null,
  item: Pick<Item, "ownerId" | "holderType" | "holderId" | "orgUnitId">,
): boolean {
  if (!canEditItemCustody(role)) return false;
  if (canEditItemIdentity(role)) return true;
  if (!userId) return false;
  if (role === "STAFF") {
    return item.ownerId === userId || (item.holderType === "STAFF" && item.holderId === userId);
  }
  if (role === "DEPARTMENT_HEAD") {
    return (
      (departmentId != null && item.orgUnitId === departmentId) ||
      (item.holderType === "DEPARTMENT" && item.holderId === departmentId) ||
      item.ownerId === userId
    );
  }
  return false;
}

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
/**
 * Confirm or dispute a loan's return (property officer only).
 *
 * The same grant that let the item out: loans are decided under `LOAN_APPROVE`,
 * so a head never has a return to answer. The borrower is excluded at the call
 * site — confirming your own hand-back is not a check-in.
 */
export const canConfirmLoanReturn = (role: Role | undefined | null) =>
  hasCapability(role, "LOAN_APPROVE");
/** Approve staff self-registrations in own unit (Department Head). */
export const canApproveOwnUnitAccounts = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_APPROVE_OWN_UNIT");
/** Approve any account request (System Admin). */
export const canApproveAnyAccount = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_APPROVE_ANY");
/** Invite privileged accounts (System Admin). */
export const canInviteAccounts = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_INVITE");
/** Deactivate staff in own unit (Department Head). */
export const canDeactivateOwnUnitStaff = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_DEACTIVATE_OWN_UNIT");
/** Deactivate privileged roles (System Admin). */
export const canDeactivatePrivileged = (role: Role | undefined | null) =>
  hasCapability(role, "ACCOUNT_DEACTIVATE_PRIVILEGED");
