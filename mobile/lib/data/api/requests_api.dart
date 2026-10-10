import '../../core/api/api_client.dart';
import '../../models/json.dart';
import '../../models/request.dart';

/// Response of `POST /requests`.
class CreateRequestResponse {
  const CreateRequestResponse({
    required this.request,
    required this.notifiedReviewerCount,
  });

  factory CreateRequestResponse.fromJson(Map<String, dynamic> json) => CreateRequestResponse(
        request: RequestSummary.fromJson(asMap(json['request'])),
        notifiedReviewerCount: asInt(json['notifiedReviewerCount']),
      );

  final RequestSummary request;
  final int notifiedReviewerCount;
}

/// `frontend/src/api/requests.ts`.
class RequestsApi {
  const RequestsApi(this._client);

  final ApiClient _client;

  /// `GET /requests` — Staff/Admin. The **server** scopes the result (staff see
  /// their own, admin sees all), so this sends no user id and never re-implements
  /// that rule.
  Future<RequestsListResponse> list({
    String? status,
    String? type,
    bool mine = false,
    int limit = 20,
    int offset = 0,
  }) async {
    final json = await _client.get<Map<String, dynamic>>(
      '/requests',
      query: {
        'status': status,
        'type': type,
        if (mine) 'mine': 'true',
        'limit': limit,
        'offset': offset,
      },
    );
    return RequestsListResponse.fromJson(json);
  }

  /// `GET /requests/:id` — 404 (never 403) for a staff member on someone else's
  /// request, so the screen renders its normal not-found state.
  Future<RequestDetail> byId(String id) async {
    final json = await _client.get<Map<String, dynamic>>('/requests/${Uri.encodeComponent(id)}');
    return RequestDetail.fromJson(asMap(json['request']));
  }

  /// `GET /requests/pending-count` — drives the admin's review-queue badge.
  Future<int> pendingCount() async {
    final json = await _client.get<Map<String, dynamic>>('/requests/pending-count');
    return asInt(json['pendingCount']);
  }

  /// `POST /requests` — files a TRANSFER or DISPOSAL. One PENDING request per
  /// item: a second answers 409 pointing at the conflict, which the form surfaces
  /// as a link to the existing request rather than a dead end.
  Future<CreateRequestResponse> create(CreateRequestPayload payload) async {
    final json = await _client.post<Map<String, dynamic>>('/requests', body: payload.toJson());
    return CreateRequestResponse.fromJson(json);
  }

  /// `POST /requests/:id/approve` — Admin only (403 for staff).
  Future<DecideRequestResponse> approve(String id) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/requests/${Uri.encodeComponent(id)}/approve',
    );
    return DecideRequestResponse.fromJson(json);
  }

  /// `POST /requests/:id/reject` — Admin only; `rejectionReason` required
  /// (3–500 chars, enforced by the server's schema).
  Future<DecideRequestResponse> reject(String id, String rejectionReason) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/requests/${Uri.encodeComponent(id)}/reject',
      body: {'rejectionReason': rejectionReason},
    );
    return DecideRequestResponse.fromJson(json);
  }
}
