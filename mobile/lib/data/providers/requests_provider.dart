import 'package:flutter_riverpod/flutter_riverpod.dart';
// `ProviderOrFamily` is not in the main barrel — it lives in `misc.dart`.
import 'package:flutter_riverpod/misc.dart';

import '../../models/request.dart';
import '../api/requests_api.dart';
import 'core_providers.dart';
import 'items_provider.dart';
import 'notifications_provider.dart';

/// Requests: the queue, one request, the admin badge, and the two decisions.
///
/// The server scopes the list — staff see their own, admins see everything — so
/// this client sends no user id and **never re-implements that rule**. The `mine`
/// toggle is the only narrowing control here, and it is an *additional* filter, not
/// a substitute for the server's own scope.

/// `status` and `type` are the wire strings (`PENDING`, `TRANSFER`), not the enums,
/// so a filter can hold an "All" state without inventing a sentinel member on the
/// enum that the API would reject.
typedef RequestQuery = ({String? status, String? type, bool mine, int offset});

const RequestQuery _initialRequestQuery = (status: null, type: null, mine: false, offset: 0);

class RequestQueryNotifier extends Notifier<RequestQuery> {
  @override
  RequestQuery build() => _initialRequestQuery;

  void setStatus(String? status) =>
      state = (status: status, type: state.type, mine: state.mine, offset: 0);

  void setType(String? type) =>
      state = (status: state.status, type: type, mine: state.mine, offset: 0);

  void setMine(bool mine) =>
      state = (status: state.status, type: state.type, mine: mine, offset: 0);

  void setOffset(int offset) =>
      state = (status: state.status, type: state.type, mine: state.mine, offset: offset);

  void reset() => state = _initialRequestQuery;
}

final requestQueryProvider =
    NotifierProvider<RequestQueryNotifier, RequestQuery>(RequestQueryNotifier.new);

class RequestListNotifier extends AsyncNotifier<RequestsListResponse> {
  @override
  Future<RequestsListResponse> build() {
    final query = ref.watch(requestQueryProvider);
    return ref.watch(requestsApiProvider).list(
          status: query.status,
          type: query.type,
          mine: query.mine,
          offset: query.offset,
        );
  }
}

final requestListProvider =
    AsyncNotifierProvider<RequestListNotifier, RequestsListResponse>(RequestListNotifier.new);

/// `GET /requests/:id`. A staff member asking for someone else's request gets a
/// `404` (never a `403`) — the endpoint does not confirm the row exists, so the
/// screen's "not found" state is the truthful one for both cases.
final requestDetailProvider = FutureProvider.family<RequestDetail, String>((ref, requestId) {
  return ref.watch(requestsApiProvider).byId(requestId);
});

/// `GET /requests/pending-count` — the admin tab badge. A count endpoint rather
/// than counting a page of results, so the badge is right even when the queue's
/// first page is not the whole queue.
final pendingRequestCountProvider = FutureProvider<int>((ref) {
  return ref.watch(requestsApiProvider).pendingCount();
});

/// Everything a decision invalidates. Approving a transfer rewrites the item's
/// location and may cascade to its accessories, writes an edit-log row per field,
/// and files a notification — so a decision that refreshed only the request would
/// leave three other screens claiming the old state.
List<ProviderOrFamily> _requestDependents(String requestId) => [
      requestListProvider,
      requestDetailProvider(requestId),
      pendingRequestCountProvider,
    ];

extension RequestInvalidation on Ref {
  void invalidateRequestData(String requestId) {
    for (final provider in _requestDependents(requestId)) {
      invalidate(provider);
    }
  }
}

extension RequestInvalidationOnWidgetRef on WidgetRef {
  void invalidateRequestData(String requestId) {
    for (final provider in _requestDependents(requestId)) {
      invalidate(provider);
    }
  }
}

/// Request mutations: file one, approve one, reject one.
class RequestActions {
  const RequestActions(this._ref);

  final Ref _ref;

  /// `POST /requests`. A second pending request for the same item answers `409`,
  /// and the message the API sends names the existing request — which is why the
  /// form surfaces it as a banner with a link rather than a toast: the useful
  /// response to "there is already one" is "here it is" (§10.7).
  Future<CreateRequestResponse> create(CreateRequestPayload payload) async {
    final response = await _ref.read(requestsApiProvider).create(payload);
    _ref.invalidate(requestListProvider);
    _ref.invalidate(pendingRequestCountProvider);
    // Filing one notifies the reviewers, so their badge is now stale.
    _ref.invalidate(unreadCountProvider);
    return response;
  }

  /// `POST /requests/:id/approve`.
  ///
  /// Two invalidations beyond the request itself, and both are load-bearing: an
  /// approved transfer rewrites the item (location, possibly owner) and cascades to
  /// its accessories, so the item's own providers are now wrong; and the decision
  /// files a notification for the requester.
  Future<DecideRequestResponse> approve({required String requestId, String? itemId}) async {
    final response = await _ref.read(requestsApiProvider).approve(requestId);
    _afterDecision(requestId, itemId);
    return response;
  }

  /// `POST /requests/:id/reject` — the reason is required by the API (3–500 chars),
  /// which is why the dialog enforces the same bound instead of letting a submit
  /// fail at the server.
  Future<DecideRequestResponse> reject({
    required String requestId,
    required String rejectionReason,
    String? itemId,
  }) async {
    final response = await _ref
        .read(requestsApiProvider)
        .reject(requestId, rejectionReason);
    _afterDecision(requestId, itemId);
    return response;
  }

  /// Everything a decision moves. A rejection changes no item field, but the item
  /// providers are cheap to invalidate and *not* invalidating them on approve is a
  /// silent stale read — so both paths take the same route rather than a branch that
  /// can be got wrong.
  void _afterDecision(String requestId, String? itemId) {
    _ref.invalidateRequestData(requestId);
    if (itemId != null) {
      _ref.invalidateItemData(itemId: itemId);
    } else {
      _ref.invalidate(itemListProvider);
    }
    _ref.invalidate(unreadCountProvider);
  }
}

final requestActionsProvider = Provider<RequestActions>(RequestActions.new);
