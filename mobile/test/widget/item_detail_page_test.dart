import 'package:cncs_pms_mobile/features/public/item_detail_page.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';
import '../support/pump.dart';

/// `/item/:tagId` is "the highest-traffic, highest-stakes screen in the system", and
/// its three outcomes are three separately designed pages. These tests pin all three,
/// plus the field-filter rule they exist to express.

void main() {
  testWidgets('a public viewer sees the short page, and the withheld fields are absent',
      (tester) async {
    final api = FakeApi()..get('/items/CNCS-DEMO-0001', publicItemJson());
    await pumpPage(tester, const ItemDetailPage(tagId: 'CNCS-DEMO-0001'), api: api);
    await pumpUntilFound(tester, find.text('Dell Latitude 5420'));

    final text = visibleText(tester);
    // Present, because SRS 3.4 keeps location public.
    expect(text, contains('Computer Science'));
    expect(text, contains('CNCS Building'));
    expect(text, contains('Room 312'));

    // Absent, because the server omitted the whole privileged block. A greyed-out
    // price with a lock icon would leak that a price exists, and would be this client
    // re-implementing the server's field filter.
    expect(text, isNot(contains('Owner')));
    expect(text, isNot(contains('ETB')));
    expect(text, isNot(contains('Specs')));
    expect(text, isNot(contains('SN-1234')));
    expect(text, isNot(contains('Kept in the lab cabinet')));
  });

  testWidgets('the same lookup shows a staff-shaped response as the full record',
      (tester) async {
    final api = FakeApi()..get('/items/CNCS-DEMO-0001', itemJson());
    await pumpPage(tester, const ItemDetailPage(tagId: 'CNCS-DEMO-0001'), api: api);
    await pumpUntilFound(tester, find.text('Dell Latitude 5420'));

    final text = visibleText(tester);
    expect(text, contains('Owner'));
    expect(text, contains('Selam Bekele'));
    expect(text, contains('ETB 45,000.00'));
    expect(text, contains('Latitude 5420'));
    expect(text, contains('Kept in the lab cabinet.'));
  });

  testWidgets('an unknown tag is a designed 404 that echoes the tag looked up',
      (tester) async {
    final api = FakeApi()..error('GET', '/items/CNCS-TYPO-9', 404, 'Item not found');
    await pumpPage(tester, const ItemDetailPage(tagId: 'CNCS-TYPO-9'), api: api);
    await pumpUntilFound(tester, find.text('Tag not found.'));

    final text = visibleText(tester);
    expect(text, contains('Tag not found.'));
    // Echoing the raw tag is the whole recovery mechanism: the usual cause is a typo in
    // manual entry, and seeing your own string back is how you spot it.
    expect(text, contains('CNCS-TYPO-9'));
    expect(text, contains('O and 0'));
  });

  testWidgets('a disposed item shows the API sentence and nothing else', (tester) async {
    final api = FakeApi()
      ..error('GET', '/items/CNCS-DEMO-0003', 410, 'This item is no longer in service');
    await pumpPage(tester, const ItemDetailPage(tagId: 'CNCS-DEMO-0003'), api: api);
    await pumpUntilFound(tester, find.text('This item is no longer in service'));

    final text = visibleText(tester);
    expect(text, contains('This item is no longer in service'));
    // F7.3's "nothing else": a disposed record's identity is not public, so no tag,
    // no name, and no next step is offered.
    expect(text, isNot(contains('CNCS-DEMO-0003')));
    expect(text, isNot(contains('Search the register')));
  });
}
