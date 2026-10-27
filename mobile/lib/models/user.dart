import 'enums.dart';
import 'json.dart';

/// An account as every authed endpoint sees it — `frontend/src/types/user.ts`.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.fullName,
    required this.email,
    required this.role,
    required this.createdAt,
    this.mustChangePassword = false,
    this.departmentId,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: asString(json['id']),
        fullName: asString(json['fullName']),
        email: asString(json['email']),
        role: Role.fromJson(json['role']),
        createdAt: asString(json['createdAt']),
        mustChangePassword: asBool(json['mustChangePassword']),
        departmentId: asStringOrNull(json['departmentId']),
      );

  final String id;
  final String fullName;
  final String email;
  final Role role;
  final String createdAt;
  final String? departmentId;

  /// Set when an administrator reset this account's password. The shell forces
  /// the change on the next sign-in, exactly like `RequireAuth` does on the web.
  final bool mustChangePassword;

  /// First letter for the avatar; falls back to the email so a nameless account
  /// still renders something rather than an empty circle.
  String get initial {
    final source = fullName.trim().isNotEmpty ? fullName.trim() : email.trim();
    return source.isEmpty ? '?' : source.substring(0, 1).toUpperCase();
  }
}

/// `GET /users` — an account plus how many items it owns, so the admin screen can
/// show whether an account is part of the record before someone tries to remove it.
class UserSummary {
  const UserSummary({
    required this.id,
    required this.fullName,
    required this.email,
    required this.role,
    required this.createdAt,
    required this.itemCount,
    this.accountStatus = AccountStatus.active,
    this.reviewedAt,
    this.reviewNote,
  });

  factory UserSummary.fromJson(Map<String, dynamic> json) => UserSummary(
        id: asString(json['id']),
        fullName: asString(json['fullName']),
        email: asString(json['email']),
        role: Role.fromJson(json['role']),
        createdAt: asString(json['createdAt']),
        itemCount: asInt(json['itemCount']),
        accountStatus: json.containsKey('accountStatus')
            ? AccountStatus.fromJson(json['accountStatus'])
            : AccountStatus.active,
        reviewedAt: asStringOrNull(json['reviewedAt']),
        reviewNote: asStringOrNull(json['reviewNote']),
      );

  final String id;
  final String fullName;
  final String email;
  final Role role;
  final String createdAt;
  final int itemCount;

  /// The account lifecycle (spec 3.1.2). Only `active` accounts can sign in, and a
  /// `pendingApproval` one is what the approval queue is made of.
  final AccountStatus accountStatus;

  /// When an administrator decided it, or null for a row nobody had to review.
  final String? reviewedAt;

  /// The rejection reason, shown next to a declined row.
  final String? reviewNote;
}

/// `GET /departments/invitable` — the units a head invite may name (T6).
///
/// Not the same list as the public `GET /departments`, which is the units open to
/// *self-registration*: an invite is most needed where a unit has no working head,
/// and a headless unit is not one people register themselves into.
class InvitableUnit {
  const InvitableUnit({
    required this.id,
    required this.name,
    required this.code,
    required this.hasActiveHead,
  });

  factory InvitableUnit.fromJson(Map<String, dynamic> json) => InvitableUnit(
        id: asString(json['id']),
        name: asString(json['name']),
        code: asString(json['code']),
        hasActiveHead: asBool(json['hasActiveHead']),
      );

  final String id;
  final String name;
  final String code;

  /// True when the department already has a working head — the case the server
  /// refuses an invite for, shown here so it is not discovered from a 400.
  final bool hasActiveHead;
}

/// `POST /users/invite` — what an administrator gets back after issuing a
/// privileged invitation (T6).
///
/// There is no password in it, and that is the point: the account exists but cannot
/// be signed into until the invitee opens the single-use link and chooses their own.
class InviteResult {
  const InviteResult({
    required this.email,
    required this.role,
    required this.unitId,
    required this.inviteUrl,
    required this.expiresAt,
    required this.renewed,
    required this.delivery,
  });

