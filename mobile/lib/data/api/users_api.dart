import '../../core/api/api_client.dart';
import '../../models/json.dart';
import '../../models/user.dart';

/// `frontend/src/api/users.ts`. `list()` needs `USER_READ` (spec 2.1.1) and the
/// writes need `ACCOUNT_MANAGE`; the server enforces both, so a render by an
/// account without them would be a UI bug, not a way in.
class UsersApi {
  const UsersApi(this._client);

  final ApiClient _client;

  /// `GET /users` — every account, with how many items it owns, so the screen can
  /// say whether an account is part of the record before someone tries to remove it.
  Future<List<UserSummary>> list() async {
    final json = await _client.get<List<dynamic>>('/users');
    return [
      for (final row in json)
        if (row is Map) UserSummary.fromJson(Map<String, dynamic>.from(row)),
    ];
  }

  /// `PATCH /users/:id` — correct a name or email. A taken email answers 409.
  Future<UserSummary> update(String id, {String? fullName, String? email}) async {
    final json = await _client.patch<Map<String, dynamic>>(
      '/users/${Uri.encodeComponent(id)}',
      body: {
        if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
        if (email != null && email.isNotEmpty) 'email': email,
      },
    );
    return UserSummary.fromJson(json);
  }

  /// `POST /users/:id/promote` — set the account's role, any of the five spec
  /// roles (2.1). The endpoint is still named `promote` for the direction that was
  /// originally the only one.
  ///
  /// The server bumps the account's `tokenVersion`, so the role change takes effect
  /// on its next request instead of whenever the old token happened to expire
  /// (gap-analysis E10).
  Future<UserSummary> promote(String id, String role) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/users/${Uri.encodeComponent(id)}/promote',
      body: {'role': role},
    );
    return UserSummary.fromJson(json);
  }

  /// `POST /users/:id/password` — set a new password for the account. The target
  /// user is then forced to change it on next sign-in.
  Future<bool> resetPassword(String id, String password) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/users/${Uri.encodeComponent(id)}/password',
      body: {'password': password},
    );
    return asBool(json['passwordChanged']);
  }

  /// `DELETE /users/:id` — refused for any account that is part of the record
  /// (owns items, filed or reviewed requests, ran audits, made edits). Those
  /// relations would block the delete at the database level anyway, so the API
  /// reports what stands in the way instead — and that message is shown verbatim.
  Future<void> delete(String id) =>
      _client.delete<void>('/users/${Uri.encodeComponent(id)}');
}
