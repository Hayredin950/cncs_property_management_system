import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/audit.dart';
import '../../models/item.dart';
import 'core_providers.dart';

/// The dashboard's three numbers and its preview list (§10.4).
///
/// "Quick orientation, not a data dump" — so this is three counts, not a report.
/// The counts come from three separate endpoints because that is what the API
/// offers; each request is the cheapest one that answers its own question, and the
/// whole thing is fired in parallel because three sequential round trips on a
/// campus Wi-Fi connection is a visibly slow screen for three integers.

class DashboardStats {
  const DashboardStats({
    required this.pendingReview,
    required this.itemsTracked,
    required this.auditsRun,
  });

  /// `GET /requests/pending-count` — the admin queue depth.
  final int pendingReview;

  /// `GET /items`'s `total`. Deliberately the register's own total, which excludes
  /// disposed items because the endpoint does; "items tracked" is the live register,
  /// not every row that ever existed.
  final int itemsTracked;

  /// `GET /audits`'s `total` — sessions run, completed or not.
  final int auditsRun;
}

final dashboardStatsProvider = FutureProvider<DashboardStats>((ref) async {
  final requestsApi = ref.watch(requestsApiProvider);
  final itemsApi = ref.watch(itemsApiProvider);
  final auditsApi = ref.watch(auditsApiProvider);

  // Started together, awaited once. Rebuilding this provider on a dependency change
  // cancels nothing, so the three always describe the same instant's worth of data.
  final results = await Future.wait<Object>([
    requestsApi.pendingCount(),
    itemsApi.list(limit: 1),
    auditsApi.list(),
  ]);

  return DashboardStats(
    pendingReview: results[0] as int,
    itemsTracked: (results[1] as ItemsListResponse).pagination.total,
    auditsRun: (results[2] as AuditListResponse).total,
  );
});

/// The dashboard's preview list: for an admin, what needs review; for a staff
/// member, their own most recent requests. The **server** makes that distinction
/// (`GET /requests` already scopes by role), so this asks one endpoint and renders
/// whatever came back, rather than branching on the role client-side and risking a
/// disagreement with what the API would have returned.
final dashboardPreviewProvider = FutureProvider((ref) {
  return ref.watch(requestsApiProvider).list(limit: 5);
});
