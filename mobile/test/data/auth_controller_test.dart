import 'package:cncs_pms_mobile/core/api/api_error.dart';
import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/data/providers/core_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';

/// The auth controller is where three behaviours live that no screen can be trusted
/// to get right on its own:
///
///   * `unknown` is a real state, not a loading flag — the router holds every route
///     until the stored token has been checked, so a returning user never sees the
///     login screen flash.
///   * a `401` anywhere signs the user out, because the client clears the token and
///     calls back exactly once.
///   * a network failure while checking a stored token signs the user out rather than
///     leaving a dead workbench on screen.
void main() {
  ProviderContainer containerFor(FakeApi api, {String? token}) {
    final container = ProviderContainer(
      overrides: token == null ? api.overrides : api.overridesWithToken(token),
    );
    addTearDown(container.dispose);
    return container;
  }

  test('starts in unknown, before any token has been checked', () {
    final api = FakeApi();
    final container = containerFor(api);

    expect(container.read(authProvider).status, AuthStatus.unknown);
  });

  test('no stored token resolves straight to unauthenticated', () async {
    final api = FakeApi();
    final container = containerFor(api);

    await container.read(authProvider.notifier).bootstrap();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
    // The point of the branch: no `/auth/me` is attempted when there is nothing to
    // check, so a first launch makes exactly zero authenticated requests.
    expect(api.requests, isEmpty);
  });

  test('a valid stored token signs the user in', () async {
    final api = FakeApi()..get('/auth/me', {'user': userJson()});
    final container = containerFor(api, token: 'stored-token');

    await container.read(authProvider.notifier).bootstrap();

    final state = container.read(authProvider);
    expect(state.status, AuthStatus.authenticated);
    expect(state.user?.fullName, 'Selam Bekele');
    expect(state.isAdmin, isFalse);
  });

  test('a rejected token is discarded and the user is signed out', () async {
    final api = FakeApi()
      ..error('GET', '/auth/me', 401, 'Token expired or invalid');
    final client = api.clientWithToken('stale-token');
    final container = ProviderContainer(
      overrides: [apiClientProvider.overrideWithValue(client)],
    );
    addTearDown(container.dispose);

    await container.read(authProvider.notifier).bootstrap();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
    // Clearing the token is what makes the *next* cold start a normal first launch
    // rather than the same failed request again.
    expect(await api.storage.read(), isNull);
  });

  test('an unreachable API does not leave a signed-in-looking shell', () async {
    // No route registered for /auth/me → the harness answers 404, which is not a 401
    // and must still not be treated as a valid session.
    final api = FakeApi();
    final container = containerFor(api, token: 'stored-token');

    await container.read(authProvider.notifier).bootstrap();

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
  });

  test('a 401 from any later call signs the user out', () async {
    final api = FakeApi()..get('/auth/me', {'user': userJson()});
    final container = containerFor(api, token: 'good-token');
    await container.read(authProvider.notifier).bootstrap();
    expect(container.read(authProvider).isAuthenticated, isTrue);

    // Any endpoint answering 401 now must end the session; this is the interceptor's
    // callback, exercised through a real request rather than by calling the handler.
    api.error('GET', '/items', 401, 'Your session has ended');

    // Two things happen from the one 401, and both matter: the caller still fails
    // (it renders the server's sentence), and the session ends as a side effect.
    await expectLater(
      container.read(itemsApiProvider).list(),
      throwsA(isA<ApiError>()),
    );

    expect(container.read(authProvider).status, AuthStatus.unauthenticated);
    expect(await api.storage.read(), isNull);
  });
}
