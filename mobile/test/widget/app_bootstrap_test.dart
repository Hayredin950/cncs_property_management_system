import 'package:cncs_pms_mobile/app/router.dart';
import 'package:cncs_pms_mobile/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

/// Cold-start routing.
///
/// The redirect that picks between the splash, the login screen and the workbench
/// lives in `router.dart` and only runs when the whole app boots, so none of the
/// screen-level tests can see it. It is also where the one bug that never showed up
/// in a test hid: `/splash` was treated as a public route, so an anonymous session
/// that settled on it matched the public rule, was redirected nowhere, and left the
/// user looking at the logo and a spinner for good.
void main() {
  testWidgets(
    'a first launch with no stored token lands on the public landing page',
    (tester) async {
      final api = FakeApi()..get('/health', {'status': 'ok'});
      await pumpApp(tester, api);

      // The anonymous front door, the same page the web app serves at `/`: what the
      // register is, the sign-in button and the request-an-account door. The splash
      // used to hand every cold start straight to the login form, so a visitor never
      // saw the page that explains what they were signing in to.
      await pumpUntilFound(
        tester,
        find.text('CNCS Property Management System'),
      );
      final text = visibleText(tester);
      expect(text, contains('Request an account'));
      expect(text, contains('Staff sign in'));
      expect(text, isNot(contains('Password')));
    },
  );

  testWidgets('the login form has a way back to the landing page', (
    tester,
  ) async {
    final api = FakeApi()..get('/health', {'status': 'ok'});
    await pumpApp(tester, api);
    await pumpUntilFound(tester, find.text('CNCS Property Management System'));

    await tester.tap(find.text('Staff sign in').last);
    await pumpUntilFound(tester, find.text('Password'));

    // A page you can only leave with the hardware Back key is not a page with an
    // exit: the visitor who tapped "Sign in" by mistake gets the front door back.
    await tester.tap(find.text('Back to home'));
    await pumpUntilFound(tester, find.text('CNCS Property Management System'));
    expect(visibleText(tester), isNot(contains('Password')));
  });

  testWidgets(
    'a stored token the server rejects lands on the public landing page',
    (tester) async {
      final api = FakeApi()
        ..get('/health', {'status': 'ok'})
        ..error('GET', '/auth/me', 401, 'Invalid token');
      await pumpApp(
        tester,
        api,
        overrides: api.overridesWithToken('stale-token'),
      );

      // Rejected for any reason, the session cannot be vouched for, so the splash
      // must hand over rather than hold a dead workbench — and the visitor is
      // anonymous now, so the page they get is the public one.
      await pumpUntilFound(
        tester,
        find.text('CNCS Property Management System'),
      );
      expect(api.requests.map((request) => request.path), contains('/auth/me'));
      expect(visibleText(tester), isNot(contains('Password')));
    },
  );

  testWidgets('a deep link opened without a session comes back after sign-in', (
    tester,
  ) async {
    final api = FakeApi()
      ..get('/health', {'status': 'ok'})
      ..error('GET', '/auth/me', 401, 'Invalid token');
    await pumpApp(
      tester,
      api,
      overrides: api.overridesWithToken('stale-token'),
    );

    final context = tester.element(find.byType(CncsPmsApp));
    ProviderScope.containerOf(context)
        .read(routerProvider)
        .go('/items?scope=mine');
    await pumpFrames(tester, frames: 20);

    // The link is remembered, not dropped: the login screen carries it as `from`
    // and forwards there once the visitor signs in.
    await pumpUntilFound(tester, find.text('Staff sign in'));
    expect(visibleText(tester), contains('Password'));
  });

  testWidgets(
    'a stored token the server accepts leaves the splash for the app',
    (tester) async {
      final api = FakeApi()
        ..get('/health', {'status': 'ok'})
        ..get('/auth/me', {
          'user': {
            'id': 'user-1',
            'fullName': 'Selam Bekele',
            'email': 'selam@aau.edu.et',
            'role': 'ADMIN',
            'createdAt': '2026-01-01T00:00:00.000Z',
            'mustChangePassword': false,
          },
        });
      await pumpApp(
        tester,
        api,
        overrides: api.overridesWithToken('good-token'),
      );

      // A signed-in cold start never shows the login screen — that flash is the whole
      // reason the splash exists.
      expect(api.requests.map((request) => request.path), contains('/auth/me'));
      await pumpFrames(tester, frames: 30);
      expect(visibleText(tester), isNot(contains('Staff sign in')));
    },
  );
}
