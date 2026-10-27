import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/features/admin/departments_page.dart';
import 'package:cncs_pms_mobile/models/enums.dart';
import 'package:cncs_pms_mobile/models/user.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/pump.dart';

const _admin = AuthUser(
  id: 'user-admin',
  fullName: 'Admin User',
  email: 'admin@cncs.aau.edu.et',
  role: Role.systemAdmin,
  createdAt: '2026-10-20T08:00:00.000Z',
);

List<Map<String, Object?>> _departments() => [
  {
    'id': 'unit-cs',
    'name': 'Computer Science',
    'code': 'CS',
    'type': 'DEPARTMENT',
    'isActive': true,
    'acceptsSelfReg': true,
    'college': 'CNCS',
    'head': {
      'id': 'user-head',
      'fullName': 'Hanna Tesfaye',
      'email': 'head.cs@cncs.aau.edu.et',
    },
    'staffCount': 12,
  },
  {
    'id': 'unit-bio',
    'name': 'Biology',
    'code': 'BIO',
    'type': 'DEPARTMENT',
    'isActive': true,
    'acceptsSelfReg': false,
    'college': 'CNCS',
    'head': null,
    'staffCount': 6,
  },
];

/// The Departments screen: the list and the form are two tabs.
///
/// The form used to sit above the list on one page, so on a phone the units the
/// administrator came to check were below a screenful of inputs. Buildings has
/// the same split; adding jumps back to the list, where the new row is.
void main() {
  testWidgets('the add form is its own tab, and adding returns to the list', (
    tester,
  ) async {
    final api = FakeApi()
      ..get('/departments/admin', _departments())
      ..post('/departments', {
        'department': {'name': 'Environmental Engineering'},
      });

    await pumpPage(
      tester,
      const DepartmentsPage(),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('Computer Science'));

    // The list is what opens; the form's hint is not on it.
    expect(find.text('Environmental Engineering'), findsNothing);

    await tester.tap(find.text('Add a department'));
    await pumpUntilFound(tester, find.text('Environmental Engineering'));
    expect(find.text('Computer Science'), findsNothing);

    await tester.enterText(
      find.byType(TextField).at(0),
      'Environmental Engineering',
    );
    await tester.enterText(find.byType(TextField).at(1), 'ENVE');
    await tester.tap(find.text('Add a department').last);
    await pumpFrames(tester, frames: 20);

    // The POST left, and the screen went back to the list.
    expect(
      api.requests.any(
        (request) => request.method == 'POST' && request.path == '/departments',
      ),
      isTrue,
    );
    expect(find.text('Computer Science'), findsOneWidget);
    expect(
      visibleText(tester),
      contains('Environmental Engineering has been added'),
    );
  });
}
