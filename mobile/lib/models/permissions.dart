import 'enums.dart';

/// The mobile half of the permission matrix — `frontend/src/lib/permissions.ts`,
/// itself handed down from `backend/src/services/permissions.ts`.
///
/// It decides **what to render**: which More-sheet rows, which tab badge, which
/// buttons. It is never a control. The server re-checks every one of these on the
/// request, and a screen that hides a button has not denied anything. Keep the
/// three lists in step by hand, the same way `models/enums.dart` is kept in step
/// with the Prisma schema.
enum Capability {
  itemCreate,
  itemEditIdentity,
  itemEditCustody,
  itemClaim,
  itemVoid,
  itemReadAll,
  /// Use the register: list what the role's scope allows and open any listed
  /// row. Every asset role holds it, Staff included, so a row the list draws is
  /// never a dead end. Editing is `itemEditCustody` plus the row scope.
  itemRead,
  buildingManage,
  tagManage,
  categoryManage,
  auditRun,
  auditView,
  requestDecide,
  transferApproveStage1,
  transferApproveStage2,
  disposalApprove,
  disposalReverse,
  loanApprove,
  requestReadAll,
  reportViewAll,
  accountManage,
  accountApproveOwnUnit,
  accountApproveAny,
  accountInvite,
  accountDeactivateOwnUnit,
  accountDeactivatePrivileged,
  systemConfig,
  userRead,
}

const Map<Role, Set<Capability>> _grants = {
  Role.systemAdmin: {
    Capability.accountManage,
    Capability.accountApproveAny,
    Capability.accountInvite,
    Capability.accountDeactivatePrivileged,
    Capability.systemConfig,
    Capability.userRead,
    // The college's buildings are the register's vocabulary, not asset data:
    // the administrator owns the list (27 Oct), the office reads it.
    Capability.buildingManage,
  },
  Role.propertyOfficer: {
    Capability.itemCreate,
    Capability.itemEditIdentity,
    Capability.itemEditCustody,
    Capability.itemClaim,
    Capability.itemVoid,
    Capability.itemReadAll,
    Capability.itemRead,
    Capability.tagManage,
    Capability.categoryManage,
    Capability.requestDecide,
    Capability.transferApproveStage1,
    Capability.transferApproveStage2,
    Capability.disposalApprove,
    Capability.disposalReverse,
    Capability.loanApprove,
    Capability.requestReadAll,
    Capability.reportViewAll,
    Capability.auditView,
    Capability.userRead,
  },
  Role.departmentHead: {
    Capability.itemEditCustody,
    Capability.itemClaim,
    // The server grants a head `ITEM_READ_ALL`; the field filtering is
    // per-item there, so it opens the read routes and the row scope limits
    // them to the head's own unit.
    Capability.itemReadAll,
    Capability.itemRead,
    Capability.requestDecide,
    Capability.transferApproveStage1,
    Capability.transferApproveStage2,
    Capability.accountApproveOwnUnit,
    Capability.accountDeactivateOwnUnit,
    Capability.reportViewAll,
  },
  Role.staff: {Capability.itemEditCustody, Capability.itemClaim, Capability.itemRead},
  Role.auditor: {
    Capability.itemReadAll,
    Capability.itemRead,
    Capability.auditRun,
    Capability.auditView,
    Capability.reportViewAll,
  },
};

bool hasCapability(Role? role, Capability capability) {
  if (role == null) return false;
  return _grants[role]?.contains(capability) ?? false;
}

/// Register an item — Property Officer only (spec 4.3).
bool canCreateItems(Role? role) => hasCapability(role, Capability.itemCreate);

/// Decide a transfer or disposal request (spec 2.2).
bool canDecideRequests(Role? role) => hasCapability(role, Capability.requestDecide);

/// Run an audit session — auditors only (spec 8.1).
bool canRunAudits(Role? role) => hasCapability(role, Capability.auditRun);

