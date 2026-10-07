import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/audit.dart';
import 'core_providers.dart';
import 'notifications_provider.dart';

/// Audits: the history list, one session's read-back, the in-progress walkthrough,
/// and the three actions (create, scan, complete).
///
/// The walkthrough is the interesting piece. The server stores scan rows but
/// exposes **no scan listing**, so "what have I scanned so far" has no server-side
/// answer — it can only be held here. The web app persists its equivalent to
/// `sessionStorage` so a mid-walkthrough page reload doesn't lose the count. The
/// Flutter equivalent of a page reload is a process kill, and a scan walkthrough
/// that survives navigation but not a force-quit is the honest scope: the scans
/// themselves are already durable on the server, and only this *summary* is local.
/// Saying so out loud is better than a comment claiming `sessionStorage` parity it
/// does not have.

typedef AuditQuery = ({bool mine, int page});

const AuditQuery _initialAuditQuery = (mine: false, page: 1);

class AuditQueryNotifier extends Notifier<AuditQuery> {
  @override
  AuditQuery build() => _initialAuditQuery;

  void setMine(bool mine) => state = (mine: mine, page: 1);

  void setPage(int page) => state = (mine: state.mine, page: page < 1 ? 1 : page);
}

final auditQueryProvider = NotifierProvider<AuditQueryNotifier, AuditQuery>(AuditQueryNotifier.new);

class AuditListNotifier extends AsyncNotifier<AuditListResponse> {
  @override
  Future<AuditListResponse> build() {
    final query = ref.watch(auditQueryProvider);
    return ref.watch(auditsApiProvider).list(mine: query.mine, page: query.page);
  }
}

final auditListProvider = AsyncNotifierProvider<AuditListNotifier, AuditListResponse>(
  AuditListNotifier.new,
);

/// `GET /audits/:id` — the read-back that lets a report survive a shared link or a
/// cold start instead of living only in the navigation that created it (gap G1).
final auditReadbackProvider = FutureProvider.family<AuditSessionReadback, String>((ref, auditId) {
  return ref.watch(auditsApiProvider).byId(auditId);
});

/// The running per-session scan summary, keyed by audit id so two sessions can
/// never contaminate each other's counter.
class AuditWalkthroughNotifier extends Notifier<Map<String, List<ScannedAuditItem>>> {
  @override
  Map<String, List<ScannedAuditItem>> build() => const {};

  void addScan(String auditId, ScannedAuditItem item) {
    final existing = state[auditId] ?? const <ScannedAuditItem>[];
    // A re-scan of the same item replaces its row rather than adding a second one.
    // The server stores every scan and resolves duplicates at completion, so this
    // only affects the *count on screen* — and a counter that climbs to 47 because
    // someone rescanned a shelf twice would be worse than useless.
    final next = [
      for (final row in existing)
        if (row.itemId != item.itemId) row,
      item,
    ];
    state = {...state, auditId: next};
  }

  void finish(String auditId) {
    final next = Map<String, List<ScannedAuditItem>>.from(state)..remove(auditId);
    state = next;
  }
}

final auditWalkthroughProvider =
    NotifierProvider<AuditWalkthroughNotifier, Map<String, List<ScannedAuditItem>>>(
  AuditWalkthroughNotifier.new,
);

/// The scans for one session, as a list. A `Provider.family` rather than a
/// `select` at each call site, so the counter and the running list cannot disagree.
final auditScansProvider = Provider.family<List<ScannedAuditItem>, String>((ref, auditId) {
  return ref.watch(auditWalkthroughProvider)[auditId] ?? const [];
});

/// Audit mutations, in one place so no screen has to remember which providers a
/// completion invalidates.
class AuditActions {
  const AuditActions(this._ref);

  final Ref _ref;

  /// `POST /audits`. Only `DEPARTMENT` scope is ever sent: `scopeType` is free text
  /// server-side, but `POST /audits/:id/complete` 400s for anything else — so
  /// offering a second option would only be offering a dead end (§10.8).
  Future<AuditSession> create({required String department}) async {
    final session = await _ref.read(auditsApiProvider).create(
          scopeType: 'DEPARTMENT',
          scopeValue: department,
        );
    _ref.invalidate(auditListProvider);
    return session;
  }

  /// `POST /audits/:id/scan`. Records the physical scan and folds it into the local
  /// summary. The returned row's `result` is always `FOUND` by design — the final
  /// classification is computed at completion, never supplied by this client.
  Future<AuditScanRow> scan({
    required String auditId,
    required String itemId,
  }) async {
    final row = await _ref.read(auditsApiProvider).scan(auditId, itemId);
    _ref.read(auditWalkthroughProvider.notifier).addScan(
          auditId,
          ScannedAuditItem(
            itemId: row.itemId,
            tagId: row.item.tagId,
            name: row.item.name,
            room: row.item.room,
            scannedAt: row.scannedAt ?? DateTime.now().toUtc().toIso8601String(),
          ),
        );
    return row;
  }

  /// `POST /audits/:id/complete`. Final: the session cannot be restarted, which is
  /// why every caller puts a confirmation in front of it.
  Future<AuditCompletionResponse> complete(String auditId) async {
    final response = await _ref.read(auditsApiProvider).complete(auditId);
    _ref.read(auditWalkthroughProvider.notifier).finish(auditId);
    _ref.invalidate(auditListProvider);
    _ref.invalidate(auditReadbackProvider(auditId));
    return response;
  }
}

final auditActionsProvider = Provider<AuditActions>(AuditActions.new);

/// Convenience so the dashboard can show "audits run" without paging through the
/// list itself.
final auditTotalsProvider = FutureProvider<int>((ref) async {
  final response = await ref.watch(auditsApiProvider).list();
  return response.total;
});

/// Declared here to keep the notification badge honest after a completion: a
/// completed audit files no notification today, but the invalidation is cheap and
/// the omission would be invisible until it wasn't.
void invalidateAuditBadges(Ref ref) => ref.invalidate(unreadCountProvider);
