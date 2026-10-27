import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

/// The More sheet: Profile and Sign out are two rows, for every role.
///
/// They were folded into one "Profile and sign out" row to remove duplication,
/// but that put the one control people look for at the end of the day behind a
/// screen and read as a single combined action. Sign out is now its own row in
/// the sheet (it still asks for confirmation), and Profile stays the account
/// screen — including for the administrator, whose Profile is also a bar tab.
void main() {
  testWidgets('the signed-in More sheet offers Sign out as its own row', (
    tester,
  ) async {
    final api = FakeApi()
      ..get('/auth/me', {
        'user': {
          'id': 'user-1',
          'fullName': 'Selam Bekele',
          'email': 'staff.cs1@cncs.aau.edu.et',
          'role': 'STAFF',
          'createdAt': '2026-01-01T00:00:00.000Z',
          'mustChangePassword': false,
        },
      });

    await pumpApp(tester, api, overrides: api.overridesWithToken('good-token'));
    await pumpUntilFound(tester, find.text('More'));

    await tester.tap(find.text('More').last);
    await pumpUntilFound(tester, find.text('Profile'));

    expect(find.text('Sign out'), findsOneWidget);
    expect(find.text('Profile and sign out'), findsNothing);

    // The sheet is scrollable and the row sits below the fold in the test
    // window; scroll to it the way a thumb would.
    await tester.drag(
      find.byType(SingleChildScrollView).last,
      const Offset(0, -320),
    );
    await pumpFrames(tester, frames: 10);

    // The row is wired to the confirmation, not just a label.
    await tester.tap(find.text('Sign out'));
    await pumpUntilFound(tester, find.text('Sign out?'));
    expect(
      find.text('You will need your email and password to sign back in.'),
      findsOneWidget,
    );
  });
}