/// Read audit history and per-session reports.
bool canViewAudits(Role? role) => hasCapability(role, Capability.auditView);

/// Read college-wide reports and exports.
bool canViewReports(Role? role) => hasCapability(role, Capability.reportViewAll);

/// Does this role have a request list of its own? `REQUEST_DECIDE` opens the
/// queue for a reviewer; a Staff account sees the requests it filed. The other
/// roles file none and decide none, so the dashboard's request section would be a
/// permanently empty card. Twin of `canViewOwnRequests` on the web.
bool canViewOwnRequests(Role? role) =>
    hasCapability(role, Capability.requestDecide) || role == Role.staff;

/// Does this role see asset data at all? The SYSTEM_ADMIN is an account role and
/// sees none (spec 2.1.1) — the server's item scope is empty for it, so every
/// asset screen it opens is empty rather than forbidden. This is the client-side
/// twin of `ASSET_ROLES` in `frontend/src/lib/permissions.ts`, and the check an
/// asset tile or section should make before rendering: "0 items tracked" and
/// "No items registered yet" are not true statements about the register, they are
/// statements about a viewer who cannot see it.
bool seesAssetData(Role? role) => hasCapability(role, Capability.itemRead);

/// Account administration — the accounts screen and its write endpoints.
bool canManageAccounts(Role? role) => hasCapability(role, Capability.accountManage);

/// Read the account list (the custodian picker).
bool canReadUsers(Role? role) => hasCapability(role, Capability.userRead);

/// Claim or refuse a pending item — Staff/Dept Head/Property Officer.
bool canClaimItems(Role? role) => hasCapability(role, Capability.itemClaim);

/// Manage the category list.
bool canManageCategories(Role? role) => hasCapability(role, Capability.categoryManage);

/// Manage the college's buildings. The Property Officer's grant, and the same
/// role that registers items — so the list the form picks from and the screen
/// that keeps it correct are one audience.
bool canManageBuildings(Role? role) => hasCapability(role, Capability.buildingManage);

/// Read the system's build facts, the account log and the college's units.
///
/// One capability, three screens: they are one administrative surface, and the
/// API gates all of them on `SYSTEM_CONFIG` (spec 2.1.1).
bool canViewSystemConfig(Role? role) => hasCapability(role, Capability.systemConfig);

/// See every item's staff detail, whichever role holds it.
bool seesAllItems(Role? role) => hasCapability(role, Capability.itemReadAll);

/// Approve first stage of a transfer (releasing head / property officer).
bool canApproveTransferStage1(Role? role) => hasCapability(role, Capability.transferApproveStage1);

/// Approve second stage of a transfer (receiving head / property officer).
bool canApproveTransferStage2(Role? role) => hasCapability(role, Capability.transferApproveStage2);

/// Approve a disposal request (property officer only).
bool canApproveDisposal(Role? role) => hasCapability(role, Capability.disposalApprove);

/// Approve a loan request (property officer only).
bool canApproveLoan(Role? role) => hasCapability(role, Capability.loanApprove);

/// Edit an item at all — the capability, before the row is considered.
bool canEditItemCustody(Role? role) => hasCapability(role, Capability.itemEditCustody);

/// Edit identity/financial/photo fields — the Property Officer's half (spec 4.7).
bool canEditItemIdentity(Role? role) => hasCapability(role, Capability.itemEditIdentity);

/// Regenerate a printed tag (the artwork, never the tag id).
bool canManageTags(Role? role) => hasCapability(role, Capability.tagManage);

/// File an item request. Every role may except the SYSTEM_ADMIN, which the API
/// refuses by name — an account role does not borrow, transfer or dispose.
bool canFileRequests(Role? role) => role != null && role != Role.systemAdmin;

/// A Department Head approves the staff registrations of their own unit.
bool canApproveOwnUnitAccounts(Role? role) => hasCapability(role, Capability.accountApproveOwnUnit);

