import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/data/providers/dashboard_provider.dart';
import 'package:cncs_pms_mobile/data/providers/items_provider.dart';
import 'package:cncs_pms_mobile/models/enums.dart';
import 'package:cncs_pms_mobile/models/user.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';

/// The dashboard asks three endpoints, and not every role may call all three.
/// `GET /audits` is gated by `AUDIT_VIEW`; a Staff account does not hold it, so the
/// unconditional call that shipped was a 403 that the screen rendered as an
/// "Insufficient permissions" banner above an otherwise working dashboard. Found
/// on a physical phone during P7-6, which is the point of running the app on one.
void main() {
  AuthUser userFor(Role role) => AuthUser(
    id: 'user-1',
    fullName: 'Selam Bekele',
    email: 'selam@aau.edu.et',
    role: role,
    createdAt: '2026-09-01T08:00:00.000Z',
  );

  Future<DashboardStats> statsFor(FakeApi api, Role role) async {
    final container = ProviderContainer(
      overrides: [
        ...api.overridesWithToken('stored-token'),
        currentUserProvider.overrideWithValue(userFor(role)),
      ],
    );
    addTearDown(container.dispose);
    return container.read(dashboardStatsProvider.future);
  }

  test('a Staff dashboard never asks for audits', () async {
    final api = FakeApi()
      ..get('/requests/pending-count', {'pendingCount': 1})
      ..get('/items', itemsListJson(total: 12));

    final stats = await statsFor(api, Role.staff);

    expect(stats.pendingReview, 1);
    expect(stats.itemsTracked, 12);
    // Null is the screen's signal to render no "Audits run" card: no right, no
    // number, no request.
    expect(stats.auditsRun, isNull);
    expect(api.requests.map((row) => '${row.method} ${row.path}'), isNot(contains('GET /audits')));
  });

  test('an Auditor dashboard reads the session count', () async {
    final api = FakeApi()
      ..get('/requests/pending-count', {'pendingCount': 0})
      ..get('/items', itemsListJson(total: 12))
      ..get('/audits', {'audits': const [], 'total': 4, 'limit': 20, 'offset': 0});

    final stats = await statsFor(api, Role.auditor);

    expect(stats.auditsRun, 4);
    expect(api.requests.map((row) => '${row.method} ${row.path}'), contains('GET /audits'));
  });

  test('the dashboard lists read the item list, never the lean array endpoints', () async {
    // `/items/recent` and `/items/held-by-me` answer with a JSON *array* of lean
    // rows. `ItemsListResponse.fromJson` takes a map, so asking either and casting
    // it produced "type 'List<dynamic>' is not a subtype of type
    // 'Map<String, dynamic>'" on the dashboard of a physical phone. Both tiles now
    // ask `GET /items`, whose answer is the same shape as the register's.
    final api = FakeApi()..get('/items', itemsListJson(total: 12));
    final container = ProviderContainer(
      overrides: [
        ...api.overridesWithToken('stored-token'),
        currentUserProvider.overrideWithValue(userFor(Role.staff)),
      ],
    );
    addTearDown(container.dispose);

    final holdings = await container.read(myHoldingsProvider.future);
    final recent = await container.read(recentItemsProvider.future);

    expect(holdings.items, isNotEmpty);
    expect(recent.items, isNotEmpty);
    final scopes = api.requests
        .where((row) => row.path == '/items')
        .map((row) => row.queryParameters['scope'])
        .toList();
    expect(scopes, contains('mine'));
    expect(scopes, contains('all'));
    expect(api.requests.map((row) => row.path), isNot(contains('/items/recent')));
    expect(api.requests.map((row) => row.path), isNot(contains('/items/held-by-me')));
  });
}
