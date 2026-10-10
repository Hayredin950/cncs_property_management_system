import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the JWT lives, mirroring `frontend/src/lib/storage.ts`.
///
/// The web app keeps its token in `localStorage`; on a phone the equivalent is
/// the platform keystore (Keychain on iOS, EncryptedSharedPreferences on
/// Android), which `flutter_secure_storage` wraps. That is strictly better than
/// a plain file: a stolen backup no longer contains the token.
///
/// Deliberately an interface with a settable instance so widget tests can swap in
/// [InMemoryTokenStorage] and never touch platform channels — the same reason the
/// web tests stub `localStorage`.
abstract class TokenStorage {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

/// The real store.
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  /// The one key both the login flow and the Dio interceptor use.
  static const String _key = 'cncs_pms_token';

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// A test double, and the fallback if the platform store is unavailable.
class InMemoryTokenStorage implements TokenStorage {
  InMemoryTokenStorage([this._token]);

  String? _token;

  @override
  Future<String?> read() async => _token;

  @override
  Future<void> write(String token) async => _token = token;

  @override
  Future<void> clear() async => _token = null;
}
