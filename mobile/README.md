# cncs_pms_mobile

The mobile client for the CNCS Property Management System (Addis Ababa University) —
a Flutter app that mirrors the web client's functionality and its AAU-rebranded
visual language, laid out for a phone held one-handed.

The design source of truth is `docs/frontend-design-system.md` (semantic colour maps,
the three shells, the icon map, motion, the component library, the page-by-page
blueprints), and the API contract is `docs/backend-handoff.md`. Where this app and the
web app could disagree, the web implementation under `frontend/src/` wins: `lib/core/format.dart`
mirrors `frontend/src/lib/formatters.ts`, and `lib/data/api/*` mirrors `frontend/src/api/*`.

## Stack

| Concern | Choice |
| --- | --- |
| State | `flutter_riverpod` (Notifier / AsyncNotifier; manual providers, no codegen) |
| Routing | `go_router` (one router, role-aware redirects, three shells) |
| HTTP | `dio` behind one wrapper (`lib/core/api/api_client.dart`) |
| Tokens | `flutter_secure_storage` |
| Scanning | `mobile_scanner` |
| Files | `path_provider` + `share_plus` + `open_filex` |
| Localisation (numbers/dates) | `intl` |

Fonts are Geist / GeistMono, bundled under `assets/fonts/`; AAU artwork is under
`assets/aau/`.

## Running it

```bash
flutter pub get
flutter run
```

A release/debug build with no extra flags talks to the **deployed API**. To point a
build somewhere else (a local Docker stack, a staging deploy), bake the origin in at
compile time:

```bash
# Android emulator reaching the host machine
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000

# Physical device on the LAN
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000
```

`API_BASE_URL` is a compile-time constant (`String.fromEnvironment`), exactly like the
web build's `VITE_API_BASE_URL`; the app appends `/api/v1` in one place (`lib/core/env.dart`).
When it is set, the login screen says which backend it is using, so a wrong origin is a
one-glance diagnosis rather than a half-hour of guessing.

## Layout

```
lib/
  app/          router + the three shells (public, workbench, shared surface)
  core/         env, formatters, file saving, the API client, errors, token storage
  data/
    api/        one module per backend resource group
    providers/  Riverpod providers + the mutation/action classes
  features/     one folder per screen area (auth, public, items, requests, …)
  models/       hand-written JSON models with tolerant parsing helpers
  theme/        tokens + ThemeData
  widgets/      the shared component library (§8)
test/
  support/      the fake API harness (a scripted Dio adapter) + fixtures + pump helpers
  core/ data/ widget/…
```

Two conventions worth knowing before reading the code:

- **Errors are shown verbatim.** `ApiError` carries the server's own `error` string, and
  screens render it unchanged — a 409 that says exactly which request already exists is
  worth more than any wording the client could invent.
- **A skeleton, not a spinner, for every fetch.** A skeleton matches the shape of the
  content about to arrive; a spinner is only for an action inside a control that already
  exists. This is why no screen uses `pumpAndSettle`-friendly animations.

### A note on Riverpod's automatic retry

Riverpod 3 retries a failed provider automatically (exponential backoff, ten attempts).
This app disables that policy with `noAutoRetry` (`lib/data/providers/core_providers.dart`),
passed to `ProviderScope` in `main.dart`. During a retry Riverpod reports the provider as
*loading with an error attached*, so `AsyncValue.when` would render the skeleton and the
server's own error sentence would never reach the screen — which would defeat the whole
point of designing the error states. Every failure here has an explicit recovery path
(`ErrorState`'s "Try again", `InlineError`'s retry, pull-to-refresh). Any test that mounts
a `ProviderScope` must pass the same policy; `test/support/pump.dart` and the harness do.

## Tests

```bash
flutter analyze --no-pub
flutter test
```

The suite replaces `apiClientProvider` with an `ApiClient` whose Dio talks to a scripted
adapter (`test/support/fake_api.dart`), so a widget test exercises the **real** client —
the same auth interceptor, query compaction, and error normalisation. Fixtures
(`test/support/fixtures.dart`) are copied from real response shapes rather than invented.

`test/support/pump.dart` deliberately never uses `pumpAndSettle`: the loading states are
skeletons that animate forever, so the helpers pump a bounded number of frames instead.
