import 'package:cncs_pms_mobile/features/auth/accept_invite_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

/// `/accept-invite` — the invited person sets their own password.
///
/// An invitation is the only way a privileged account comes into being, and the
/// **invitee** chooses the password. There was no screen for it at all: the
/// link pointed at the web app, so a person who had been invited to a phone
/// application had to find a computer.
void main() {
  testWidgets('sets the password and signs the person in', (tester) async {
    final api = FakeApi()
      ..post('/auth/accept-invite', {
        'user': {
          'id': 'user-9',
          'fullName': 'Mekdes Haile',
          'email': 'auditor2@cncs.aau.edu.et',
          'role': 'AUDITOR',
          'createdAt': '2026-10-20T10:00:00.000Z',
        },
        // The session token the server issues on acceptance. (The invitation
        // token is the one that was *sent*; this is the one that is *returned*.)
        'token': 'jwt-abc',
      });

    var accepted = false;
    await pumpPage(
      tester,
      AcceptInvitePage(token: 'invite-token-1', onAccepted: () => accepted = true),
      api: api,
    );

    expect(visibleText(tester), contains('Accept your invitation'));

    await tester.enterText(find.byType(TextField).at(0), 'Mekdes Haile');
    await tester.enterText(find.byType(TextField).at(1), 'SecurePass1');
    await tester.enterText(find.byType(TextField).at(2), 'SecurePass1');
    await tester.tap(find.text('Set my password and sign in'));
    await pumpUntilFound(tester, find.text('Set my password and sign in'));

    final posts = api.requests.where((r) => r.path == '/auth/accept-invite');
    expect(posts, hasLength(1));
    expect(posts.first.data['token'], 'invite-token-1');
    expect(posts.first.data['password'], 'SecurePass1');
    expect(posts.first.data['fullName'], 'Mekdes Haile');
    // The screen reports that it accepted; the router does the navigating.
    expect(accepted, isTrue);
  });

  testWidgets('refuses to send a password the person did not repeat', (tester) async {
    final api = FakeApi();

    await pumpPage(
      tester,
      const AcceptInvitePage(token: 'invite-token-1'),
      api: api,
    );

    await tester.enterText(find.byType(TextField).at(0), 'Mekdes Haile');
    await tester.enterText(find.byType(TextField).at(1), 'SecurePass1');
    await tester.enterText(find.byType(TextField).at(2), 'DifferentPass');
    await tester.tap(find.text('Set my password and sign in'));
    await tester.pump();

    // Nothing was sent: the two passwords have to match first.
    expect(api.requests.where((r) => r.path == '/auth/accept-invite'), isEmpty);
    expect(visibleText(tester), contains('do not match'));
  });

  testWidgets('says so plainly when the link carries no token', (tester) async {
    final api = FakeApi();

    await pumpPage(tester, const AcceptInvitePage(), api: api);

    await tester.enterText(find.byType(TextField).at(1), 'SecurePass1');
    await tester.enterText(find.byType(TextField).at(2), 'SecurePass1');
    await tester.tap(find.text('Set my password and sign in'));
    await tester.pump();

    expect(api.requests.where((r) => r.path == '/auth/accept-invite'), isEmpty);
    expect(visibleText(tester), contains('invitation token'));
  });
}
