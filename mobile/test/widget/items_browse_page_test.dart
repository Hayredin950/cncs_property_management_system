import 'package:cncs_pms_mobile/data/providers/items_provider.dart';
import 'package:cncs_pms_mobile/features/items/items_browse_page.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';
import '../support/pump.dart';

/// §11's rule, tested directly: "no items yet" and "no items match these filters" are
/// **two different empty states with two different jobs**. The first tells a user the
/// system is empty; the second tells them *their* filter is empty and offers the way
/// out. Collapsing them into one generic message is the failure this pins down.
void main() {
  testWidgets('an empty register says so, and offers nothing to clear', (tester) async {
    final api = FakeApi()
      ..get('/categories', const <Object>[])
      ..get('/items', itemsListJson(items: const [], total: 0));

    await pumpPage(tester, const ItemsBrowsePage(), api: api);
    await pumpUntilFound(tester, find.text('No items registered yet'));

    final text = visibleText(tester);
    expect(text, contains('Register the first item to get started.'));
    expect(text, isNot(contains('Clear filters')));
  });

  testWidgets('a filter that matches nothing offers the way back out', (tester) async {
    final api = FakeApi()
      ..get('/categories', const <Object>[])
      ..get('/items', itemsListJson(items: const [], total: 0));

    await pumpPage(tester, const ItemsBrowsePage(), api: api);
    await pumpUntilFound(tester, find.text('No items registered yet'));

    // Setting the filter *through the provider* is what makes this the filtered-empty
    // case rather than the empty-register case: the same response, a different state.
    final container = ProviderScope.containerOf(
      tester.element(find.byType(ItemsBrowsePage)),
    );
    container.read(itemQueryProvider.notifier).setDepartment('Chemistry');
    await pumpUntilFound(tester, find.text('No items match these filters'));

    final text = visibleText(tester);
    // The copy points at Reports, because disposed items leave this register and
    // someone searching for an item they know exists needs to know where it went.
    expect(text, contains('disposed'));
    expect(text, contains('Clear filters'));
  });

  testWidgets('items render as cards with their tag, condition and status', (tester) async {
    final api = FakeApi()
      ..get('/categories', const <Object>[])
      ..get(
        '/items',
        itemsListJson(
          items: [
            publicItemJson(),
            publicItemJson(tagId: 'CNCS-DEMO-0002', name: 'Epson Projector'),
          ],
          total: 2,
        ),
      );

    await pumpPage(tester, const ItemsBrowsePage(), api: api);
    await pumpUntilFound(tester, find.text('Epson Projector'));

    final text = visibleText(tester);
    expect(text, contains('2 items'));
    expect(text, contains('CNCS-DEMO-0001'));
    expect(text, contains('CNCS-DEMO-0002'));
    // Colour plus text, always — the condition is never conveyed by hue alone (§3.4).
    expect(text, contains('Good'));
    expect(text, contains('In service'));
  });
}
