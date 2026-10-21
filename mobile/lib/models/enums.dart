/// Mirrored from `backend/prisma/schema.prisma` via
/// `frontend/src/types/enums.ts`. Keep in lockstep by hand — there is no shared
/// generated client across the monorepo (frontend-plan.md §13).
///
/// Each enum carries its own `fromJson` that **tolerates an unknown value**
/// rather than throwing. That is deliberate: the API is versioned separately from
/// a shipped app, so a future enum member must degrade to "render the raw string"
/// instead of crashing a screen that used to work. See [enumLabel].
library;

/// The five account roles (spec 2.1, amended 12 Oct: the Account Admin merged
/// into the System Admin). What each one may do is `models/permissions.dart` —
/// this enum is only the wire values and their labels.
///
/// There used to be two members, `ADMIN`/`STAFF`, and a pile of `isAdmin` checks.
/// The checks are what had to go: "is this the administrator" stopped meaning
/// anything once registering items, deciding requests and running audits landed on
/// three different roles.
enum Role {
  systemAdmin('SYSTEM_ADMIN', 'System Admin'),
  propertyOfficer('PROPERTY_OFFICER', 'Property Officer'),
  departmentHead('DEPARTMENT_HEAD', 'Department Head'),
  staff('STAFF', 'Staff'),
  auditor('AUDITOR', 'Auditor'),
  unknown('', 'Unknown');

  const Role(this.wire, this.label);

  final String wire;
  final String label;

  static Role fromJson(Object? value) => switch (value) {
        'SYSTEM_ADMIN' => Role.systemAdmin,
        'PROPERTY_OFFICER' => Role.propertyOfficer,
        'DEPARTMENT_HEAD' => Role.departmentHead,
        'STAFF' => Role.staff,
        'AUDITOR' => Role.auditor,
        _ => Role.unknown,
      };

  /// The roles a picker may offer, in the order `frontend/src/types/enums.ts`
  /// declares them. [unknown] is deliberately absent: it is what an unrecognised
  /// wire value degrades to, never a role anyone can choose.
  static const List<Role> selectable = [
    systemAdmin,
    propertyOfficer,
    departmentHead,
    staff,
    auditor,
  ];

  /// The roles that are **never self-registered** (authority doc D2): Heads,
  /// Property Officers, Auditors and System Admins arrive only through an invite an
  /// administrator issues with a recorded outside authorization.
  ///
  /// Mirrors `INVITABLE_ROLES` in `frontend/src/types/enums.ts` and
  /// `backend/src/services/invites.ts`. Staff is absent on purpose — Staff ask for
  /// an account and a head approves it.
  static const List<Role> invitable = [
    departmentHead,
    propertyOfficer,
    auditor,
    systemAdmin,
  ];
}

/// Account lifecycle (spec 3.1.2). `pendingApproval` is the state a self-request
/// lands in: it cannot sign in, and a SYSTEM_ADMIN decides it from the queue.
enum AccountStatus {
  active('ACTIVE', 'Active'),
  pendingEmailVerification('PENDING_EMAIL_VERIFICATION', 'Email not confirmed'),
  pendingApproval('PENDING_APPROVAL', 'Waiting for approval'),
  rejected('REJECTED', 'Declined'),
  deactivated('DEACTIVATED', 'Deactivated'),
  unknown('', 'Unknown');

  const AccountStatus(this.wire, this.label);

  final String wire;
  final String label;

  static AccountStatus fromJson(Object? value) => switch (value) {
        'ACTIVE' => AccountStatus.active,
        'PENDING_EMAIL_VERIFICATION' => AccountStatus.pendingEmailVerification,
        'PENDING_APPROVAL' => AccountStatus.pendingApproval,
        'REJECTED' => AccountStatus.rejected,
        'DEACTIVATED' => AccountStatus.deactivated,
        _ => AccountStatus.unknown,
      };
}

enum Condition {
  newItem('NEW', 'New'),
  good('GOOD', 'Good'),
  fair('FAIR', 'Fair'),
  damaged('DAMAGED', 'Damaged'),
  beyondRepair('BEYOND_REPAIR', 'Beyond repair'),
  unknown('', 'Unknown');

  const Condition(this.wire, this.label);

  final String wire;
  final String label;

  static Condition fromJson(Object? value) => switch (value) {
        'NEW' => Condition.newItem,
        'GOOD' => Condition.good,
        'FAIR' => Condition.fair,
        'DAMAGED' => Condition.damaged,
        'BEYOND_REPAIR' => Condition.beyondRepair,
        _ => Condition.unknown,
      };

  /// What the item form writes back. `unknown` never appears in a payload — the
  /// form's own default is `GOOD`, matching the web form.
  static const List<Condition> selectable = [newItem, good, fair, damaged, beyondRepair];
}

enum ItemStatus {
  active('ACTIVE', 'In service'),
  pendingClaim('PENDING_CLAIM', 'Waiting for claim'),
  revertedUnverified('REVERTED_UNVERIFIED', 'Returned unverified'),
  loaned('LOANED', 'On loan'),
  lost('LOST', 'Lost'),
  disposed('DISPOSED', 'Disposed'),
  voided('VOIDED', 'Voided'),
  unknown('', 'Unknown');

  const ItemStatus(this.wire, this.label);

  final String wire;
  final String label;

