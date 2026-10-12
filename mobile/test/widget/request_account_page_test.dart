import 'package:cncs_pms_mobile/features/auth/request_account_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

void main() {
  testWidgets('submits to account-requests and shows the confirmation', (tester) async {
    final api = FakeApi()
      ..post('/auth/account-requests', {
        'message': 'Request submitted for approval',
        'request': {
          'id': 'req-1',
          'fullName': 'New Person',
          'email': 'new.person@aau.edu.et',
          'accountStatus': 'PENDING_APPROVAL',
          'requestedAt': '2026-10-12T10:00:00.000Z',
        },
      }, status: 201);

    await pumpPage(tester, const RequestAccountPage(), api: api);

    expect(visibleText(tester), contains('Request an account'));

    await tester.enterText(find.byType(TextField).at(0), 'New Person');
    await tester.enterText(find.byType(TextField).at(1), 'new.person@aau.edu.et');
    await tester.enterText(find.byType(TextField).at(2), 'SecurePass1');
    await tester.tap(find.text('Submit request'));
    await pumpUntilFound(tester, find.text('Request submitted'));

    final posts = api.requests.where((request) => request.path == '/auth/account-requests');
    expect(posts, hasLength(1));
    expect(posts.first.data, {
      'fullName': 'New Person',
      'email': 'new.person@aau.edu.et',
      'password': 'SecurePass1',
    });
    expect(visibleText(tester), contains('new.person@aau.edu.et'));
    expect(find.text('Submit request'), findsNothing);
  });
}
