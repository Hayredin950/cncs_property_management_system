/// Runtime configuration, mirroring `frontend/src/lib/env.ts`.
///
/// The web app bakes `VITE_API_BASE_URL` into the bundle at build time and always
/// joins the `/api/v1` prefix in one place so no call site has to remember it.
/// This is that same rule for the mobile client:
///
///   * the default is the deployed API, so a release build works on a real phone
///     with no setup at all;
///   * `--dart-define=API_BASE_URL=...` overrides it, which is how you point a
///     debug build at a local Docker stack (`http://10.0.2.2:4000` on an Android
///     emulator, or your machine's LAN address on a physical device).
///
/// `String.fromEnvironment` is a `const` compile-time read, so the override really
/// is baked in — it cannot be changed at runtime, exactly like the web build.
class Env {
  const Env._();

  /// `--dart-define=API_BASE_URL=https://…` (no trailing slash needed).
  static const String _override = String.fromEnvironment('API_BASE_URL');

  /// `cncs-pms-api`, the one serverless function (docs/deployment.md).
  static const String productionOrigin =
      'https://cncs-pms-api-hayredins-projects.vercel.app';

  /// The API origin with any trailing slashes removed.
  ///
  /// A native app sends no `Origin` header, so the backend's production CORS
  /// allowlist (which fails closed for *browser* callers) does not apply here —
  /// `if (!origin || CORS_ORIGINS.includes(origin))` admits a request with no
  /// origin. Worth knowing when debugging: "couldn't reach the server" in the
  /// web build is usually CORS, but in this client it is the network.
  static String get origin {
    final raw = _override.isEmpty ? productionOrigin : _override;
    return raw.replaceAll(RegExp(r'/+$'), '');
  }

  /// Always the versioned prefix — every `api/*` call is relative to this.
  static String get apiBaseUrl => '$origin/api/v1';

  /// True when the build was pointed somewhere other than production, so the
  /// login screen (and the shell's status dot) can say so instead of leaving a
  /// tester guessing which backend answered.
  static bool get isCustomBackend => _override.isNotEmpty;
}