  factory InviteResult.fromJson(Map<String, dynamic> json) {
    final invite = asMap(json['invite']);
    return InviteResult(
      email: asString(invite['email']),
      role: Role.fromJson(invite['role']),
      unitId: asStringOrNull(invite['unitId']),
      inviteUrl: asString(json['inviteUrl']),
      expiresAt: asString(invite['expiresAt']),
      renewed: asBool(invite['renewed']),
      delivery: asString(json['email']),
    );
  }

  final String email;
  final Role role;
  final String? unitId;

  /// The single-use link. Returned to the issuing administrator as well as emailed,
  /// because with no mail transport configured the administrator is the only
  /// deliverer there is.
  final String inviteUrl;

  final String expiresAt;

  /// True when this replaced a previous invitation that expired unaccepted.
  final bool renewed;

  /// `sent`, `skipped` or `failed` — `skipped` means nothing was emailed.
  final String delivery;
}

/// `POST /auth/account-requests` — what a person gets back after asking for an
/// account. Deliberately not a user object: there is no session, no role to render,
/// and the only thing to show is that the request is in and who to ask.
class AccountRequestResponse {
  const AccountRequestResponse({
    required this.message,
    required this.id,
    required this.fullName,
    required this.email,
    required this.accountStatus,
    required this.requestedAt,
  });

  factory AccountRequestResponse.fromJson(Map<String, dynamic> json) {
    final request = asMap(json['request']);
    return AccountRequestResponse(
      message: asString(json['message']),
      id: asString(request['id']),
      fullName: asString(request['fullName']),
      email: asString(request['email']),
      accountStatus: AccountStatus.fromJson(request['accountStatus']),
      requestedAt: asString(request['requestedAt']),
    );
  }

  final String message;
  final String id;
  final String fullName;
  final String email;
  final AccountStatus accountStatus;
  final String requestedAt;
}

/// `POST /auth/login` / `POST /auth/change-password`. The endpoint also flattens
/// the user at the top level; only the nested `user` is read (frontend-plan.md §4).
class LoginResponse {
  const LoginResponse({required this.token, required this.user});

  factory LoginResponse.fromJson(Map<String, dynamic> json) => LoginResponse(
        token: asString(json['token']),
        user: AuthUser.fromJson(asMap(json['user'])),
      );

  final String token;
  final AuthUser user;
}


/// `GET /users/invites` — one invitation, and what became of it.
///
/// The list is how an administrator answers "who did we invite, and did they
/// take it up?" without re-reading the mail they sent. `status` is the server's
/// computed value: `PENDING`, `RESENT`, `ACCEPTED` or `EXPIRED`.
class InviteRow {
  const InviteRow({
    required this.id,
    required this.fullName,
    required this.email,
    required this.role,
    required this.createdAt,
    required this.expiresAt,
    required this.status,
    this.acceptedAt,
  });

  factory InviteRow.fromJson(Map<String, dynamic> json) => InviteRow(
    id: asString(json['id']),
    fullName: asString(json['fullName']),
    email: asString(json['email']),
    role: Role.fromJson(json['role']),
    createdAt: asString(json['createdAt']),
    expiresAt: asString(json['expiresAt']),
    status: asString(json['status'], fallback: 'PENDING'),
    acceptedAt: asStringOrNull(json['acceptedAt']),
  );

  final String id;
  final String fullName;
  final String email;
  final Role role;
  final String createdAt;
  final String expiresAt;

  /// `PENDING`, `RESENT`, `ACCEPTED` or `EXPIRED`.
  final String status;
  final String? acceptedAt;

  /// Still waiting on the invitee: the only state in which resending or
  /// revoking means anything.
  bool get isOpen => status == 'PENDING' || status == 'RESENT';
}
