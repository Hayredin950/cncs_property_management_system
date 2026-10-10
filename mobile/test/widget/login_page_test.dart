import 'package:cncs_pms_mobile/features/auth/login_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

void main() {
  testWidgets('renders the form and nothing about the build behind it', (tester) async {
    final api = FakeApi()..get('/health', {'status': 'ok'});
    await pumpPage(tester, const LoginPage(), api: api);

    final text = visibleText(tester);
    expect(text, contains('Staff sign in'));
    expect(text, contains('The register is maintained by CNCS staff and administrators.'));
    expect(text, contains('Email'));
    expect(text, contains('Password'));
    // A sign-in card is read by staff and by visitors: an API origin, a health
    // banner or a build marker is a developer note that belongs in the logs. This
    // is the regression test for their removal — the screen must not name a URL.
    expect(text, isNot(contains('http')));
    expect(text, isNot(contains('reachable')));
  });

  testWidgets('a wrong password shows the API\u2019s own sentence', (tester) async {
    final api = FakeApi()
      ..get('/health', {'status': 'ok'})
      ..error('POST', '/auth/login', 401, 'Invalid credentials');
    await pumpPage(tester, const LoginPage(), api: api);

    await tester.enterText(find.byType(TextField).at(0), 'selam@aau.edu.et');
    await tester.enterText(find.byType(TextField).at(1), 'wrong-password');
    await tester.tap(find.text('Sign in'));
    await pumpUntilFound(tester, find.text('Invalid credentials'));

    // Verbatim, and generic: the screen must not hint at *which* field was wrong.
    expect(visibleText(tester), contains('Invalid credentials'));
  });

  testWidgets('empty fields are caught before any request is sent', (tester) async {
    final api = FakeApi()..get('/health', {'status': 'ok'});
    await pumpPage(tester, const LoginPage(), api: api);

    await tester.tap(find.text('Sign in'));
    await pumpFrames(tester);

    expect(visibleText(tester), contains('Enter your email address.'));
    expect(visibleText(tester), contains('Enter your password.'));
    // The client mirrors the server's required fields, so the only way to see the
    // API's validation error is a real edge case.
    expect(api.requests.where((request) => request.path == '/auth/login'), isEmpty);
  });

  testWidgets('an unreachable API is named as the reason sign-in failed', (tester) async {
    // No response at all, which is what an offline phone or a server that is down
    // looks like — the client has to turn that into a sentence a user can act on.
    final api = FakeApi();
    api.unreachable('POST', '/auth/login');
    await pumpPage(tester, const LoginPage(), api: api);

    await tester.enterText(find.byType(TextField).at(0), 'selam@aau.edu.et');
    await tester.enterText(find.byType(TextField).at(1), 'secret');
    await tester.tap(find.text('Sign in'));

    await pumpUntilFound(
      tester,
      find.textContaining('Could not reach the server'),
    );
    // The reason, not just "sign-in failed": the user needs to know the request
    // never arrived, so retrying is the thing to do rather than re-typing.
    expect(visibleText(tester), contains('Check your connection and try again.'));
  });
}
