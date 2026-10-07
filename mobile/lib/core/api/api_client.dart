import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../env.dart';
import 'api_error.dart';
import 'token_storage.dart';

/// Called once when the API answers `401`. The token is already cleared by then,
/// and the app's auth listener is what routes back to the login screen — so this
/// file never imports the router, exactly as the web client never imports React.
typedef UnauthorizedHandler = void Function();

/// The one HTTP wrapper every `data/api/*` module goes through — the mobile twin
/// of `frontend/src/lib/apiClient.ts`.
///
/// Its jobs are the web client's jobs, for the same reasons:
///
///   1. **Attach the Bearer token** to every call, so no call site can forget it.
///   2. **Normalize every failure** to [ApiError] or [NetworkError].
///   3. **Handle `401` in exactly one place** — clear the token, notify once.
///
/// Two mobile-specific notes:
///
///   * `multipart/form-data` (the item photo) must not carry a hand-set
///     `Content-Type`. Dio appends its own `boundary`, and describing the header
///     would strip it — the server would then see a multipart body it cannot
///     parse and report no file at all. That is the same trap the web client
///     documents, and it is why [postMultipart] takes a built [FormData].
///   * The QR tag PNG and every report download sit behind `authenticate`, so
///     they go through [getBytes] rather than a bare URL. A plain `Image.network`
///     or link would send no token and store a 401 body as a `.csv` — the exact
///     bug `frontend-plan.md` §4 calls out.
class ApiClient {
  ApiClient({
    required TokenStorage tokenStorage,
    String? baseUrl,
    Dio? dio,
  })  :
        // Not an initializing formal: the parameter is public (`tokenStorage`)
        // while the field is private, and a private *named* parameter is not
        // expressible in Dart.
        // ignore: prefer_initializing_formals
        _tokenStorage = tokenStorage,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: baseUrl ?? Env.apiBaseUrl,
                // A phone on campus Wi-Fi is a slow, lossy link compared with the
                // web app's loopback/desktop case, so these are more forgiving.
                connectTimeout: const Duration(seconds: 15),
                receiveTimeout: const Duration(seconds: 30),
                sendTimeout: const Duration(seconds: 30),
                // Non-2xx is *not* an exception at the transport layer; it is
                // normalized below so every failure has one shape.
                validateStatus: (_) => true,
                headers: const {'Accept': 'application/json'},
                // JSON is the whole API's body format; stating it once here
                // keeps Dio's transformer from guessing per request. FormData is
                // the one exception, and Dio overrides the header for it so the
                // multipart boundary survives.
                contentType: Headers.jsonContentType,
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(onRequest: _onRequest),
    );
  }

  final Dio _dio;
  final TokenStorage _tokenStorage;

  /// Kept in memory *and* on disk: the in-memory copy is what the synchronous
  /// request interceptor reads on every call, and hydration at boot is what makes
  /// a cold start with a stored token work.
  String? _token;

  UnauthorizedHandler? onUnauthorized;

  /// Reads the persisted token into memory. Called once during app bootstrap,
  /// before the router decides whether the user is signed in.
  Future<void> hydrateToken() async {
    _token = await _tokenStorage.read();
  }

  bool get hasToken => _token != null;

  /// Persists a fresh token (login, change-password) so the next cold start is
  /// already signed in.
  Future<void> saveToken(String token) async {
    _token = token;
    await _tokenStorage.write(token);
  }

  Future<void> clearToken() async {
    _token = null;
    await _tokenStorage.clear();
  }

  void _onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _token;
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  /// Drops empty query values, mirroring the web client: `?search=&page=1` and
  /// `?page=1` must reach the same handler, because the backend treats an empty
  /// string as a real value in some `where` clauses (a department filter of `''`
  /// matches nothing rather than everything).
  static Map<String, dynamic> compactQuery(Map<String, dynamic> query) {
    return {
      for (final entry in query.entries)
        if (entry.value != null && entry.value != '') entry.key: entry.value,
    };
  }

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    Duration? receiveTimeout,
  }) =>
      _send<T>(path, query: query, receiveTimeout: receiveTimeout);

  Future<T> post<T>(String path, {Object? body}) => _send<T>(path, method: 'POST', body: body);

  Future<T> put<T>(String path, {Object? body}) => _send<T>(path, method: 'PUT', body: body);

  /// Partial update — `PATCH /users/:id` is the only user today.
  Future<T> patch<T>(String path, {Object? body}) => _send<T>(path, method: 'PATCH', body: body);

  /// `DELETE`, optionally with a JSON body (`DELETE /uploads/photo { url }`).
  Future<T> delete<T>(String path, {Object? body}) => _send<T>(path, method: 'DELETE', body: body);

  /// The one `multipart/form-data` call: the item photo. Never sets a
  /// `Content-Type` — see the class comment.
  Future<T> postMultipart<T>(String path, FormData form) =>
      _send<T>(path, method: 'POST', form: form);

  /// A binary response — the QR tag PNG and every report export.
  Future<Uint8List> getBytes(
    String path, {
    Map<String, dynamic>? query,
    Duration receiveTimeout = const Duration(seconds: 60),
  }) async {
    final response = await _raw(
      path,
      query: query,
      responseType: ResponseType.bytes,
      receiveTimeout: receiveTimeout,
    );
    final data = response.data;
    if (data is Uint8List) return data;
    if (data is List<int>) return Uint8List.fromList(data);
    throw const ApiError(500, 'The server returned an unreadable file.');
  }

  Future<T> _send<T>(
    String path, {
    String method = 'GET',
    Object? body,
    FormData? form,
    Map<String, dynamic>? query,
    Duration? receiveTimeout,
  }) async {
    final response = await _raw(
      path,
      method: method,
      body: body,
      form: form,
      query: query,
      receiveTimeout: receiveTimeout,
    );
    final data = response.data;

    // The backend answers `204` for a few deletes; `null` is the honest value
    // and callers typed as `void` accept it.
    if (data == null) return null as T;
    return data as T;
  }

  Future<Response<dynamic>> _raw(
    String path, {
    String method = 'GET',
    Object? body,
    FormData? form,
    Map<String, dynamic>? query,
    ResponseType responseType = ResponseType.json,
    Duration? receiveTimeout,
  }) async {
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: form ?? body,
        queryParameters: query == null ? null : compactQuery(query),
        options: Options(
          method: method,
          responseType: responseType,
          receiveTimeout: receiveTimeout,
        ),
      );

      final status = response.statusCode ?? 0;
      if (status == 401) {
        await _handleUnauthorized();
      }
      if (status < 200 || status >= 300) {
        throw _errorFrom(response, status);
      }
      return response;
    } on DioException catch (err) {
      // A transport-level failure: no response at all.
      if (err.response == null) {
        throw NetworkError(_networkMessage(err));
      }
      final status = err.response!.statusCode ?? 0;
      if (status == 401) {
        await _handleUnauthorized();
      }
      throw _errorFrom(err.response!, status);
    }
  }

  Future<void> _handleUnauthorized() async {
    await clearToken();
    onUnauthorized?.call();
  }

  /// The server's own `error` string, shown verbatim — never reworded.
  ApiError _errorFrom(Response<dynamic> response, int status) {
    final data = response.data;
    if (data is Map) {
      final error = data['error'];
      if (error is String && error.isNotEmpty) {
        return ApiError(status, error, data['details']);
      }
    }
    return ApiError(status, 'Request failed with status $status');
  }

  String _networkMessage(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'The server took too long to answer.';
      case DioExceptionType.connectionError:
        return 'Could not reach the server. Check your connection and try again.';
      case DioExceptionType.badCertificate:
        return 'The server\'s certificate could not be verified.';
      case DioExceptionType.cancel:
        return 'The request was cancelled.';
      case DioExceptionType.transformTimeout:
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        return err.message ?? 'Network request failed';
    }
  }
}

/// Re-exported so API modules can build a multipart body without importing Dio
/// themselves — keeps the HTTP library behind this one file.
typedef ApiFormData = FormData;
