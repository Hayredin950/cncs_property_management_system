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
  buildingManage,
  tagManage,
  categoryManage,
  auditRun,
  auditView,
  requestDecide,
  transferApproveStage1,
  transferApproveStage2,
  disposalApprove,
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
  },
  Role.propertyOfficer: {
    Capability.itemCreate,
    Capability.itemEditIdentity,
    Capability.itemEditCustody,
    Capability.itemClaim,
    Capability.itemVoid,
    Capability.itemReadAll,
    Capability.buildingManage,
    Capability.tagManage,
    Capability.categoryManage,
    Capability.requestDecide,
    Capability.transferApproveStage1,
    Capability.transferApproveStage2,
    Capability.disposalApprove,
    Capability.loanApprove,
    Capability.requestReadAll,
    Capability.reportViewAll,
    Capability.auditView,
    Capability.userRead,
  },
  Role.departmentHead: {
    Capability.itemEditCustody,
    Capability.itemClaim,
    Capability.requestDecide,
    Capability.transferApproveStage1,
    Capability.transferApproveStage2,
    Capability.accountApproveOwnUnit,
    Capability.accountDeactivateOwnUnit,
    Capability.reportViewAll,
  },
  Role.staff: {Capability.itemEditCustody, Capability.itemClaim},
  Role.auditor: {
    Capability.itemReadAll,
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

/// Account administration — the accounts screen and its write endpoints.
bool canManageAccounts(Role? role) => hasCapability(role, Capability.accountManage);

/// Read the account list (the custodian picker).
bool canReadUsers(Role? role) => hasCapability(role, Capability.userRead);

/// Claim or refuse a pending item — Staff/Dept Head/Property Officer.
bool canClaimItems(Role? role) => hasCapability(role, Capability.itemClaim);

/// Manage the category list.
bool canManageCategories(Role? role) => hasCapability(role, Capability.categoryManage);

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
