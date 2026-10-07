import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/token_storage.dart';
import '../api/audits_api.dart';
import '../api/auth_api.dart';
import '../api/categories_api.dart';
import '../api/items_api.dart';
import '../api/misc_api.dart';
import '../api/notifications_api.dart';
import '../api/reports_api.dart';
import '../api/requests_api.dart';
import '../api/users_api.dart';

/// The root of the dependency graph. Every other provider reaches the network
/// through here, and a test overrides exactly this one provider to point the whole
/// app at a fake — the same seam `frontend/src/lib/apiClient.ts` gives the web
/// tests through MSW.
/// Riverpod 3 retries a failed provider automatically — exponential backoff, up to
/// ten attempts. This app turns that off, and it is a design decision rather than a
/// preference:
///
///   * Every failure the app can show already has a designed, explicit recovery
///     path — §8's `ErrorState` "Try again", `InlineError`'s retry, pull-to-refresh.
///   * During a retry Riverpod reports the provider as *loading with an error
///     attached*, so `AsyncValue.when` renders the skeleton and the server's own
///     sentence — a 409's "already exists", a 404's "that tag is unknown" — never
///     reaches the screen. §8 is explicit that those strings are shown verbatim.
///   * A down server would also be hit ten more times with nobody asking.
///
/// Returning `null` disables the retry for every provider in the container. The one
/// place that needs to retry — the connection banner on the login screen — does so
/// on its own terms, and every other screen offers the user the button.
Duration? noAutoRetry(int retryCount, Object error) => null;

final tokenStorageProvider = Provider<TokenStorage>((ref) => SecureTokenStorage());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(tokenStorage: ref.watch(tokenStorageProvider));
});

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(apiClientProvider)));
final itemsApiProvider = Provider<ItemsApi>((ref) => ItemsApi(ref.watch(apiClientProvider)));
final requestsApiProvider =
    Provider<RequestsApi>((ref) => RequestsApi(ref.watch(apiClientProvider)));
final notificationsApiProvider =
    Provider<NotificationsApi>((ref) => NotificationsApi(ref.watch(apiClientProvider)));
final auditsApiProvider = Provider<AuditsApi>((ref) => AuditsApi(ref.watch(apiClientProvider)));
final reportsApiProvider = Provider<ReportsApi>((ref) => ReportsApi(ref.watch(apiClientProvider)));
final usersApiProvider = Provider<UsersApi>((ref) => UsersApi(ref.watch(apiClientProvider)));
final categoriesApiProvider =
    Provider<CategoriesApi>((ref) => CategoriesApi(ref.watch(apiClientProvider)));
final systemApiProvider = Provider<SystemApi>((ref) => SystemApi(ref.watch(apiClientProvider)));
final uploadsApiProvider = Provider<UploadsApi>((ref) => UploadsApi(ref.watch(apiClientProvider)));

/// `GET /health` — the login screen's reachability banner and nothing else.
final healthProvider = FutureProvider<bool>((ref) async {
  return ref.watch(systemApiProvider).healthy();
});
