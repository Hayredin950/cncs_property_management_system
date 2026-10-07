import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/router.dart';
import 'data/providers/auth_provider.dart';
import 'data/providers/core_providers.dart';
import 'theme/theme.dart';

/// CNCS Property Management System — the mobile client (Addis Ababa University).
///
/// Boot order matters here, and it is the same shape as the web app's `RootProviders`:
///
///   1. `ProviderScope` builds the dependency graph — one `ApiClient` for the whole
///      app, so the auth token is attached in exactly one place.
///   2. The router starts on `/` and immediately redirects to `/splash`, because the
///      auth controller begins in `AuthStatus.unknown`.
///   3. `bootstrap()` reads the persisted token, and only then does the auth state
///      settle. That is what stops a returning user seeing the login screen flash on
///      every cold start.
///
/// `WidgetsFlutterBinding.ensureInitialized()` is required before step 3's secure
/// storage read, so it is the first line of `main`.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(retry: noAutoRetry, child: CncsPmsApp()));
}

class CncsPmsApp extends ConsumerStatefulWidget {
  const CncsPmsApp({super.key});

  @override
  ConsumerState<CncsPmsApp> createState() => _CncsPmsAppState();
}

class _CncsPmsAppState extends ConsumerState<CncsPmsApp> {
  @override
  void initState() {
    super.initState();
    // Deferred to a microtask so `ref` is used after the first build rather than
    // during it — Riverpod forbids modifying a provider's state inside a build, and
    // `bootstrap()` assigns to `authProvider`.
    Future.microtask(() => ref.read(authProvider.notifier).bootstrap());
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'CNCS Property',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) {
        // The platform text scale is respected, but clamped: §12's accessibility
        // floor is a *usable* 200%, and past that a form stops being a form. The
        // clamp lives here, once, rather than per screen.
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(
            textScaler: media.textScaler.clamp(
              minScaleFactor: 1.0,
              maxScaleFactor: 1.6,
            ),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
