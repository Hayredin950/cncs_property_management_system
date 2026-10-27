import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/features/admin/admin_users_page.dart';
import 'package:cncs_pms_mobile/models/enums.dart';
import 'package:cncs_pms_mobile/models/user.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

const _admin = AuthUser(
  id: 'admin-1',
  fullName: 'Abebe Admin',
  email: 'admin@cncs.aau.edu.et',
  role: Role.systemAdmin,
  createdAt: '2026-09-01T08:00:00.000Z',
);

/// `GET /departments/invitable` — Physics is the empty one, which is the case a
/// head is appointed into; Chemistry already has a working head, which is the case
/// the server refuses.
List<Map<String, Object?>> _units() => [
      {'id': 'unit-chem', 'name': 'Chemistry', 'code': 'CHEM', 'hasActiveHead': true},
      {'id': 'unit-phys', 'name': 'Physics', 'code': 'PHYS', 'hasActiveHead': false},
    ];

Map<String, Object?> _inviteJson({required String email, String role = 'DEPARTMENT_HEAD'}) => {
      'invite': {
        'userId': 'invitee-1',
        'email': email,
        'role': role,
        'unitId': 'unit-phys',
        'status': 'PENDING_EMAIL_VERIFICATION',
        'expiresAt': '2026-10-17T08:00:00.000Z',
        'renewed': false,
      },
      'inviteUrl': 'http://localhost:5173/accept-invite?token=abc123',
      'email': 'skipped',
    };

/// The invite form's fields, in the order the card lays them out. `AppTextField`
/// renders its label as a sibling `Text` above the `TextField`, so a label is not a
/// findable ancestor of the input — the index is the honest way to address them, and
/// the card is the only thing on this screen with text inputs.
Finder _field(int index) => find.byType(TextField).at(index);

const _emailField = 0;
const _authorizedByField = 1;
const _authorizationRefField = 2;

/// Fills the form up to (but not including) the department, so each test can decide
/// whether that one is part of its case.
Future<void> _fillAuthorization(WidgetTester tester, {required String email}) async {
  await tester.enterText(_field(_emailField), email);
  await tester.enterText(_field(_authorizedByField), 'College Office');
  await tester.enterText(_field(_authorizationRefField), 'CNCS/HR/2026/117');
}

/// Picks `label` out of a select's sheet. The field shows `Select…` until it has a
/// value, which is what is tapped to open the sheet — the label above it is a
/// sibling `Text` and carries no gesture.
Future<void> _pickFromSheet(WidgetTester tester, String placeholder, String label) async {
  // Both the department picker and the invite button sit below the fold on a test
  // viewport, and a tap that misses its target is a warning, not a failure — so the
  // field is scrolled into view before it is tapped.
  final target = find.text(placeholder).first;
  await tester.ensureVisible(target);
  await pumpFrames(tester, frames: 10);
  await tester.tap(target);
  await pumpFrames(tester, frames: 20);
  await tester.tap(find.text(label).last);
  await pumpFrames(tester, frames: 20);
}

