import type { UserRole } from "../middleware/auth.js";

/**
 * The permission matrix — spec 2.1/2.2 as amended 12 Oct (Account Admin merged
 * into System Admin, so five roles).
 *
 * One place decides what a role may do. Routes ask "may this user do X?" rather
 * than naming roles, because a route that names roles is a matrix row written in
 * the wrong file: `requireRole(["PROPERTY_OFFICER", "DEPARTMENT_HEAD"])` on the
 * approval route reads as "these two may approve", which is true but is exactly
 * what this table already says, and updating the policy then means hunting every
 * call site instead of editing one row.
 *
 * The capabilities are deliberately coarse. `ITEM_EDIT_CUSTODY` covers condition
 * and notes; the finer "only on the item you hold" rule is a scope check the
 * route does per-row (permissions decide *whether*, scope decides *which*).
 */
export type Capability =
  /** Register an item individually or by bulk import (spec 4.3, 6.1). */
  | "ITEM_CREATE"
  /** Edit identity and financial fields — name, category, brand, model, serial, cost, value (spec 4.7.1). */
  | "ITEM_EDIT_IDENTITY"
  /** Edit condition and notes on an item you hold (spec 4.7.2). */
  | "ITEM_EDIT_CUSTODY"
  /** Claim or refuse a pending item assigned to you/your department (spec 4.4). */
  | "ITEM_CLAIM"
  /** Void a duplicate or wrong entry (spec 4.8). */
  | "ITEM_VOID"
  /** Read every item in full, including on a scan (spec 2.2; Yanet's scan rule). */
  | "ITEM_READ_ALL"
  /** Maintain buildings (spec 7.3). */
  | "BUILDING_MANAGE"
  /** Generate and manage QR tags. */
  | "TAG_MANAGE"
  /** Create, rename and delete categories. */
  | "CATEGORY_MANAGE"
  /** Run an audit session (spec 8.1 — auditors only). */
  | "AUDIT_RUN"
  /** Read audit history and reports — the auditor who ran them and the officer who acts on findings. */
  | "AUDIT_VIEW"
  /** Decide a transfer/disposal request (spec 5.1/5.2). */
  | "REQUEST_DECIDE"
  /** First-stage approval for a transfer (releasing head / property officer). */
  | "TRANSFER_APPROVE_STAGE1"
  /** Second-stage approval for a transfer (receiving head / property officer). */
  | "TRANSFER_APPROVE_STAGE2"
  /** Approve a disposal request (property officer only). */
  | "DISPOSAL_APPROVE"
  /** Approve a loan request (property officer only). */
  | "LOAN_APPROVE"
  /** Read every request, not only your own (spec 5.1.7). */
  | "REQUEST_READ_ALL"
  /** Read college-wide reports. */
  | "REPORT_VIEW_ALL"
  /** Account administration: invites, approvals, deactivation, resets (spec 3). */
  | "ACCOUNT_MANAGE"
  /**
   * Read the account list. Needed by the Property Officer to pick a holder when
   * registering an item — a name and an email are not asset data, so this does
   * not breach SYSTEM_ADMIN's "sees no asset data" rule.
   */
  | "USER_READ";

/** Every capability a role holds. Absent role ⇒ no capabilities. */
const GRANTS: Record<UserRole, readonly Capability[]> = {
  // Technical + account administration only. Sees no asset data, approves
  // nothing business-related (spec 2.1.1).
  SYSTEM_ADMIN: ["USER_READ"],
  // Invites privileged accounts (heads, officers, auditors, other account admins),
  // approves/rejects privileged account requests, deactivates heads and auditors.
  // Sees no asset data. (spec 2.1.2)
  ACCOUNT_ADMIN: ["ACCOUNT_MANAGE", "USER_READ"],
  // The single college-level operational role (spec 2.1.2).
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
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
    "DISPOSAL_APPROVE",
    "LOAN_APPROVE",
    "REQUEST_READ_ALL",
    "REPORT_VIEW_ALL",
    "AUDIT_VIEW",
    "USER_READ",
  ],
  // Scoped to one department. Approves transfers for their department and can
  // hold, claim and edit condition/notes of items like any custodian.
  // Approves staff registrations in their department. (spec 2.1.3)
  // First-stage approval for outgoing transfers, second-stage for incoming.
  DEPARTMENT_HEAD: [
    "ITEM_EDIT_CUSTODY",
    "ITEM_CLAIM",
    "REQUEST_DECIDE",
    "ACCOUNT_MANAGE",
    "TRANSFER_APPROVE_STAGE1",
    "TRANSFER_APPROVE_STAGE2",
  ],
  // Scoped to one department. Holds and claims items, files requests, edits
  // condition and notes of what they hold — nothing else.
  STAFF: ["ITEM_EDIT_CUSTODY", "ITEM_CLAIM"],
  // Conducts audits and reads everything read-only. Approves nothing.
  AUDITOR: ["ITEM_READ_ALL", "AUDIT_RUN", "AUDIT_VIEW", "REPORT_VIEW_ALL"],
};

export function hasCapability(role: UserRole, capability: Capability): boolean {
  return GRANTS[role]?.includes(capability) ?? false;
}

export function capabilitiesFor(role: UserRole): readonly Capability[] {
  return GRANTS[role] ?? [];
}

/** True when a role may *read* an item's full detail (as opposed to a stripped view). */
export function seesFullItemDetail(role: UserRole): boolean {
  return hasCapability(role, "ITEM_READ_ALL");
}
