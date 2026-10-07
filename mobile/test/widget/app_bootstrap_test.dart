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
  testWidgets('a first launch with no stored token lands on the login screen',
      (tester) async {
    final api = FakeApi()..get('/health', {'status': 'ok'});
    await pumpApp(tester, api);

    // The assertion is the login screen itself, not "something other than the
    // splash": the failure mode was a screen that is *always* there.
    await pumpUntilFound(tester, find.text('Staff sign in'));
    expect(visibleText(tester), contains('Password'));
  });

  testWidgets('a stored token the server rejects lands on the login screen',
      (tester) async {
    final api = FakeApi()
      ..get('/health', {'status': 'ok'})
      ..error('GET', '/auth/me', 401, 'Invalid token');
    await pumpApp(tester, api, overrides: api.overridesWithToken('stale-token'));

    // Rejected for any reason, the session cannot be vouched for, so the splash
    // must hand over to the login screen rather than hold a dead workbench.
    await pumpUntilFound(tester, find.text('Staff sign in'));
    expect(api.requests.map((request) => request.path), contains('/auth/me'));
  });

  testWidgets('a stored token the server accepts leaves the splash for the app',
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
    await pumpApp(tester, api, overrides: api.overridesWithToken('good-token'));

    // A signed-in cold start never shows the login screen — that flash is the whole
    // reason the splash exists.
    expect(api.requests.map((request) => request.path), contains('/auth/me'));
    await pumpFrames(tester, frames: 30);
    expect(visibleText(tester), isNot(contains('Staff sign in')));
  });
}
