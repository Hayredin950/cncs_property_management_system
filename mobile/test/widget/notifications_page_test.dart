import 'package:cncs_pms_mobile/features/notifications/notifications_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/fixtures.dart';
import '../support/pump.dart';

void main() {
  testWidgets('an empty inbox says "caught up", not "no notifications"', (tester) async {
    final api = FakeApi()
      ..get('/notifications', {
        'notifications': const <Object>[],
        'unreadCount': 0,
        'limit': 50,
        'offset': 0,
      });

    await pumpPage(tester, const NotificationsPage(), api: api);
    await pumpUntilFound(tester, find.textContaining('caught up'));

    expect(visibleText(tester), contains('New activity on your requests will show up here.'));
  });

  testWidgets('unread rows come first, and order inside each group is preserved',
      (tester) async {
    final api = FakeApi()
      ..get('/notifications', {
        // Already in the order the API sends: `createdAt desc`.
        'notifications': [
          notificationJson(
            id: 'read-newest',
            message: 'READ-NEWEST',
            isRead: true,
            createdAt: '2026-10-07T11:00:00.000Z',
          ),
          notificationJson(
            id: 'unread-newer',
            message: 'UNREAD-NEWER',
            createdAt: '2026-10-07T10:00:00.000Z',
          ),
          notificationJson(
            id: 'unread-older',
            message: 'UNREAD-OLDER',
            createdAt: '2026-10-06T11:00:00.000Z',
          ),
        ],
        'unreadCount': 2,
        'limit': 50,
        'offset': 0,
      });

    await pumpPage(tester, const NotificationsPage(), api: api);
    await pumpUntilFound(tester, find.text('UNREAD-NEWER'));

    final rendered = tester
        .widgetList<Text>(find.byType(Text))
        .map((widget) => widget.data ?? '')
        .where((value) => value.startsWith('UNREAD') || value.startsWith('READ'))
        .toList();

    // A partition, not a re-sort: unread first, and the API's newest-first order
    // survives inside each group.
    expect(rendered, ['UNREAD-NEWER', 'UNREAD-OLDER', 'READ-NEWEST']);
    expect(visibleText(tester), contains('2 unread'));
  });

  testWidgets('a row with no code still renders its message', (tester) async {
    // A `null` code is a real, valid state — any row not written by the request
    // workflow parses this way — so it must neither vanish nor crash.
    final api = FakeApi()
      ..get('/notifications', {
        'notifications': [
          notificationJson(
            id: 'legacy',
            code: null,
            message: 'LEGACY-ROW-WITH-NO-CODE',
            relatedRequestId: null,
          ),
        ],
        'unreadCount': 1,
        'limit': 50,
        'offset': 0,
      });

    await pumpPage(tester, const NotificationsPage(), api: api);
    await pumpUntilFound(tester, find.text('LEGACY-ROW-WITH-NO-CODE'));

    final text = visibleText(tester);
    expect(text, contains('LEGACY-ROW-WITH-NO-CODE'));
    // No click target, because there is nothing to click through to.
    expect(text, isNot(contains('View request')));
  });

  testWidgets('mark all read is offered only when something is unread', (tester) async {
    final api = FakeApi()
      ..get('/notifications', {
        'notifications': [notificationJson(isRead: true, message: 'ALREADY-READ')],
        'unreadCount': 0,
        'limit': 50,
        'offset': 0,
      });

    await pumpPage(tester, const NotificationsPage(), api: api);
    await pumpUntilFound(tester, find.text('ALREADY-READ'));

    expect(find.text('Mark all read'), findsNothing);
    expect(visibleText(tester), contains('Everything read'));
  });
}
