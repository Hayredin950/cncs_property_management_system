/// Mirrored from `backend/prisma/schema.prisma` via
/// `frontend/src/types/enums.ts`. Keep in lockstep by hand — there is no shared
/// generated client across the monorepo (frontend-plan.md §13).
///
/// Each enum carries its own `fromJson` that **tolerates an unknown value**
/// rather than throwing. That is deliberate: the API is versioned separately from
/// a shipped app, so a future enum member must degrade to "render the raw string"
/// instead of crashing a screen that used to work. See [enumLabel].
library;

enum Role {
  admin('ADMIN', 'Admin'),
  staff('STAFF', 'Staff'),
  unknown('', 'Unknown');

  const Role(this.wire, this.label);

  final String wire;
  final String label;

  static Role fromJson(Object? value) => switch (value) {
        'ADMIN' => Role.admin,
        'STAFF' => Role.staff,
        _ => Role.unknown,
      };

  bool get isAdmin => this == Role.admin;
  bool get isStaff => this == Role.staff;
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
  disposed('DISPOSED', 'Disposed'),
  unknown('', 'Unknown');

  const ItemStatus(this.wire, this.label);

  final String wire;
  final String label;

  static ItemStatus fromJson(Object? value) => switch (value) {
        'ACTIVE' => ItemStatus.active,
        'DISPOSED' => ItemStatus.disposed,
        _ => ItemStatus.unknown,
      };
}

enum RequestType {
  transfer('TRANSFER', 'Transfer'),
  disposal('DISPOSAL', 'Disposal'),
  unknown('', 'Unknown');

  const RequestType(this.wire, this.label);

  final String wire;
  final String label;

  static RequestType fromJson(Object? value) => switch (value) {
        'TRANSFER' => RequestType.transfer,
        'DISPOSAL' => RequestType.disposal,
        _ => RequestType.unknown,
      };
}

enum RequestStatus {
  pending('PENDING', 'Pending review'),
  approved('APPROVED', 'Approved'),
  rejected('REJECTED', 'Rejected'),
  unknown('', 'Unknown');

  const RequestStatus(this.wire, this.label);

  final String wire;
  final String label;

  static RequestStatus fromJson(Object? value) => switch (value) {
        'PENDING' => RequestStatus.pending,
        'APPROVED' => RequestStatus.approved,
        'REJECTED' => RequestStatus.rejected,
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
  if (value is AuditItemResult) return value.label;
  return value.name;
}
