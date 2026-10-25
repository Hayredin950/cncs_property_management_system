import '../../core/api/api_client.dart';
import '../../models/json.dart';
import '../../models/user.dart';

/// `frontend/src/api/auth.ts` — the same four calls.
class AuthApi {
  const AuthApi(this._client);

  final ApiClient _client;

  /// `POST /auth/login` — public. The address is matched case-insensitively
  /// server-side.
  Future<LoginResponse> login({required String email, required String password}) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/auth/login',
      body: {'email': email, 'password': password},
    );
    return LoginResponse.fromJson(json);
  }

  /// `GET /auth/me` — rehydrates a stored token into a user on boot.
  Future<AuthUser> me() async {
    final json = await _client.get<Map<String, dynamic>>('/auth/me');
    return AuthUser.fromJson(asMap(json['user']));
  }

  /// `POST /auth/request-password-reset` — public: ask the server to mail a
  /// single-use link to this address.
  ///
  /// An administrator uses this from the accounts screen instead of setting a
  /// password (ruling C10: no administrator ever sees or sets another person's
  /// password). The server answers the same way whether or not the address has
  /// an account, so the message is deliberately non-committal.
  Future<String> requestPasswordReset(String email) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/auth/request-password-reset',
      body: {'email': email},
    );
    final message = asStringOrNull(json['message']);
    return message == null || message.isEmpty
        ? 'If that address has an account, a reset link has been sent.'
        : message;
  }

  /// `POST /auth/change-password` — the signed-in account changes its own
  /// password.
  ///
  /// The response is a fresh login payload: the server bumps the account's
  /// `tokenVersion`, revoking every **other** session, and returns a new token so
  /// this device stays signed in. That is why the success path saves the token
  /// again rather than only clearing the flag.
  Future<LoginResponse> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/auth/change-password',
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
    return LoginResponse.fromJson(json);
  }

  /// `POST /auth/account-requests` — public: anyone may ask, and nobody gets in by
  /// asking. The response carries no token, because the account is
  /// `PENDING_APPROVAL` and cannot sign in until a SYSTEM_ADMIN decides it.
  ///
  /// There is no `role` field on purpose: the request always lands as STAFF, and the
  /// approver assigns the real role.
  /// `POST /auth/accept-invite` — the invited person sets their own password
  /// and the account is activated.
  ///
  /// The invitation is the only way a privileged account comes into being, and
  /// the **invitee** sets the password — no administrator ever sees it or sets
  /// it. The token is single-use and expires.
  Future<LoginResponse> acceptInvite({
    required String token,
    required String password,
    String? fullName,
  }) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/auth/accept-invite',
      body: {
        'token': token,
        'password': password,
        if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
      },
    );
    return LoginResponse.fromJson(json);
  }

  Future<AccountRequestResponse> requestAccount({
    required String fullName,
    required String email,
    required String password,
  }) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/auth/account-requests',
      body: {'fullName': fullName, 'email': email, 'password': password},
    );
    return AccountRequestResponse.fromJson(json);
  }
}
