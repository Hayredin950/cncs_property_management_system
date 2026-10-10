import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/notification.dart';
import 'core_providers.dart';

/// The notification inbox (SRS F8.1/F8.2).
///
/// Two providers, for two different consumers:
///
///   * [notificationsProvider] is the inbox itself — the screen's list, plus the
///     mutations that act on one row.
///   * [unreadCountProvider] is the **badge**, and it is separate on purpose. The
///     shell renders that badge on every screen; hanging it off the inbox would
///     mean fetching fifty notification bodies at app start so that the top bar
///     could display one integer. Instead it makes the cheapest request that
///     answers the question (`limit: 1`, read the `unreadCount` the envelope
///     carries) and is invalidated whenever a row is touched.

class NotificationsNotifier extends AsyncNotifier<NotificationsListResponse> {
  @override
  Future<NotificationsListResponse> build() {
    return ref.watch(notificationsApiProvider).list();
  }

  /// `POST /notifications/:id/read`.
  ///
  /// Optimistic, like the web's `NotificationItem`: the row is marked read in the
  /// local state first so the unread dot clears under the finger, then corrected
  /// from the server's answer. A failed mark-read is not worth an error banner —
  /// the next load shows the truth, and the action is idempotent.
  Future<void> markRead(String id) async {
    final current = state.value;
    if (current == null) return;

    if (!current.notifications.any((n) => n.id == id && !n.isRead)) return;

    state = AsyncData(
      NotificationsListResponse(
        notifications: [
          for (final row in current.notifications)
            if (row.id == id)
              AppNotification(
                id: row.id,
                code: row.code,
                message: row.message,
                relatedRequestId: row.relatedRequestId,
                isRead: true,
                createdAt: row.createdAt,
                rawCode: row.rawCode,
              )
            else
              row,
        ],
        unreadCount: current.unreadCount > 0 ? current.unreadCount - 1 : 0,
        limit: current.limit,
        offset: current.offset,
      ),
    );

    try {
      await ref.read(notificationsApiProvider).markRead(id);
    } finally {
      ref.invalidate(unreadCountProvider);
    }
  }

  /// `POST /notifications/read-all` — a real bulk endpoint, unlike the per-id loop
  /// the design system's first draft described (the endpoint was added later).
  Future<int> markAllRead() async {
    final updated = await ref.read(notificationsApiProvider).markAllRead();
    ref.invalidateSelf();
    ref.invalidate(unreadCountProvider);
    return updated;
  }

  /// `DELETE /notifications/:id`.
  Future<void> dismiss(String id) async {
    await ref.read(notificationsApiProvider).dismiss(id);
    ref.invalidateSelf();
    ref.invalidate(unreadCountProvider);
  }

  /// `DELETE /notifications` — clears the whole inbox.
  Future<int> clearAll() async {
    final deleted = await ref.read(notificationsApiProvider).clear();
    ref.invalidateSelf();
    ref.invalidate(unreadCountProvider);
    return deleted;
  }
}

final notificationsProvider =
    AsyncNotifierProvider<NotificationsNotifier, NotificationsListResponse>(
  NotificationsNotifier.new,
);

/// The shell badge. `limit: 1` because the count this needs is on the envelope,
/// not in the rows — asking for fifty bodies to display one number is the whole
/// reason this provider exists separately.
final unreadCountProvider = FutureProvider<int>((ref) async {
  final response = await ref.watch(notificationsApiProvider).list(limit: 1);
  return response.unreadCount;
});
