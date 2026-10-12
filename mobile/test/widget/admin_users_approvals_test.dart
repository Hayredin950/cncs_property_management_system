import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/features/admin/admin_users_page.dart';
import 'package:cncs_pms_mobile/models/enums.dart';
import 'package:cncs_pms_mobile/models/user.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';
import '../support/pump.dart';

const _admin = AuthUser(
  id: 'admin-1',
  fullName: 'Abebe Admin',
  email: 'admin@cncs.aau.edu.et',
  role: Role.systemAdmin,
  createdAt: '2026-09-01T08:00:00.000Z',
);

Map<String, Object?> _accountJson({
  required String id,
  required String fullName,
  required String email,
  String role = 'STAFF',
  String accountStatus = 'ACTIVE',
  int itemCount = 0,
}) =>
    {
      ...userJson(id: id, fullName: fullName, email: email, role: role),
      'itemCount': itemCount,
      'accountStatus': accountStatus,
      'reviewedAt': null,
      'reviewNote': null,
    };

void main() {
  testWidgets('renders the pending queue and hides self-review actions', (tester) async {
    final api = FakeApi()
      ..get('/users', [
        _accountJson(
          id: 'admin-1',
          fullName: 'Abebe Admin',
          email: 'admin@cncs.aau.edu.et',
          role: 'SYSTEM_ADMIN',
        ),
      ])
      ..get('/users/approvals', [
        _accountJson(
          id: 'pending-1',
          fullName: 'Pending Person',
          email: 'pending@cncs.aau.edu.et',
          accountStatus: 'PENDING_APPROVAL',
        ),
        _accountJson(
          id: 'admin-1',
          fullName: 'Abebe Admin',
          email: 'admin@cncs.aau.edu.et',
          role: 'SYSTEM_ADMIN',
          accountStatus: 'PENDING_APPROVAL',
        ),
      ]);

    await pumpPage(
      tester,
      const AdminUsersPage(),
      api: api,
      extraOverrides: [
        currentUserProvider.overrideWithValue(_admin),
      ],
    );
    await pumpUntilFound(tester, find.text('Pending Person'));

    expect(visibleText(tester), contains('Waiting for approval'));
    expect(visibleText(tester), contains('pending@cncs.aau.edu.et'));
    expect(find.text('Approve'), findsOneWidget);
    expect(find.text('Reject'), findsOneWidget);
    expect(visibleText(tester), contains('You cannot approve your own account'));
  });

  testWidgets('approve sends the chosen role in the body', (tester) async {
    final api = FakeApi()
      ..get('/users', <Object>[])
      ..get('/users/approvals', [
        _accountJson(
          id: 'pending-1',
          fullName: 'Pending Person',
          email: 'pending@cncs.aau.edu.et',
          accountStatus: 'PENDING_APPROVAL',
        ),
      ])
      ..post('/users/pending-1/approve', {
        ..._accountJson(
          id: 'pending-1',
          fullName: 'Pending Person',
          email: 'pending@cncs.aau.edu.et',
          role: 'AUDITOR',
        ),
        'accountStatus': 'ACTIVE',
        'reviewedAt': '2026-10-12T12:00:00.000Z',
      });

    await pumpPage(
      tester,
      const AdminUsersPage(),
      api: api,
      extraOverrides: [
        currentUserProvider.overrideWithValue(_admin),
      ],
    );
    await pumpUntilFound(tester, find.text('Pending Person'));

    await tester.tap(find.text('Approve'));
    // The role sheet animates up from the bottom (250 ms); the default 5-frame
    // pump leaves 'Auditor' still off-screen and un-tappable.
    await pumpFrames(tester, frames: 20);
    // Role sheet — pick Auditor (default check is on Staff).
    await tester.tap(find.text('Auditor'));
    await pumpFrames(tester, frames: 20);
    await tester.tap(find.text('Approve as Auditor'));
    await pumpUntilFound(tester, find.textContaining('can now sign in'));

    final approve = api.requests.where((request) => request.path == '/users/pending-1/approve');
    expect(approve, hasLength(1));
    expect(approve.first.data, {'role': 'AUDITOR'});
  });
}
