import 'package:cncs_pms_mobile/app/router.dart';
import 'package:cncs_pms_mobile/features/public/map_page.dart';
import 'package:cncs_pms_mobile/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';
import '../support/pump.dart';

/// `/map` is the phone's answer to \"what is in Building 3?\".
///
/// The page used to show one building at a time behind a picker, which made that
/// question unanswerable unless you already knew what the building was called — and it
/// was reachable from exactly one button on the landing page, so a staff member in the
/// workbench never saw it. These tests pin both halves: every building gets its own
/// section, and the chrome carries the link.
void main() {
  /// A register spread over two buildings, public-shaped (a visitor can read it).
  FakeApi registerOf(List<Map<String, Object?>> items) => FakeApi()
    ..get('/health', {'status': 'ok'})
    ..get('/items', itemsListJson(items: items, total: items.length));

  testWidgets('every building gets its own section, not one at a time', (tester) async {
    final api = registerOf([
      publicItemJson(tagId: 'CNCS-DEMO-0001', name: 'Dell Latitude 5420'),
      publicItemJson(tagId: 'CNCS-DEMO-0002', name: 'Epson Projector', building: 'Library Block'),
      publicItemJson(tagId: 'CNCS-DEMO-0003', name: 'Compound Microscope', building: 'Library Block'),
    ]);

    await pumpPage(tester, const MapPage(), api: api);
    await pumpUntilFound(tester, find.text('Library Block'));

    final text = visibleText(tester);
    expect(text, contains('CNCS Building'));
    expect(text, contains('Library Block'));
    // Both are on the page at once, with their own counts — that is the difference
    // from the picker it replaced.
    expect(text, contains('1 item'));
    expect(text, contains('2 items'));
    expect(text, contains('Dell Latitude 5420'));
    expect(text, contains('Epson Projector'));
    expect(text, contains('Compound Microscope'));
    // The caveat the web version carries too: a building is only here because the
    // register says something is in it.
    expect(text, contains('disposed items are not listed here'));
  });

  testWidgets('a long building is summarised instead of swallowing the page',
      (tester) async {
    final api = registerOf([
      for (var index = 0; index < 7; index++)
        publicItemJson(
          tagId: 'CNCS-DEMO-000$index',
          name: 'Lab bench $index',
        ),
      publicItemJson(tagId: 'CNCS-DEMO-0009', name: 'Server rack', building: 'Library Block'),
    ]);

    await pumpPage(tester, const MapPage(), api: api);
    await pumpUntilFound(tester, find.text('See all 7 in CNCS Building'));

    final text = visibleText(tester);
    // The first five are printed; the rest are behind the button, and the *other*
    // building is still on the same screen.
    expect(text, contains('Lab bench 4'));
    expect(text, isNot(contains('Lab bench 5')));
    expect(text, contains('Library Block'));
  });

  testWidgets('an empty register says so rather than showing nothing', (tester) async {
    final api = registerOf(const []);

    await pumpPage(tester, const MapPage(), api: api);
    await pumpUntilFound(tester, find.text('No buildings to show yet'));

    expect(visibleText(tester), contains('Buildings appear here as soon as items are registered'));
  });

  testWidgets('a visitor tapping the chrome is sent to sign in, with map as the return',
      (tester) async {
    final api = registerOf([publicItemJson(tagId: 'CNCS-DEMO-0001', name: 'Dell Latitude 5420')]);

    await pumpApp(tester, api);
    await pumpUntilFound(tester, find.text('Staff sign in'));

    final context = tester.element(find.byType(CncsPmsApp));
    final router = ProviderScope.containerOf(context).read(routerProvider);
    router.go('/scan');
    await pumpUntilFound(tester, find.byTooltip('Browse by building'));

    await tester.tap(find.byTooltip('Browse by building'));
    await pumpFrames(tester, frames: 20);

    // `/map` is the register grouped by building, so it needs a session — only
    // `/scan` is anonymous. The tap forwards to sign in and remembers where the
    // visitor was going, rather than showing a 404 or an empty page.
    expect(visibleText(tester), contains('Staff sign in'));
    expect(router.state.uri.queryParameters['from'], '/map');
  });

  testWidgets('a signed-in viewer reaches the grouped register from the chrome',
      (tester) async {
    final api = registerOf([publicItemJson(tagId: 'CNCS-DEMO-0001', name: 'Dell Latitude 5420')])
      ..get('/auth/me', {
        'user': {
          'id': 'user-1',
          'fullName': 'Selam Bekele',
          'email': 'selam@aau.edu.et',
          'role': 'STAFF',
          'createdAt': '2026-01-01T00:00:00.000Z',
          'mustChangePassword': false,
        },
      });

    await pumpApp(tester, api, overrides: api.overridesWithToken('good-token'));
    await pumpFrames(tester, frames: 20);

    // A signed-in viewer's chrome is the workbench, where the building browser
    // is the More sheet's row rather than the visitor bar's icon.
    await pumpUntilFound(tester, find.text('More'));
    await tester.tap(find.text('More').last);
    await pumpFrames(tester, frames: 10);
    await tester.tap(find.text('Browse by building'));
    await pumpUntilFound(tester, find.text('Dell Latitude 5420'));

    // Landed on the page itself: the grouping and the item, not a 404 or an empty
    // surface. The register is asked for `scope=all`, so a Staff viewer sees the
    // whole campus rather than only their own holdings.
    expect(visibleText(tester), contains('CNCS Building'));
    expect(
      api.requests
          .where((request) => request.path == '/items')
          .any((request) => request.queryParameters['scope'] == 'all'),
      isTrue,
      reason: 'the map must ask for the whole register, not the role default',
    );
  });
}
