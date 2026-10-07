import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/providers/auth_provider.dart';
import '../features/admin/admin_categories_page.dart';
import '../features/admin/admin_users_page.dart';
import '../features/audits/audit_list_page.dart';
import '../features/audits/audit_new_page.dart';
import '../features/audits/audit_report_page.dart';
import '../features/audits/audit_scan_page.dart';
import '../features/auth/change_password_page.dart';
import '../features/auth/login_page.dart';
import '../features/dashboard/dashboard_page.dart';
import '../features/items/item_form_page.dart';
import '../features/items/item_staff_page.dart';
import '../features/items/items_browse_page.dart';
import '../features/notifications/notifications_page.dart';
import '../features/profile/profile_page.dart';
import '../features/public/item_detail_page.dart';
import '../features/public/landing_page.dart';
import '../features/public/map_page.dart';
import '../features/public/not_found_page.dart';
import '../features/public/scan_page.dart';
import '../features/reports/reports_page.dart';
import '../features/requests/request_detail_page.dart';
import '../features/requests/request_form_page.dart';
import '../features/requests/requests_list_page.dart';
import '../theme/tokens.dart';
import 'shells.dart';

/// The route map of the web app's `router.tsx`, in go_router form. The paths are
/// **identical on purpose** — `/item/:tagId` (singular, public, the QR
/// destination) and `/items/:id` (plural, staff detail) are different routes
/// because `qrGenerator` encodes the singular form into every printed sticker, so
/// it cannot change; and a link someone copies out of the web app has to mean the
/// same thing here.
///
/// Three shells, matching §9's three:
///
///   * [PublicShell] — `/`, `/map`, `/login`.
///   * [SharedSurface] — `/scan`, `/items`, `/item/:tagId`, plus the two
///     404-shaped destinations. Each is a staff destination *and* a public
///     surface, so the chrome is chosen from the auth state at navigation time.
///   * [WorkbenchShell] — everything else, behind the auth guard.
///
/// **A staff session that deep-links to `/admin/users` gets the app's normal 404**,
/// never a "you don't have permission" page. §9.1's reasoning is worth repeating
/// because it looks like an oversight: the role check is enforced server-side
/// (`POST /auth/register` 403s), so inventing a 403 page here would be UI theatre
/// that keeps the number of trust boundaries the UI *pretends* to enforce above
/// zero — which is exactly what a future reader would then trust.

/// Tells go_router to re-run `redirect` when the session changes. Without it the
/// router would keep the routes it computed at sign-in: a user who signs out on the
/// dashboard would stay there until they touched a link.
class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(Ref ref) {
    _subscription = ref.listen(authProvider, (_, _) => notifyListeners());
  }

  late final ProviderSubscription _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}

/// Routes an anonymous visitor may open. `/item/:tagId` is in the shared group
/// rather than here because staff reach it too — but an anonymous visitor must be
/// able to scan a sticker and land on it, which is the single most important
/// journey in the product.
///
/// `/splash` is deliberately **not** here: it is the holding state the router parks
/// on *while* it checks a stored token, never a destination. Listing it as public
/// made it a dead end — an anonymous session that settled on the splash matched the
/// public rule and stayed there for good, showing the logo and a spinner forever.
bool _isPublic(String path) => path == '/' || path == '/map' || path == '/login';

