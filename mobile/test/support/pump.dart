import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:cncs_pms_mobile/data/providers/core_providers.dart';
import 'package:cncs_pms_mobile/main.dart';

import 'fake_api.dart';

/// Pumps frames until [finder] matches.
///
/// `pumpAndSettle` is deliberately **not** used anywhere in this suite: the app's
/// loading states are skeletons and spinners, both of which animate forever by design,
/// so `pumpAndSettle` times out on exactly the screens this suite exists to check. A
/// bounded pump loop gets the same result without depending on animations finishing.
Future<void> pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  int maxFrames = 40,
}) async {
  for (var frame = 0; frame < maxFrames; frame++) {
    await tester.pump(const Duration(milliseconds: 16));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('Nothing matched $finder after $maxFrames frames.');
}

/// Pumps a fixed number of frames, for assertions about what is *absent* — where
/// "wait until it appears" is the wrong question.
Future<void> pumpFrames(WidgetTester tester, {int frames = 5}) async {
  for (var frame = 0; frame < frames; frame++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Mounts [page] with the app's providers pointed at a scripted API.
///
/// No `GoRouter` here: these tests are about what a screen renders from a response,
/// and a real router would only add a second thing that can fail. Screens that call
/// `context.push` are exercised by tapping in the integration-style tests instead.
Future<void> pumpPage(
  WidgetTester tester,
  Widget page, {
  required FakeApi api,
  List<Override> extraOverrides = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      // The same retry policy as `main.dart`: without it a failed provider sits in
      // a retry-loading state and `when` renders the skeleton, so no error state
      // could ever be asserted here.
      retry: noAutoRetry,
      overrides: [...api.overrides, ...extraOverrides],
      child: MaterialApp(
        home: Scaffold(body: page),
      ),
    ),
  );
  await pumpFrames(tester);
}

/// Mounts the **whole app** — router, shells, redirects — onto a scripted API.
///
/// [pumpPage] deliberately leaves the `GoRouter` out, because a screen test is about
/// what one screen renders. This is the other half: the cold-start redirect that
/// chooses between the splash, the login screen and the workbench only exists once
/// the real router is mounted, so it can only be tested from here.
Future<void> pumpApp(
  WidgetTester tester,
  FakeApi api, {
  List<Override>? overrides,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      retry: noAutoRetry,
      overrides: overrides ?? api.overrides,
      child: const CncsPmsApp(),
    ),
  );
  await pumpFrames(tester);
}

/// Every piece of text currently on screen, joined — so a test can assert that
/// something is *not* rendered without guessing at widget types.
String visibleText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((widget) => widget.data ?? '')
    .join('\n');
