import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/department.dart';
import '../../models/system.dart';
import 'core_providers.dart';
import 'taxonomy_provider.dart';

/// The SYSTEM_ADMIN's three read endpoints, and the one write the Departments
/// screen makes.
///
/// All of them answer `SYSTEM_CONFIG`, so only the account role asks: the
/// screens that watch these are behind the same capability, and the server
/// re-checks it either way.

/// `GET /system/status` — environment, version, uptime, last deploy.
final systemStatusProvider = FutureProvider<SystemStatusInfo>(
  (ref) => ref.watch(systemApiProvider).status(),
);

/// `GET /system/statistics` — the counts behind the graphs.
///
/// Cached for the life of the dashboard visit: the numbers move slowly, and
/// re-fetching eight aggregates on every tab switch would make a chart flicker
/// for no information.
final systemStatisticsProvider = FutureProvider<SystemStatistics>(
  (ref) => ref.watch(systemApiProvider).statistics(),
);

/// `GET /system/events?limit=5` — the dashboard's activity strip.
final recentSystemEventsProvider = FutureProvider<SystemEventsSlice>(
  (ref) => ref.watch(systemApiProvider).events(limit: 5),
);

/// One page of the account log, with the filters the events screen offers.
///
/// A record key, so `ref.watch` re-runs exactly when a filter or a page actually
/// changes — the same reason the register's filter set is a record.
class SystemEventQuery {
  const SystemEventQuery({
    this.limit = 20,
    this.offset = 0,
    this.action = '',
    this.search = '',
  });

  final int limit;
  final int offset;
  final String action;
  final String search;

  @override
  bool operator ==(Object other) =>
      other is SystemEventQuery &&
      other.limit == limit &&
      other.offset == offset &&
      other.action == action &&
      other.search == search;

  @override
  int get hashCode => Object.hash(limit, offset, action, search);
}

final systemEventsProvider = FutureProvider.family<SystemEventsSlice, SystemEventQuery>(
  (ref, query) => ref
      .watch(systemApiProvider)
      .events(
        limit: query.limit,
        offset: query.offset,
        action: query.action.isEmpty ? null : query.action,
        search: query.search.isEmpty ? null : query.search,
      ),
);

/// `GET /departments/admin` — every unit, headless ones included.
final adminDepartmentsProvider = FutureProvider<List<AdminDepartment>>(
  (ref) => ref.watch(departmentsApiProvider).adminList(),
);

/// The two writes the Departments screen makes. Both refresh the list they
/// changed, so the screen never shows a row it has just replaced.
class AdminDepartmentActions {
  const AdminDepartmentActions(this._ref);

  final Ref _ref;

  Future<void> create({
    required String name,
    required String code,
    required bool acceptsSelfReg,
  }) async {
    await _ref
        .read(departmentsApiProvider)
        .create(name: name, code: code, acceptsSelfReg: acceptsSelfReg);
    _ref.invalidate(adminDepartmentsProvider);
  }

  Future<void> activateHead({required String orgUnitId, required String newHeadId}) async {
    await _ref
        .read(departmentsApiProvider)
        .activateHead(orgUnitId: orgUnitId, newHeadId: newHeadId);
    _ref.invalidate(adminDepartmentsProvider);
    // A new head is a user-row change too: the accounts screen shows each
    // unit's head through its own fetch.
    _ref.invalidate(usersProvider);
  }
}

final adminDepartmentActionsProvider = Provider<AdminDepartmentActions>(
  AdminDepartmentActions.new,
);
