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

  /// `GET /users/approvals` — the accounts waiting for a decision, oldest first.
  ///
  /// Requires `ACCOUNT_MANAGE`, which is more than `GET /users` needs: the account
  /// list fills the custodian picker, while the queue is the list of people waiting
  /// to join, and who is waiting is the System Admin's business alone.
  Future<List<UserSummary>> listApprovals() async {
    final json = await _client.get<List<dynamic>>('/users/approvals');
    return [
      for (final row in json)
        if (row is Map) UserSummary.fromJson(Map<String, dynamic>.from(row)),
    ];
  }

  /// `POST /users/:id/approve` — let the account sign in.
  ///
  /// [role] is the real role, assigned at approval time: the request itself always
  /// asks as STAFF. Omit it to keep the role the request already carries.
  ///
  /// The server refuses an administrator approving **their own** account with 403 —
  /// the rule lives there, not in this client.
  Future<UserSummary> approve(String id, {String? role}) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/users/${Uri.encodeComponent(id)}/approve',
      body: {if (role != null && role.isNotEmpty) 'role': role},
    );
    return UserSummary.fromJson(json);
  }

  /// `POST /users/:id/reject` — decline the request with a reason the person will
  /// read. The reason is required (3–500 characters), same as a request rejection.
  Future<UserSummary> reject(String id, String reason) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/users/${Uri.encodeComponent(id)}/reject',
      body: {'reason': reason},
    );
    return UserSummary.fromJson(json);
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