/// A System Admin approves any registration.
bool canApproveAnyAccounts(Role? role) => hasCapability(role, Capability.accountApproveAny);

/// May open the account-approvals queue at all.
bool canApproveAccounts(Role? role) =>
    canApproveOwnUnitAccounts(role) || canApproveAnyAccounts(role);

/// May this viewer edit **this** item?
///
/// The capability says *what* a role may edit; the row decides *which* rows.
/// Staff edit what they hold, a head edits their own unit's items (and anything
/// they personally hold), and the Property Officer edits any row. This mirrors
/// `itemInScope` on the server, which is the authority — the check here exists so
/// the phone does not offer a button the API will refuse.
bool canEditItem({
  required Role? role,
  required String? userId,
  required String? departmentId,
  required String? ownerId,
  required String? holderType,
  required String? holderId,
  required String? orgUnitId,
}) {
  if (!canEditItemCustody(role)) return false;
  if (canEditItemIdentity(role)) return true;
  if (role == Role.staff) {
    return ownerId == userId || (holderType == 'STAFF' && holderId == userId);
  }
  if (role == Role.departmentHead) {
    return (departmentId != null && orgUnitId == departmentId) ||
        (holderType == 'DEPARTMENT' && holderId == departmentId) ||
        ownerId == userId;
  }
  return false;
}

/// May this viewer confirm/dispute a loan return? The lender side of the
/// handshake — the Property Officer, never the borrower. Loans are approved
/// under `LOAN_APPROVE` (the officer alone), so the person who let the item out
/// is the person who checks it back in; a head has no loan decisions to answer.
bool canConfirmLoanReturn(Role? role) => hasCapability(role, Capability.loanApprove);

/// The statuses that mean "waiting on this viewer's decision", as the
/// comma-separated value the API accepts.
///
/// The dashboard tile, the dashboard preview and the Requests screen all have
/// to answer the same question. Counting `PENDING` alone undercounted a
/// reviewer's real queue: a head with three stage-2 transfers and a stage-1 saw
/// "4 pending" while those rows were what the queue held, and a Property
/// Officer's return confirmation was invisible. The set is written down once
/// here and mirrors `decisionStatusesFor` in
/// `backend/src/routes/requests.ts`.
///
/// `null` for a viewer with no decision rights (a staff member, the admin): they
/// have no review queue, and their list is their own filings, unfiltered.
String? reviewQueueStatuses(Role? role) {
  if (!canDecideRequests(role)) return null;
  final statuses = <String>['PENDING', 'PENDING_STAGE1', 'PENDING_STAGE2'];
  // Only the office that lent the item can confirm its return; a head cannot,
  // so a return waiting on the officer is not in the head's count.
  if (canConfirmLoanReturn(role)) statuses.add('RETURN_PENDING_CONFIRMATION');
  return statuses.join(',');
}

/// May this viewer see the item's **full detail and change history**?
///
/// Mirrors `seesFullItemDetail` in `backend/src/utils/filterItemFields.ts`:
/// the Property Officer and the Auditor see every row, a custodian sees their
/// own, and a head sees their **own unit's** rows. `ITEM_READ_ALL` alone is not
/// enough for a head — another department's history answers 404 — which is why
/// this is a per-item predicate rather than `seesAllItems(role)`.
bool seesFullItemDetail({
  required Role? role,
  required String? userId,
  required String? departmentId,
  required String? ownerId,
  required String? holderType,
  required String? holderId,
  required String? orgUnitId,
}) {
  if (role == Role.propertyOfficer || role == Role.auditor) return true;
  if (userId == null) return false;
  if (ownerId == userId) return true;
  if (holderType == 'STAFF' && holderId == userId) return true;
  if (role == Role.departmentHead && departmentId != null) {
    if (orgUnitId == departmentId) return true;
    if (holderType == 'DEPARTMENT' && holderId == departmentId) return true;
  }
  return false;
}
