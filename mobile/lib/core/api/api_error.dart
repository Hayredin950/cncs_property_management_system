/// The two failure shapes every screen branches on — the mobile twin of
/// `frontend/src/types/api.ts`.
///
/// The web client's rule is that every failure is normalized to one of these two
/// and the server's own `error` string is shown **verbatim**, never reworded
/// (frontend-design-system.md §2). Both halves matter here: screens branch on
/// `status` (`404` vs `410` vs `409`), and never on parsing a message.
library;

/// A response arrived and it was not 2xx. `message` is the server's own `error`.
class ApiError implements Exception {
  const ApiError(this.status, this.message, [this.details]);

  final int status;
  final String message;

  /// The response's optional `details` — used by the forms to place a
  /// field-level message (e.g. a duplicate category name under the input)
  /// rather than raising it to a snackbar.
  final Object? details;

  /// Convenience for the screens that treat a family of codes the same way.
  bool get isNotFound => status == 404;

  /// The disposed-item public lookup (F7.3). The web app renders the API's exact
  /// sentence and nothing else for this one.
  bool get isGone => status == 410;

  /// Used by the request forms: one PENDING request per item, second answers 409.
  bool get isConflict => status == 409;

  bool get isForbidden => status == 403;
  bool get isUnauthorized => status == 401;

  @override
  String toString() => message;
}

/// No HTTP response at all — DNS, timeout, airplane mode, server down.
class NetworkError implements Exception {
  const NetworkError([this.message = 'Network request failed']);

  final String message;

  @override
  String toString() => message;
}

/// Pulls a human message out of anything a provider might surface, so a widget
/// never has to know which of the two error types it is holding.
String describeError(Object error) {
  if (error is ApiError) return error.message;
  if (error is NetworkError) return error.message;
  return error.toString();
}
