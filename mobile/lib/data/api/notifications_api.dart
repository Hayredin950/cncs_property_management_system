import '../../core/api/api_client.dart';
import '../../models/json.dart';
import '../../models/notification.dart';

/// `frontend/src/api/notifications.ts`.
///
/// Two server-side facts matter to this client:
///
///   * Every route is scoped by `userId` in the `where` of a `deleteMany`, never
///     by a bare id — so an id that is not the caller's answers `404`, the same
///     response as one that does not exist. The UI therefore never reports
///     "not yours", because the API does not.
///   * `read-all` answers `{ updated }`, the rows that actually flipped. `0` means
///     "nothing was unread", **not** "the call failed", so the UI must not treat
///     it as an error.
class NotificationsApi {
  const NotificationsApi(this._client);

  final ApiClient _client;

  /// `GET /notifications` — the caller's own inbox; `unread: true` filters.
  Future<NotificationsListResponse> list({
    bool unread = false,
    int limit = 50,
    int offset = 0,
  }) async {
    final json = await _client.get<Map<String, dynamic>>(
      '/notifications',
      query: {
        if (unread) 'unread': 'true',
        'limit': limit,
        'offset': offset,
      },
    );
    return NotificationsListResponse.fromJson(json);
  }

  /// `POST /notifications/:id/read`.
  Future<void> markRead(String id) =>
      _client.post<void>('/notifications/${Uri.encodeComponent(id)}/read');

  /// `POST /notifications/read-all` — the whole inbox in one request (there is no
  /// bulk endpoint per-id, and this one is a literal path beside `/:id/read`).
  /// Returns how many rows actually changed.
  Future<int> markAllRead() async {
    final json = await _client.post<Map<String, dynamic>>('/notifications/read-all');
    return asInt(json['updated']);
  }

  /// `DELETE /notifications/:id` — dismiss one message. A hard delete, but it
  /// destroys no register record: the request, edit-log row or audit result it was
  /// copied from is untouched.
  Future<void> dismiss(String id) =>
      _client.delete<void>('/notifications/${Uri.encodeComponent(id)}');

  /// `DELETE /notifications` — empty the inbox; idempotent, reports how many went.
  Future<int> clear() async {
    final json = await _client.delete<Map<String, dynamic>>('/notifications');
    return asInt(json['deleted']);
  }
}
