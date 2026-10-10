import 'dart:convert';
import 'dart:typed_data';

import 'package:cncs_pms_mobile/core/api/api_client.dart';
import 'package:cncs_pms_mobile/core/api/token_storage.dart';
import 'package:cncs_pms_mobile/data/providers/core_providers.dart';
import 'package:dio/dio.dart';
// `Override` is not in the main barrel — it lives in `misc.dart`, like
// `ProviderOrFamily` in the app's own provider files.
import 'package:flutter_riverpod/misc.dart';

/// The test harness's network seam — the Flutter counterpart of the web suite's MSW
/// handlers (`frontend/src/test/msw/handlers.ts`).
///
/// It replaces `apiClientProvider` with an [ApiClient] whose Dio talks to a
/// scripted adapter, which means a widget test exercises the **real** client: the same
/// auth interceptor, the same `compactQuery` filtering, the same `ApiError`
/// normalization. Scripting at the `Dio` level rather than at the API-module level is
/// what makes a test able to assert on a `404`'s message, which is exactly the
/// behaviour the item page's three outcomes depend on.

/// One scripted response.
class FakeRoute {
  const FakeRoute(this.status, this.body) : isUnreachable = false;

  /// No response at all: the route exists but the transport fails, the way an
  /// offline device or a server that is down behaves. Distinct from a status-coded
  /// error, because the client normalizes the two into different exception types
  /// (`NetworkError` vs `ApiError`) and screens show different sentences for them.
  const FakeRoute.unreachable()
      : status = 0,
        body = null,
        isUnreachable = true;

  final int status;

  /// Encoded with `jsonEncode`, so a map or a list both work.
  final Object? body;

  /// See [FakeRoute.unreachable].
  final bool isUnreachable;
}

class FakeApi {
  FakeApi();

  /// Every request the app made, in order — so a test can assert that a 401 retried
  /// nothing, or that a screen did not refetch on rebuild.
  final List<RequestOptions> requests = [];

  final Map<String, FakeRoute> routes = {};

  /// Registers a `200` with a JSON body.
  void get(String path, Object? body) => routes['GET $path'] = FakeRoute(200, body);

  void post(String path, Object? body, {int status = 200}) =>
      routes['POST $path'] = FakeRoute(status, body);

  void put(String path, Object? body, {int status = 200}) =>
      routes['PUT $path'] = FakeRoute(status, body);

  void patch(String path, Object? body, {int status = 200}) =>
      routes['PATCH $path'] = FakeRoute(status, body);

  void delete(String path, Object? body, {int status = 200}) =>
      routes['DELETE $path'] = FakeRoute(status, body);

  /// An error response shaped the way the backend's error handler shapes one —
  /// `{ "error": "…" }` — so `ApiError.message` is the server's own sentence.
  void error(String method, String path, int status, String message) =>
      routes['$method $path'] = FakeRoute(status, {'error': message});

  /// A route that never answers: the transport fails before a response exists, so
  /// the client raises `NetworkError` rather than `ApiError`. The scenario is
  /// airplane mode, a wrong base URL, or the server being down — and it is worth a
  /// test of its own because "couldn't reach it" needs a different sentence from
  /// "it said no".
  void unreachable(String method, String path) =>
      routes['$method $path'] = const FakeRoute.unreachable();

  /// The storage the most recently built client writes to, so a test can assert the
  /// token was cleared rather than only that the state changed.
  InMemoryTokenStorage storage = InMemoryTokenStorage();

  /// The client the app under test will use.
  late final ApiClient client = ApiClient(
    tokenStorage: storage,
    dio: Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = _FakeAdapter(this),
  );

  /// A client that is already holding a token, for tests that need an authenticated
  /// session without going through the login screen.
  ApiClient clientWithToken(String token) {
    storage = InMemoryTokenStorage(token);
    return ApiClient(
      tokenStorage: storage,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
        ..httpClientAdapter = _FakeAdapter(this),
    );
  }

  List<Override> get overrides => [apiClientProvider.overrideWithValue(client)];

  List<Override> overridesWithToken(String token) => [
        apiClientProvider.overrideWithValue(clientWithToken(token)),
      ];
}

const Map<String, List<String>> _jsonHeaders = {
  'content-type': ['application/json'],
};

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this._api);

  final FakeApi _api;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    _api.requests.add(options);

    final key = '${options.method} ${options.path}';
    final route = _api.routes[key];
    if (route != null && route.isUnreachable) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
        error: 'FakeApi: $key is registered as unreachable',
      );
    }
    if (route == null) {
      // Loud on purpose: a missing route in a test is always a mistake in the test,
      // and a silent empty 200 would make it look as though the screen rendered
      // nothing because the data was empty.
      return ResponseBody.fromString(
        jsonEncode({'error': 'No fake route registered for $key'}),
        404,
        headers: _jsonHeaders,
      );
    }

    return ResponseBody.fromString(
      jsonEncode(route.body),
      route.status,
      headers: _jsonHeaders,
    );
  }

  @override
  void close({bool force = false}) {}
}
