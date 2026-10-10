import 'enums.dart';
import 'json.dart';

/// `frontend/src/types/notification.ts`.
///
/// The server stores `"[CODE] text"` and splits it before responding, so `code`
/// is directly usable and the prefix never leaks. An unknown or absent code still
/// renders its `message`: the design system's code→icon map is a lookup, never an
/// exhaustive switch.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.code,
    required this.message,
    required this.relatedRequestId,
    required this.isRead,
    required this.createdAt,
    required this.rawCode,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final rawCode = asStringOrNull(json['code']);
    final code = NotificationCode.fromJson(rawCode);
    return AppNotification(
      id: asString(json['id']),
      code: code,
      message: asString(json['message']),
      relatedRequestId: asStringOrNull(json['relatedRequestId']),
      isRead: asBool(json['isRead']),
      createdAt: asString(json['createdAt']),
      rawCode: code == NotificationCode.unknown ? rawCode : null,
    );
  }

  final String id;
  final NotificationCode code;
  final String message;
  final String? relatedRequestId;
  final bool isRead;
  final String createdAt;

  /// Non-null only when the server sent a code this build doesn't know.
  final String? rawCode;
}

/// `GET /notifications` envelope — a bare `unreadCount`, not a `pagination` object.
class NotificationsListResponse {
  const NotificationsListResponse({
    required this.notifications,
    required this.unreadCount,
    required this.limit,
    required this.offset,
  });

  factory NotificationsListResponse.fromJson(Map<String, dynamic> json) =>
      NotificationsListResponse(
        notifications: [
          for (final row in asMapList(json['notifications'])) AppNotification.fromJson(row),
        ],
        unreadCount: asInt(json['unreadCount']),
        limit: asInt(json['limit'], fallback: 50),
        offset: asInt(json['offset']),
      );

  final List<AppNotification> notifications;
  final int unreadCount;
  final int limit;
  final int offset;
}