  static ItemStatus fromJson(Object? value) => switch (value) {
        'ACTIVE' => ItemStatus.active,
        'PENDING_CLAIM' => ItemStatus.pendingClaim,
        'REVERTED_UNVERIFIED' => ItemStatus.revertedUnverified,
        'LOANED' => ItemStatus.loaned,
        'LOST' => ItemStatus.lost,
        'DISPOSED' => ItemStatus.disposed,
        'VOIDED' => ItemStatus.voided,
        _ => ItemStatus.unknown,
      };
}

enum RequestType {
  transfer('TRANSFER', 'Transfer'),
  disposal('DISPOSAL', 'Disposal'),
  /// A loan out and due back. The server has supported it for weeks; the
  /// mobile app could not name one, so a loan was an "Unknown" type on a phone.
  loan('LOAN', 'Loan'),
  unknown('', 'Unknown');

  const RequestType(this.wire, this.label);

  final String wire;
  final String label;

  static RequestType fromJson(Object? value) => switch (value) {
        'TRANSFER' => RequestType.transfer,
        'DISPOSAL' => RequestType.disposal,
        'LOAN' => RequestType.loan,
        _ => RequestType.unknown,
      };
}

/// The request states the server can produce.
///
/// It knew four of them. The other five — the two stages of a transfer, a
/// waitlisted request, a withdrawn one, an invalidated one and a loan waiting
/// for its return to be confirmed — arrived as `unknown`, so a person on the
/// phone was told a request was in a state the app had no word for.
enum RequestStatus {
  pending('PENDING', 'Pending review'),
  pendingStage1('PENDING_STAGE1', 'Waiting for the releasing head'),
  pendingStage2('PENDING_STAGE2', 'Waiting for the receiving head'),
  approved('APPROVED', 'Approved'),
  rejected('REJECTED', 'Rejected'),
  waitlisted('WAITLISTED', 'Waiting for another request'),
  withdrawn('WITHDRAWN', 'Withdrawn'),
  invalidated('INVALIDATED', 'No longer possible'),
  returnPendingConfirmation('RETURN_PENDING_CONFIRMATION', 'Waiting for the return to be confirmed'),
  unknown('', 'Unknown');

  const RequestStatus(this.wire, this.label);

  final String wire;
  final String label;

  /// The state a request is still waiting on a person for.
  bool get isOpen =>
      this == RequestStatus.pending ||
      this == RequestStatus.pendingStage1 ||
      this == RequestStatus.pendingStage2;

  static RequestStatus fromJson(Object? value) => switch (value) {
        'PENDING' => RequestStatus.pending,
        'PENDING_STAGE1' => RequestStatus.pendingStage1,
        'PENDING_STAGE2' => RequestStatus.pendingStage2,
        'APPROVED' => RequestStatus.approved,
        'REJECTED' => RequestStatus.rejected,
        'WAITLISTED' => RequestStatus.waitlisted,
        'WITHDRAWN' => RequestStatus.withdrawn,
        'INVALIDATED' => RequestStatus.invalidated,
        'RETURN_PENDING_CONFIRMATION' => RequestStatus.returnPendingConfirmation,
        _ => RequestStatus.unknown,
      };
}

enum AuditItemResult {
  found('FOUND', 'Found'),
  missing('MISSING', 'Missing'),
  locationMismatch('LOCATION_MISMATCH', 'Wrong location'),
  unknown('', 'Unknown');

  const AuditItemResult(this.wire, this.label);

  final String wire;
  final String label;

  static AuditItemResult fromJson(Object? value) => switch (value) {
        'FOUND' => AuditItemResult.found,
        'MISSING' => AuditItemResult.missing,
        'LOCATION_MISMATCH' => AuditItemResult.locationMismatch,
        _ => AuditItemResult.unknown,
      };
}

enum NotificationCode {
  requestSubmitted('REQUEST_SUBMITTED'),
  requestApproved('REQUEST_APPROVED'),
  requestRejected('REQUEST_REJECTED'),
  unknown('');

  const NotificationCode(this.wire);

  final String wire;

  static NotificationCode fromJson(Object? value) => switch (value) {
        'REQUEST_SUBMITTED' => NotificationCode.requestSubmitted,
        'REQUEST_APPROVED' => NotificationCode.requestApproved,
        'REQUEST_REJECTED' => NotificationCode.requestRejected,
        _ => NotificationCode.unknown,
      };
}

/// The departments the property office registers against. Free text on the
/// server (a `String` column), so this is a convenience list for the pickers and
/// filters — never a validation source. The web app's `DEPT_ORDER` is the same
/// set.
const List<String> kDepartments = [
  'Biology',
  'Chemistry',
  'Physics',
  'Mathematics',
  'Statistics',
  'Earth Science',
  'Computer Science',
  'Information Science',
];

/// `frontend-design-system.md` §3.2 — a lookup for the few values that also
/// need an icon; anything unmapped still renders its own label.
String enumLabel(Enum value) {
  if (value is Condition) return value.label;
  if (value is ItemStatus) return value.label;
  if (value is RequestStatus) return value.label;
  if (value is RequestType) return value.label;
  if (value is Role) return value.label;
  if (value is AccountStatus) return value.label;
  if (value is AuditItemResult) return value.label;
  return value.name;
}
