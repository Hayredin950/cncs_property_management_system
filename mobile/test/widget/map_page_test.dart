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

  testWidgets('a visitor reaches it from the chrome, not only the landing page',
      (tester) async {
    final api = registerOf([publicItemJson(tagId: 'CNCS-DEMO-0001', name: 'Dell Latitude 5420')]);

    await pumpApp(tester, api);
    // A visitor's cold start settles on the sign-in card, which deliberately
    // carries no map action — so the journey starts where a visitor really starts
    // once they have tapped a link or scanned a sticker: the shared surface.
    await pumpUntilFound(tester, find.text('Staff sign in'));

    final context = tester.element(find.byType(CncsPmsApp));
    ProviderScope.containerOf(context).read(routerProvider).go('/scan');
    await pumpUntilFound(tester, find.byTooltip('Browse by building'));

    await tester.tap(find.byTooltip('Browse by building'));
    await pumpUntilFound(tester, find.text('Dell Latitude 5420'));

    // Landed on the page itself: the grouping and the item, not a 404 or an empty
    // surface.
    expect(visibleText(tester), contains('CNCS Building'));
  });
}
