import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/audit.dart';
import '../../models/item.dart';
import '../../models/permissions.dart';
import 'auth_provider.dart';
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
  ///
  /// `null` when the signed-in role cannot read audit history. The endpoint is
  /// gated by `AUDIT_VIEW`, so asking anyway is a 403 — and a 403 shown as the
  /// dashboard's only content is a red banner over a screen that is otherwise
  /// perfectly usable. A Staff account found that on a real device: three
  /// requests, one refusal, and an "Insufficient permissions" strip above the
  /// shortcuts.
  final int? auditsRun;
}

final dashboardStatsProvider = FutureProvider<DashboardStats>((ref) async {
  final requestsApi = ref.watch(requestsApiProvider);
  final itemsApi = ref.watch(itemsApiProvider);
  final role = ref.watch(currentUserProvider)?.role;
  final seeAudits = canViewAudits(role);
  final auditsApi = seeAudits ? ref.watch(auditsApiProvider) : null;

  // Started together, awaited once. Rebuilding this provider on a dependency change
  // cancels nothing, so the requests and items counts always describe the same
  // instant's worth of data.
  final results = await Future.wait<Object?>([
    requestsApi.pendingCount(),
    itemsApi.list(limit: 1),
    if (auditsApi != null) auditsApi.list(),
  ]);

  return DashboardStats(
    pendingReview: results[0] as int,
    itemsTracked: (results[1] as ItemsListResponse).pagination.total,
    auditsRun: seeAudits ? (results[2] as AuditListResponse).total : null,
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
