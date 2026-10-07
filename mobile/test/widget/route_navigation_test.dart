import 'package:cncs_pms_mobile/app/router.dart';
import 'package:cncs_pms_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';
import '../support/pump.dart';

/// Cross-shell navigation.
///
/// `/items/:id` (the staff record) lives in the workbench shell; `/item/:tagId` (the
/// public QR destination) lives in the shared surface, which picks its chrome from the
/// auth state. Those are two different `ShellRoute`s, and moving between them is the
/// one navigation in the app that crosses shells — so it is the one place a route can
/// render nothing at all.
///
/// This is the regression test for the reported bug: pressing **Tag** on an item
/// showed a white screen with the tab bar still on it.
void main() {
  /// A signed-in session whose item lookups both answer, plus the router, so a test
  /// can land on an address directly instead of walking the whole app.
  /// A phone-shaped viewport. The default 800x600 test surface is shorter than one
  /// item record, which puts the Tag button off screen and makes `tap` miss it.
  void useTallViewport(WidgetTester tester) {
    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  Future<({FakeApi api, GoRouter router})> signedIn(WidgetTester tester) async {
    useTallViewport(tester);
    final api = FakeApi()
      ..get('/health', {'status': 'ok'})
      ..get('/auth/me', {
        'user': {
          'id': 'user-1',
          'fullName': 'Selam Bekele',
          'email': 'selam@aau.edu.et',
          'role': 'STAFF',
          'createdAt': '2026-01-01T00:00:00.000Z',
          'mustChangePassword': false,
        },
      })
      ..get('/items/item-1', itemJson())
      ..get('/items/CNCS-DEMO-0001', itemJson());

    await pumpApp(tester, api, overrides: api.overridesWithToken('good-token'));
    await pumpFrames(tester, frames: 20);

    final context = tester.element(find.byType(CncsPmsApp));
    return (api: api, router: ProviderScope.containerOf(context).read(routerProvider));
  }

  testWidgets('the Tag button on an item opens that item again', (tester) async {
    final session = await signedIn(tester);
    session.router.go('/items/item-1');
    await pumpUntilFound(tester, find.text('Tag'));

    await tester.ensureVisible(find.text('Tag'));
    await tester.tap(find.text('Tag'));
    await pumpFrames(tester, frames: 20);

    // The assertion is a control that only `/item/:tagId` draws for a signed-in
    // session: it proves the destination rendered rather than a shell with an empty
    // body, which is what a white screen with a tab bar on it actually is.
    expect(
      visibleText(tester),
      contains('Open the staff record for this item'),
      reason: 'the /item/:tagId page did not render after the Tag button',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('the public item page opens the staff record for the same item',
      (tester) async {
    final session = await signedIn(tester);
    session.router.go('/item/CNCS-DEMO-0001');
    await pumpUntilFound(tester, find.text('Open the staff record for this item'));

    // The same cross-shell hop in the other direction: the shared surface hands back
    // to the workbench.
    await tester.tap(find.text('Open the staff record for this item'));
    await pumpFrames(tester, frames: 20);

    expect(
      visibleText(tester),
      contains('File a transfer or disposal request'),
      reason: 'the staff record did not render after following the public page',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('an unknown address is the designed 404, never a blank screen',
      (tester) async {
    final session = await signedIn(tester);
    session.router.go('/nowhere-at-all');
    await pumpFrames(tester, frames: 20);

    expect(visibleText(tester), contains('Page not found'));
  });

  testWidgets('a visitor reaching the scanner gets the scanner, not a blank surface',
      (tester) async {
    useTallViewport(tester);
    final api = FakeApi()..get('/health', {'status': 'ok'});
    await pumpApp(tester, api);
    await pumpUntilFound(tester, find.text('Staff sign in'));

    final context = tester.element(find.byType(CncsPmsApp));
    ProviderScope.containerOf(context).read(routerProvider).go('/scan');
    await pumpFrames(tester, frames: 20);

    // `/scan` is a shared address: a visitor gets the public chrome, which means the
    // shell is composed inside `SharedSurface` — the exact composition that used to
    // throw and leave a white screen.
    expect(visibleText(tester), contains('Scan a tag'));
    expect(visibleText(tester), contains('Or type the tag ID'));
  });
}
