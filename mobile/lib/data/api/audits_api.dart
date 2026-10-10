import '../../core/api/api_client.dart';
import '../../models/audit.dart';

/// Audits per page. Fixed rather than exposed: the history is scanned by date,
/// not searched, so the page number is the only thing a caller thinks about.
const int kAuditsPageSize = 20;

/// `frontend/src/api/audits.ts`.
class AuditsApi {
  const AuditsApi(this._client);

  final ApiClient _client;

  /// `GET /audits` — the sessions this viewer may see, newest first. The server scopes
  /// it (Staff see their own, Admin sees all); `mine` is an admin's filter applied
  /// *on top of* that scope, so it can never widen anyone's view.
  Future<AuditListResponse> list({bool mine = false, int page = 1}) async {
    final safePage = page < 1 ? 1 : page;
    final json = await _client.get<Map<String, dynamic>>(
      '/audits',
      query: {
        'limit': kAuditsPageSize,
        'offset': (safePage - 1) * kAuditsPageSize,
        if (mine) 'mine': 'true',
      },
    );
    return AuditListResponse.fromJson(json);
  }

  /// `GET /audits/:id` — a session and its stored result rows. A session that is
  /// still open comes back with `completed: false`.
  Future<AuditSessionReadback> byId(String auditId) async {
    final json = await _client.get<Map<String, dynamic>>(
      '/audits/${Uri.encodeComponent(auditId)}',
    );
    return AuditSessionReadback.fromJson(json);
  }

  /// `POST /audits` — starts a session.
  ///
  /// Only `DEPARTMENT` is offered by the UI because completion answers 400 for
  /// anything else, and a department's `scopeValue` is matched against
  /// `Item.department` **exactly and case-sensitively** — which is why the form
  /// uses a locked picker of departments actually present, never free text (G9).
  Future<AuditSession> create({required String scopeType, String? scopeValue}) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/audits',
      body: {'scopeType': scopeType, 'scopeValue': ?scopeValue},
    );
    return AuditSession.fromJson(json);
  }

  /// `POST /audits/:id/scan` — records one physical scan.
  ///
  /// Only the item id is sent; the result is always `FOUND` server-side and the
  /// final classification is computed at completion, so a client can never declare
  /// its own result. `409` when the session is already completed.
  Future<AuditScanRow> scan(String auditId, String itemId) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/audits/${Uri.encodeComponent(auditId)}/scan',
      body: {'itemId': itemId},
    );
    return AuditScanRow.fromJson(json);
  }

  /// `POST /audits/:id/complete` — finalizes the audit and returns the summary.
  ///
  /// Idempotence is **not** promised: completing twice answers 409, so the UI
  /// confirms before calling and never retries on its own.
  Future<AuditCompletionResponse> complete(String auditId) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/audits/${Uri.encodeComponent(auditId)}/complete',
    );
    return AuditCompletionResponse.fromJson(json);
  }
}
