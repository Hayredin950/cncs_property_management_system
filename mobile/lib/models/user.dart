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
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: asString(json['id']),
        fullName: asString(json['fullName']),
        email: asString(json['email']),
        role: Role.fromJson(json['role']),
        createdAt: asString(json['createdAt']),
        mustChangePassword: asBool(json['mustChangePassword']),
      );

  final String id;
  final String fullName;
  final String email;
  final Role role;
  final String createdAt;

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
