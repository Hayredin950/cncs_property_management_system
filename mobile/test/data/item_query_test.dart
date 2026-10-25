import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/data/providers/items_provider.dart';
import 'package:cncs_pms_mobile/data/providers/taxonomy_provider.dart';
import 'package:cncs_pms_mobile/models/enums.dart';
import 'package:cncs_pms_mobile/models/user.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';

/// The register's two narrowing controls are different questions and must not be
/// collapsed into one (the mistake that put a "Department" picker built from the
/// free-text `Item.department` column beside no scope control at all):
///
///   * **scope** is the view — all / mine / my department / other departments;
///   * **orgUnitId** filters one real department (an `OrgUnit` id) *within* it.
///
/// These tests pin both the state transitions and the query the screen actually
/// sends, because the second one is what the server sees.
void main() {
  AuthUser userFor(Role role) => AuthUser(
    id: 'user-1',
    fullName: 'Selam Bekele',
    email: 'selam@aau.edu.et',
    role: role,
    createdAt: '2026-09-01T08:00:00.000Z',
  );

  ProviderContainer listContainer(FakeApi api, {Role role = Role.staff}) {
    final container = ProviderContainer(
      overrides: [
        ...api.overridesWithToken('stored-token'),
        currentUserProvider.overrideWithValue(userFor(role)),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('a department filter survives a switch to "all" and is cleared by "mine"', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(itemQueryProvider.notifier);

    notifier.setOrgUnit('dept-cs');
    expect(container.read(itemQueryProvider).orgUnitId, 'dept-cs');

    notifier.setScope('all');
    expect(container.read(itemQueryProvider).scope, 'all');
    // "All departments" still has a department picker, so the choice stands.
    expect(container.read(itemQueryProvider).orgUnitId, 'dept-cs');

    // "My items" already means one person's holdings; a second department filter
    // would contradict the view, so it is dropped rather than silently narrowing.
    notifier.setScope('mine');
    expect(container.read(itemQueryProvider).scope, 'mine');
    expect(container.read(itemQueryProvider).orgUnitId, isNull);
  });

  test('a Staff register opens on the whole register, not on their own holdings', () async {
    final api = FakeApi()..get('/items', itemsListJson(total: 12));
    final container = listContainer(api);

    await container.read(itemListProvider.future);

    final request = api.requests.singleWhere((row) => row.path == '/items');
    expect(request.queryParameters['scope'], 'all');
    expect(request.queryParameters.containsKey('orgUnitId'), isFalse);
  });

  test('the department filter travels as an org unit id', () async {
    final api = FakeApi()..get('/items', itemsListJson(total: 12));
    final container = listContainer(api);

    container.read(itemQueryProvider.notifier).setOrgUnit('9f1c2d3e-0000-4000-8000-000000000001');
    await container.read(itemListProvider.future);

    final request = api.requests.singleWhere((row) => row.path == '/items');
    expect(request.queryParameters['orgUnitId'], '9f1c2d3e-0000-4000-8000-000000000001');
    // The free-text column is not the taxonomy: the old parameter must not come back.
    expect(request.queryParameters.containsKey('department'), isFalse);
  });

  test('sort is the server vocabulary, and page changes keep it', () async {
    final api = FakeApi()..get('/items', itemsListJson(total: 12));
    final container = listContainer(api);

    final notifier = container.read(itemQueryProvider.notifier);
    notifier.setSort('name');
    notifier.setPage(2);
    await container.read(itemListProvider.future);

    final request = api.requests.singleWhere((row) => row.path == '/items');
    expect(request.queryParameters['sort'], 'name');
    expect(request.queryParameters['page'], 2);
  });

  test('the real departments come from /departments, not from the item rows', () async {
    final api = FakeApi()
      ..get('/departments', const [
        {'id': 'dept-bio', 'name': 'Biology', 'code': 'BIO'},
        {'id': 'dept-cs', 'name': 'Computer Science', 'code': 'CS'},
      ]);
    final container = listContainer(api);

    final departments = await container.read(departmentsProvider.future);

    expect(departments.map((row) => row.name), ['Biology', 'Computer Science']);
    expect(api.requests.map((row) => row.path), contains('/departments'));
    expect(api.requests.map((row) => row.path), isNot(contains('/items')));
  });
}