/// The accounts screen's invite form (T6), which replaced the legacy
/// `POST /auth/register` flow where an administrator typed a password.
///
/// Two properties are asserted **on the wire**, because both are about the request
/// that leaves the device rather than what the screen looks like: the payload carries
/// no password, and it carries the two fields that record who authorized the
/// appointment outside the system (D3).
void main() {
  testWidgets('invites with the authorization recorded and no password at all', (tester) async {
    final api = FakeApi()
      ..get('/users', <Object>[])
      ..get('/users/approvals', <Object>[])
      ..get('/users/invites', <Object>[])
      ..get('/departments/invitable', _units())
      ..post('/users/invite', _inviteJson(email: 'newhead@cncs.aau.edu.et'), status: 201);

    await pumpPage(
      tester,
      const AdminUsersPage(section: 'invite'),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('Invite an account'));

    // No field an administrator could type a password into, and no legacy panel
    // left beside this one.
    expect(find.text('Initial password'), findsNothing);
    expect(find.text('Create an account'), findsNothing);
    // The two D3 fields are asked for by name.
    expect(find.text('Authorized by'), findsOneWidget);
    expect(find.text('Authorization reference'), findsOneWidget);

    await _fillAuthorization(tester, email: 'newhead@cncs.aau.edu.et');
    await _pickFromSheet(tester, 'Select…', 'Physics');

    await tester.ensureVisible(find.text('Send invite'));
    await tester.tap(find.text('Send invite'));
    await pumpUntilFound(tester, find.textContaining('Invitation ready for'));

    final sent = api.requests.where((request) => request.path == '/users/invite').toList();
    expect(sent, hasLength(1));
    final body = sent.first.data as Map<String, dynamic>;
    expect(body['email'], 'newhead@cncs.aau.edu.et');
    expect(body['role'], 'DEPARTMENT_HEAD');
    expect(body['unitId'], 'unit-phys');
    expect(body['authorizedBy'], 'College Office');
    expect(body['authorizationRef'], 'CNCS/HR/2026/117');
    // The requirement itself: nothing in this payload can be a credential, and no
    // name is asked of an administrator who is inviting someone they may not know.
    expect(body.containsKey('password'), isFalse);
    expect(body.containsKey('fullName'), isFalse);
  });

  testWidgets('hands over the single-use link when nothing was emailed', (tester) async {
    final api = FakeApi()
      ..get('/users', <Object>[])
      ..get('/users/approvals', <Object>[])
      ..get('/users/invites', <Object>[])
      ..get('/departments/invitable', _units())
      ..post('/users/invite', _inviteJson(email: 'newhead@cncs.aau.edu.et'), status: 201);

    await pumpPage(
      tester,
      const AdminUsersPage(section: 'invite'),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('Invite an account'));

    await _fillAuthorization(tester, email: 'newhead@cncs.aau.edu.et');
    await _pickFromSheet(tester, 'Select…', 'Physics');
    await tester.ensureVisible(find.text('Send invite'));
    await tester.tap(find.text('Send invite'));
    await pumpUntilFound(tester, find.textContaining('No mail transport is configured'));

    // The link is on screen and copyable: with no SMTP transport the administrator
    // is the only deliverer there is. It is a `SelectableText`, so the assertion is
    // on the text finder rather than on `visibleText` (which reads `Text` widgets).
    expect(find.textContaining('/accept-invite?token=abc123'), findsOneWidget);
    expect(find.text('Copy link'), findsOneWidget);
  });

  testWidgets('refuses a head invite with no department before calling the API', (tester) async {
    final api = FakeApi()
      ..get('/users', <Object>[])
      ..get('/users/approvals', <Object>[])
      ..get('/users/invites', <Object>[])
      ..get('/departments/invitable', _units());

    await pumpPage(
      tester,
      const AdminUsersPage(section: 'invite'),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('Invite an account'));

    // Department intentionally left unset.
    await _fillAuthorization(tester, email: 'newhead@cncs.aau.edu.et');
    await tester.ensureVisible(find.text('Send invite'));
    await tester.tap(find.text('Send invite'));
    await pumpFrames(tester, frames: 10);

    expect(visibleText(tester), contains('Choose the department this head is appointed to.'));
    expect(api.requests.where((request) => request.path == '/users/invite'), isEmpty);
  });

  testWidgets('still lets a college-wide role be invited without a department', (tester) async {
    final api = FakeApi()
      ..get('/users', <Object>[])
      ..get('/users/approvals', <Object>[])
      ..get('/users/invites', <Object>[])
      ..get('/departments/invitable', _units())
      ..post('/users/invite', _inviteJson(email: 'auditor@cncs.aau.edu.et', role: 'AUDITOR'),
          status: 201);

    await pumpPage(
      tester,
      const AdminUsersPage(section: 'invite'),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('Invite an account'));

    // Switch the role from the default head to Auditor. The department question
    // disappears with it — an Auditor covers the college, not a unit.
    await _pickFromSheet(tester, 'Department Head', 'Auditor');
    expect(find.text('Department'), findsNothing);

    await _fillAuthorization(tester, email: 'auditor@cncs.aau.edu.et');
    await tester.ensureVisible(find.text('Send invite'));
    await tester.tap(find.text('Send invite'));
    await pumpUntilFound(tester, find.textContaining('Invitation ready for'));

    final body = api.requests
        .firstWhere((request) => request.path == '/users/invite')
        .data as Map<String, dynamic>;
    expect(body['role'], 'AUDITOR');
    // The server ignores a unit for a college-wide role; the client sends none.
    expect(body.containsKey('unitId'), isFalse);
  });

  testWidgets('offers only the four roles that are never self-registered', (tester) async {
    final api = FakeApi()
      ..get('/users', <Object>[])
      ..get('/users/approvals', <Object>[])
      ..get('/users/invites', <Object>[])
      ..get('/departments/invitable', _units());

    await pumpPage(
      tester,
      const AdminUsersPage(section: 'invite'),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('Invite an account'));

    await tester.tap(find.text('Department Head').first);
    await pumpFrames(tester, frames: 20);

    // D2: Staff arrive through the public request form and a head's approval, so
    // Staff is absent from an invite. `ACCOUNT_ADMIN` is not a role any more.
    expect(find.text('Staff'), findsNothing);
    expect(find.text('Account Admin'), findsNothing);
    expect(find.text('Property Officer'), findsOneWidget);
    expect(find.text('Auditor'), findsWidgets);
  });
}
