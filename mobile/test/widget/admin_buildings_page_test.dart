import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/features/admin/admin_buildings_page.dart';
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
  createdAt: '2026-10-22T08:00:00.000Z',
);

/// `GET /buildings` answers a page of rows with the item count the delete rule
/// keys off.
Map<String, Object?> _buildings() => {
  'data': [
    {
      'id': 'building-cncs',
      'name': 'CNCS Building',
      'code': 'CNCS',
      'address': 'North campus',
      'itemCount': 77,
    },
    {
      'id': 'building-phys',
      'name': 'Physics Building',
      'code': 'PHYS',
      'address': null,
      'itemCount': 0,
    },
  ],
};

/// The buildings screen: two jobs, two tabs, and a list you can search.
///
/// It used to be one long page — the add form first, the list the administrator
/// came for below it — so on a phone the row you wanted was a scroll away from
/// the heading. The tabs are the Accounts screen's pattern, and the search is
/// local because these are tens of rows, not pages of them.
void main() {
  testWidgets('the add form is its own tab, not a screenful above the list', (
    tester,
  ) async {
    final api = FakeApi()..get('/buildings', _buildings());

    await pumpPage(
      tester,
      const AdminBuildingsPage(),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('CNCS Building'));

    // The list is what opens, and the form's fields are not on it.
    expect(find.text('Description (optional)'), findsNothing);

    await tester.tap(find.text('Add a building').last);
    await pumpUntilFound(tester, find.text('Description (optional)'));
    expect(find.text('CNCS Building'), findsNothing);

    await tester.tap(find.text('Buildings').last);
    await pumpUntilFound(tester, find.text('CNCS Building'));
  });

  testWidgets('the search narrows the list, and says so when nothing matches', (
    tester,
  ) async {
    final api = FakeApi()..get('/buildings', _buildings());

    await pumpPage(
      tester,
      const AdminBuildingsPage(),
      api: api,
      extraOverrides: [currentUserProvider.overrideWithValue(_admin)],
    );
    await pumpUntilFound(tester, find.text('CNCS Building'));
    expect(find.text('Physics Building'), findsOneWidget);

    // Name, code and address all match — "north" is only in CNCS's address.
    await tester.enterText(find.byType(TextField), 'north');
    await pumpFrames(tester, frames: 10);
    expect(find.text('CNCS Building'), findsOneWidget);
    expect(find.text('Physics Building'), findsNothing);
    expect(visibleText(tester), contains('1 of 2 buildings'));

    await tester.enterText(find.byType(TextField), 'zzz');
    await pumpFrames(tester, frames: 10);
    expect(visibleText(tester), contains('No building matches'));

    await tester.tap(find.text('Clear the search'));
    await pumpFrames(tester, frames: 10);
    expect(find.text('CNCS Building'), findsOneWidget);
    expect(find.text('Physics Building'), findsOneWidget);
  });
}
