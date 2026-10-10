import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/format.dart';
import '../../data/providers/notifications_provider.dart';
import '../../models/enums.dart';
import '../../models/notification.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/notifications` (§10.10).
///
/// Three behaviours come straight from the spec and each is a small correctness
/// claim:
///
///   * **Unread first, as a client-side grouping.** The API sorts by `createdAt
///     desc`, so unread-first is a stable partition on top of that — which keeps the
///     newest-first order *within* each group rather than re-sorting and losing it.
///   * **Marking read is optimistic.** The unread dot clears under the finger, then
///     the server's answer corrects it. A failed mark-read is not worth an error
///     banner: it is idempotent and the next load shows the truth.
///   * **Empty is "You're all caught up", not "No notifications".** The two read very
///     differently to someone who just came back to check — one is reassurance, the
///     other sounds like a missing feature.
///
/// The unknown-code case is real, not hypothetical: any row not written by the
/// request workflow has a `null` code, and the design system's code→icon map is a
/// lookup rather than an exhaustive switch, so such a row still renders its message.
class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(notificationsProvider);

    return PageScaffold(
      title: 'Notifications',
      maxWidth: 720,
      trailing: inbox.maybeWhen(
        data: (response) => response.unreadCount == 0
            ? null
            : AppButton(
                label: 'Mark all read',
                variant: AppButtonVariant.outline,
                size: AppButtonSize.sm,
                onPressed: () async {
                  try {
                    final updated = await ref.read(notificationsProvider.notifier).markAllRead();
                    if (context.mounted) {
                      showAppToast(
                        context,
                        message: updated == 0
                            ? 'Nothing was unread.'
                            : '$updated marked as read.',
                        tone: ToastTone.success,
                      );
                    }
                  } catch (error) {
                    if (context.mounted) {
                      showAppToast(
                        context,
                        message: describeError(error),
                        tone: ToastTone.error,
                      );
                    }
                  }
                },
              ),
        orElse: () => null,
      ),
      onRefresh: () async {
        ref.invalidate(notificationsProvider);
        ref.invalidate(unreadCountProvider);
        await ref.read(notificationsProvider.future);
      },
      children: [
        inbox.when(
          loading: () => const SkeletonList(count: 5, height: 78),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(notificationsProvider),
          ),
          data: (response) {
            if (response.notifications.isEmpty) {
              return const EmptyState(
                icon: Icons.notifications_none_outlined,
                title: 'You\u2019re all caught up',
                body: 'New activity on your requests will show up here.',
              );
            }

            final ordered = _unreadFirst(response.notifications);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(
                  title: response.unreadCount == 0
                      ? 'Everything read'
                      : '${response.unreadCount} unread',
                  subtitle: 'Unread first, then newest.',
                ),
                for (final notification in ordered) ...[
                  _NotificationRow(notification: notification),
                  const SizedBox(height: AppSpace.s2),
                ],
                const SizedBox(height: AppSpace.s4),
                AppButton(
                  label: 'Clear the inbox',
                  variant: AppButtonVariant.ghost,
                  icon: Icons.delete_sweep_outlined,
                  expand: true,
                  onPressed: () async {
                    final confirmed = await showConfirmDialog(
                      context,
                      title: 'Clear every notification?',
                      body: 'All ${response.notifications.length} notifications are removed '
                          'from your inbox. Requests and items are not affected.',
                      confirmLabel: 'Clear',
                      destructive: true,
                      icon: Icons.delete_sweep_outlined,
                    );
                    if (!confirmed) return;
                    try {
                      final deleted =
                          await ref.read(notificationsProvider.notifier).clearAll();
                      if (context.mounted) {
                        showAppToast(
                          context,
                          message: '$deleted cleared.',
                          tone: ToastTone.info,
                        );
                      }
                    } catch (error) {
                      if (context.mounted) {
                        showAppToast(
                          context,
                          message: describeError(error),
                          tone: ToastTone.error,
                        );
                      }
                    }
                  },
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  /// A stable partition: unread rows keep their relative order, and so do read rows.
  static List<AppNotification> _unreadFirst(List<AppNotification> notifications) => [
        ...notifications.where((row) => !row.isRead),
        ...notifications.where((row) => row.isRead),
      ];
}

class _NotificationRow extends ConsumerWidget {
  const _NotificationRow({required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (icon, color, background) = _appearance(notification.code);
    final hasTarget = notification.relatedRequestId != null;

    return Material(
      color: notification.isRead ? Colors.white : AppColors.brand50,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadius.mdAll,
        side: BorderSide(
          color: notification.isRead ? AppColors.aauGray200 : AppColors.brand200,
        ),
      ),
      child: InkWell(
        borderRadius: AppRadius.mdAll,
        onTap: () async {
          // Read is marked on *open*, not on arrival — the badge exists to say
          // "something needs your attention", and clearing it by rendering the list
          // would make the top-bar count drop to zero the moment anyone looked.
          if (!notification.isRead) {
            await ref.read(notificationsProvider.notifier).markRead(notification.id);
          }
          if (!context.mounted) return;
          if (hasTarget) context.push('/requests/${notification.relatedRequestId}');
        },
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(color: background, shape: BoxShape.circle),
                child: Icon(icon, size: 18, color: color),
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      notification.message,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.45,
                        fontWeight: notification.isRead ? FontWeight.w400 : FontWeight.w500,
                        color: AppColors.aauGray800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Text(
                          formatRelativeTime(notification.createdAt),
                          style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray500),
                        ),
                        if (!notification.isRead) ...[
                          const SizedBox(width: AppSpace.s2),
                          Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                              color: AppColors.brand600,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                        const Spacer(),
                        if (hasTarget)
                          const Text(
                            'View request',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.brand700,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Dismiss',
                icon: const Icon(Icons.close, size: 17),
                color: AppColors.aauGray400,
                onPressed: () async {
                  try {
                    await ref.read(notificationsProvider.notifier).dismiss(notification.id);
                  } catch (error) {
                    if (context.mounted) {
                      showAppToast(
                        context,
                        message: describeError(error),
                        tone: ToastTone.error,
                      );
                    }
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// §3.2's notification-code map. A `null`/unknown code is a **real, valid state**,
  /// not a bug — any row not written by the request workflow parses that way — so it
  /// gets the neutral bell and renders as plain text with no click target.
  static (IconData, Color, Color) _appearance(NotificationCode code) => switch (code) {
        NotificationCode.requestSubmitted => (
            Icons.schedule_outlined,
            AppColors.info600,
            AppColors.info50,
          ),
        NotificationCode.requestApproved => (
            Icons.check_circle_outline,
            AppColors.success600,
            AppColors.success50,
          ),
        NotificationCode.requestRejected => (
            Icons.cancel_outlined,
            AppColors.danger600,
            AppColors.danger50,
          ),
        NotificationCode.unknown => (
            Icons.notifications_none_outlined,
            AppColors.aauGray500,
            AppColors.aauGray100,
          ),
      };
}
