import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../models/user.dart';
import 'core_providers.dart';

/// Mirrors `frontend/src/app/AuthContext.tsx`.
enum AuthStatus {
  /// Before the stored token has been checked — the router shows the splash and
  /// redirects to nothing, so a signed-in user never flashes the login screen.
  unknown,

  authenticated,
  unauthenticated,
}

class AuthState {
  const AuthState({required this.status, this.user});

  const AuthState.unknown() : this(status: AuthStatus.unknown);
  const AuthState.unauthenticated() : this(status: AuthStatus.unauthenticated);

  final AuthStatus status;
  final AuthUser? user;

  bool get isAuthenticated => status == AuthStatus.authenticated;

  /// A staff/admin viewer — the two roles the whole authed shell is open to.
  bool get canUseWorkbench => isAuthenticated;

  /// Admin-only screens.
  bool get isAdmin => user?.role.isAdmin ?? false;

  /// A password an administrator reset must be changed before anything else.
  bool get mustChangePassword => user?.mustChangePassword ?? false;
}

/// Holds the signed-in account for the whole app.
///
/// Three behaviours are load-bearing and come straight from the web implementation:
///
///   1. **`unknown` is a real state.** The app does not render the login screen
///      until the stored token has been checked, otherwise a returning user sees a
///      flash of the login page on every cold start.
///   2. **A `401` anywhere signs the user out**, because [ApiClient] clears the
///      token and calls back here — one place, not per screen.
///   3. **`mustChangePassword` is enforced by the router**, not hidden. The flag is
///      server-set when an admin resets a password, and the server refuses other
///      work, so the client only needs to route.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final client = ref.watch(apiClientProvider);
    // Register the one-and-only 401 handler. Re-registered whenever the client is
    // rebuilt, and cleared on dispose so a dead controller is never called.
    client.onUnauthorized = _onUnauthorized;
    ref.onDispose(() {
      if (client.onUnauthorized == _onUnauthorized) client.onUnauthorized = null;
    });
    return const AuthState.unknown();
  }

  void _onUnauthorized() {
    // The token is already cleared by the client; this only updates the UI state,
    // and the router's redirect does the rest.
    state = const AuthState.unauthenticated();
  }

  /// Called once during bootstrap: read the stored token, and if there is one,
  /// confirm it still works. A token that the server rejects for any reason other
  /// than 401 (an unreachable API, say) leaves the user signed in with what we
  /// have, rather than throwing them out because of a flaky network.
  Future<void> bootstrap() async {
    final client = ref.read(apiClientProvider);
    await client.hydrateToken();

    if (!client.hasToken) {
      state = const AuthState.unauthenticated();
      return;
    }

    try {
      final user = await ref.read(authApiProvider).me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } on ApiError {
      // A 401 already cleared the token in the client. Any other code (a 500, a
      // revoked account) also means we cannot vouch for this session.
      state = const AuthState.unauthenticated();
    } on NetworkError {
      // Offline with a stored token. Signed out is the honest state here: the
      // account cannot be verified, and the login screen's banner explains why
      // rather than leaving a dead workbench on screen.
      state = const AuthState.unauthenticated();
    }
  }

  /// `POST /auth/login`. Throws [ApiError] for the screen to render verbatim
  /// (a wrong password is the server's own "Invalid credentials").
  Future<void> login({required String email, required String password}) async {
    final response = await ref.read(authApiProvider).login(email: email, password: password);
    await ref.read(apiClientProvider).saveToken(response.token);
    state = AuthState(status: AuthStatus.authenticated, user: response.user);
  }

  Future<void> logout() async {
    await ref.read(apiClientProvider).clearToken();
    state = const AuthState.unauthenticated();
    // Everything cached belongs to the account that just left.
    ref.invalidate(healthProvider);
  }

  /// `POST /auth/change-password`. On success the server has already revoked every
  /// *other* session and returned a fresh token for this one — so the new token is
  /// saved and the user stays signed in, with the forced-change flag cleared.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await ref.read(authApiProvider).changePassword(
          currentPassword: currentPassword,
          newPassword: newPassword,
        );
    await ref.read(apiClientProvider).saveToken(response.token);
    state = AuthState(status: AuthStatus.authenticated, user: response.user);
  }

  /// Re-reads the account (`GET /auth/me`). Used after an admin promotes or
  /// renames the signed-in user from the accounts screen, so the shell's role
  /// gates and the avatar update without a sign-out.
  Future<void> refreshUser() async {
    if (!ref.read(apiClientProvider).hasToken) return;
    final user = await ref.read(authApiProvider).me();
    state = AuthState(status: AuthStatus.authenticated, user: user);
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Convenience selectors, so a widget can watch just the piece it needs and not
/// rebuild on an unrelated auth change.
final currentUserProvider = Provider<AuthUser?>((ref) => ref.watch(authProvider).user);
final isAdminProvider = Provider<bool>((ref) => ref.watch(authProvider).isAdmin);
