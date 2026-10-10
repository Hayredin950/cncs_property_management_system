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
  });

  factory UserSummary.fromJson(Map<String, dynamic> json) => UserSummary(
        id: asString(json['id']),
        fullName: asString(json['fullName']),
        email: asString(json['email']),
        role: Role.fromJson(json['role']),
        createdAt: asString(json['createdAt']),
        itemCount: asInt(json['itemCount']),
      );

  final String id;
  final String fullName;
  final String email;
  final Role role;
  final String createdAt;
  final int itemCount;

  bool get isAdmin => role == Role.admin;
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
