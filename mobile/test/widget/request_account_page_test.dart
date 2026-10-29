import 'package:cncs_pms_mobile/features/auth/request_account_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

/// Picks `label` out of a select's sheet. The field shows its hint until it has a
/// value, which is what is tapped to open the sheet — the label above it is a
/// sibling `Text` and carries no gesture.
Future<void> _pickFromSheet(WidgetTester tester, String placeholder, String label) async {
  final target = find.text(placeholder).first;
  await tester.ensureVisible(target);
  await pumpFrames(tester, frames: 10);
  await tester.tap(target);
  await pumpFrames(tester, frames: 20);
  await tester.tap(find.text(label).last);
  await pumpFrames(tester, frames: 20);
}

void main() {
  testWidgets('submits to account-requests with a department id and shows the confirmation',
      (tester) async {
    final api = FakeApi()
      ..get('/departments', const [
        {'id': 'dept-bio', 'name': 'Biology', 'code': 'BIO'},
        {'id': 'dept-cs', 'name': 'Computer Science', 'code': 'CS'},
      ])
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
    await pumpUntilFound(tester, find.text('Select your department'));

    await tester.enterText(find.byType(TextField).at(0), 'New Person');
    await tester.enterText(find.byType(TextField).at(1), 'new.person@aau.edu.et');
    await _pickFromSheet(tester, 'Select your department', 'Computer Science');
    await tester.enterText(find.byType(TextField).at(2), 'SecurePass1');

    await tester.ensureVisible(find.text('Submit request'));
    await tester.tap(find.text('Submit request'));
    await pumpUntilFound(tester, find.text('Request submitted'));

    final posts = api.requests.where((request) => request.path == '/auth/account-requests');
    expect(posts, hasLength(1));
    // The server resolves `departmentId` as an OrgUnit id. Sending the id under
    // `department` is read as a unit *name* and refused with "Unknown department",
    // which is the live bug this test now pins shut.
    expect(posts.first.data, {
      'fullName': 'New Person',
      'email': 'new.person@aau.edu.et',
      'password': 'SecurePass1',
      'departmentId': 'dept-cs',
    });
    expect((posts.first.data as Map<String, dynamic>).containsKey('department'), isFalse);
    expect(visibleText(tester), contains('new.person@aau.edu.et'));
    expect(find.text('Submit request'), findsNothing);
  });

  testWidgets('refuses to submit before a department is chosen', (tester) async {
    final api = FakeApi()
      ..get('/departments', const [
        {'id': 'dept-cs', 'name': 'Computer Science', 'code': 'CS'},
      ]);

    await pumpPage(tester, const RequestAccountPage(), api: api);
    await pumpUntilFound(tester, find.text('Select your department'));

    await tester.enterText(find.byType(TextField).at(0), 'New Person');
    await tester.enterText(find.byType(TextField).at(1), 'new.person@aau.edu.et');
    await tester.enterText(find.byType(TextField).at(2), 'SecurePass1');

    await tester.ensureVisible(find.text('Submit request'));
    await tester.tap(find.text('Submit request'));
    await pumpFrames(tester, frames: 10);

    expect(find.text('Choose your department.'), findsOneWidget);
    expect(
      api.requests.where((request) => request.path == '/auth/account-requests'),
      isEmpty,
    );
  });
}