/// The shared addresses: public, and also inside the workbench.
bool _isShared(String path) =>
    path == '/scan' || path == '/items' || path.startsWith('/item/');

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    debugLogDiagnostics: kDebugMode,

    /// An unknown path gets the designed 404 (§10.14), not go_router's default
    /// error screen — "never a blank white page", and never a raw exception.
    ///
    /// The surface is built with `currentPath: state.uri.path` so the shell that wraps
    /// it still knows what was asked for.
    errorBuilder: (context, state) =>
        SharedSurface(currentPath: state.uri.path, child: const NotFoundPage()),

    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final path = state.uri.path;

      // The stored token has not been checked yet. Holding every route at the
      // splash is what stops a returning user seeing the login screen flash on
      // each cold start.
      if (auth.status == AuthStatus.unknown) {
        return path == '/splash' ? null : '/splash';
      }

      if (!auth.isAuthenticated) {
        // The token was checked and there is nobody signed in: leave the splash for
        // the login screen. Checked before the public rule because the splash is not
        // a page a visitor may stay on — it has no way out of its own.
        if (path == '/splash') return '/login';
        if (_isPublic(path) || _isShared(path) || path == '/not-found') return null;
        // `from` survives the round trip so the login screen can put the user back
        // where the 401 interrupted them (§10.13).
        return '/login?from=${Uri.encodeComponent(state.uri.toString())}';
      }

      // Forced password change beats every other destination, because the server
      // refuses the rest of the API until it is done — routing anywhere else would
      // render a screen of 403s.
      if (auth.mustChangePassword && path != '/change-password') {
        return '/change-password';
      }

      // Signed in and sitting on the login screen: forward, don't render. The
      // `from` the login screen carried is honoured when it is a real in-app path,
      // which is what makes "sign in and you land back where the 401 interrupted
      // you" true rather than aspirational.
      if (path == '/login') {
        final from = state.uri.queryParameters['from'];
        if (from != null && from.startsWith('/') && !from.startsWith('/login')) {
          return from;
        }
        return '/dashboard';
      }
      if (path == '/splash') return '/dashboard';

      // Admin-only *frontend* routes: a non-admin gets the 404, not a 403 (§9.1).
      if (path.startsWith('/admin') && !auth.isAdmin) return '/not-found';

      return null;
    },

    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const _SplashPage(),
      ),

      // Shell A — anonymous.
      ShellRoute(
        builder: (context, state, child) =>
            PublicShell(currentPath: state.uri.path, child: child),
        routes: [
          GoRoute(path: '/', builder: (context, state) => const LandingPage()),
          GoRoute(path: '/map', builder: (context, state) => const MapPage()),
          GoRoute(
            path: '/login',
            builder: (context, state) => LoginPage(
              // `context.push('/x')` from a failed deep link arrives as `from`.
              from: state.uri.queryParameters['from'],
            ),
          ),
        ],
      ),

      // The shared addresses — public surface *and* staff workbench.
      ShellRoute(
        builder: (context, state, child) =>
            SharedSurface(currentPath: state.uri.path, child: child),
        routes: [
          GoRoute(path: '/scan', builder: (context, state) => const ScanPage()),
          GoRoute(path: '/items', builder: (context, state) => const ItemsBrowsePage()),
          GoRoute(
            path: '/item/:tagId',
            builder: (context, state) => ItemDetailPage(
              tagId: state.pathParameters['tagId'] ?? '',
            ),
          ),
          GoRoute(path: '/not-found', builder: (context, state) => const NotFoundPage()),
        ],
      ),

      // Shell B/C — the authenticated workbench.
      ShellRoute(
        builder: (context, state, child) =>
            WorkbenchShell(currentPath: state.uri.path, child: child),
        routes: [
          GoRoute(path: '/dashboard', builder: (context, state) => const DashboardPage()),
          GoRoute(
            path: '/change-password',
            builder: (context, state) => const ChangePasswordPage(),
          ),
          GoRoute(path: '/profile', builder: (context, state) => const ProfilePage()),

          // `/items/new` is declared **before** `/items/:id`: go_router matches in
          // declaration order, so the reverse order would resolve "new" as an id.
          GoRoute(path: '/items/new', builder: (context, state) => const ItemFormPage()),
          GoRoute(
            path: '/items/:id/edit',
            builder: (context, state) => ItemFormPage(itemId: state.pathParameters['id']),
          ),
          GoRoute(
            path: '/items/:id',
            builder: (context, state) => ItemStaffPage(itemId: state.pathParameters['id'] ?? ''),
          ),

          GoRoute(path: '/requests', builder: (context, state) => const RequestsListPage()),
          GoRoute(
            path: '/requests/new',
            builder: (context, state) => RequestFormPage(
              itemId: state.uri.queryParameters['itemId'],
            ),
          ),
          GoRoute(
            path: '/requests/:id',
            builder: (context, state) =>
                RequestDetailPage(requestId: state.pathParameters['id'] ?? ''),
          ),

          GoRoute(path: '/notifications', builder: (context, state) => const NotificationsPage()),

          // `/audits` (plural) is the history; `/audit/...` (singular) is one
          // session — the same plural/singular split the web router uses.
          GoRoute(path: '/audits', builder: (context, state) => const AuditListPage()),
          GoRoute(path: '/audit/new', builder: (context, state) => const AuditNewPage()),
          GoRoute(
            path: '/audit/:id/scan',
            builder: (context, state) => AuditScanPage(auditId: state.pathParameters['id'] ?? ''),
          ),
          GoRoute(
            path: '/audit/:id/report',
            builder: (context, state) => AuditReportPage(auditId: state.pathParameters['id'] ?? ''),
          ),

          GoRoute(path: '/reports', builder: (context, state) => const ReportsPage()),

          GoRoute(path: '/admin/users', builder: (context, state) => const AdminUsersPage()),
          GoRoute(
            path: '/admin/categories',
            builder: (context, state) => const AdminCategoriesPage(),
          ),
        ],
      ),
    ],
  );
});

/// Shown only while the stored token is being verified — a branded blank rather
/// than a spinner on a white void, so the first frame of a cold start already looks
/// like the product.
class _SplashPage extends StatelessWidget {
  const _SplashPage();

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                clipBehavior: Clip.antiAlias,
                child: Image.asset('assets/aau/aau-logo.png', fit: BoxFit.contain),
              ),
              const SizedBox(height: AppSpace.s4),
              const Text(
                kAppTitle,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray800,
                ),
              ),
              const SizedBox(height: AppSpace.s5),
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ],
          ),
        ),
      );
}
