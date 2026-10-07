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

  /// `POST /auth/register` — Admin-only account creation (F1.3).
  /// A duplicate email answers 409.
  Future<AuthUser> register({
    required String fullName,
    required String email,
    required String password,
    required String role,
  }) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/auth/register',
      body: {'fullName': fullName, 'email': email, 'password': password, 'role': role},
    );
    return AuthUser.fromJson(asMap(json['user']));
  }
}
