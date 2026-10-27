import 'package:cncs_pms_mobile/data/providers/auth_provider.dart';
import 'package:cncs_pms_mobile/data/providers/notifications_provider.dart';
import 'package:cncs_pms_mobile/data/providers/requests_provider.dart';
import 'package:cncs_pms_mobile/models/enums.dart';
import 'package:cncs_pms_mobile/models/user.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';

/// The account the container is acting as, for a test that switches mid-run.
class _ActiveUser extends Notifier<AuthUser?> {
  @override
  AuthUser? build() => null;

  void set(AuthUser? user) => state = user;
}

final _activeUserProvider = NotifierProvider<_ActiveUser, AuthUser?>(_ActiveUser.new);

/// A badge belongs to the account that owns it.
///
/// The app keeps its providers for the life of the process, so signing out and
/// signing in as somebody else used to leave the *previous* account's numbers on
/// screen. Found on the phone switching from a head to the officer: the Requests
/// tab still read 8 (the head's queue) while the officer's dashboard read 24, and
/// the officer's bell showed no unread count at all because the auditor's zero
/// was still cached. Both providers now depend on the signed-in account.
void main() {
  AuthUser userFor(Role role) => AuthUser(
    id: 'user-${role.name}',
    fullName: 'Selam Bekele',
    email: 'selam@aau.edu.et',
    role: role,
    createdAt: '2026-09-01T08:00:00.000Z',
  );

  ProviderContainer containerFor(FakeApi api) => ProviderContainer(
        overrides: [
          ...api.overridesWithToken('stored-token'),
          currentUserProvider.overrideWith((ref) => ref.watch(_activeUserProvider)),
        ],
      );

  test('the queue badge refetches when the account changes', () async {
    final api = FakeApi()..get('/requests/pending-count', {'pendingCount': 24});
    final container = containerFor(api);
    addTearDown(container.dispose);
    container.read(_activeUserProvider.notifier).set(userFor(Role.departmentHead));

    expect(await container.read(pendingRequestCountProvider.future), 24);
    final first = api.requests.where((row) => row.path == '/requests/pending-count').length;
    expect(first, 1);

    // The next person to sign in on this handset.
    container.read(_activeUserProvider.notifier).set(userFor(Role.propertyOfficer));

    expect(await container.read(pendingRequestCountProvider.future), 24);
    final after = api.requests.where((row) => row.path == '/requests/pending-count').length;
    expect(after, 2, reason: 'the badge must ask again for the new account');
  });

  test('the unread bell refetches when the account changes', () async {
    final api = FakeApi()
      ..get('/notifications', {
        'notifications': const [],
        'unreadCount': 45,
        'limit': 1,
        'offset': 0,
      });
    final container = containerFor(api);
    addTearDown(container.dispose);
    container.read(_activeUserProvider.notifier).set(userFor(Role.auditor));

    // The auditor had nothing unread; the officer has 45.
    expect(await container.read(unreadCountProvider.future), 45);
    final first = api.requests.where((row) => row.path == '/notifications').length;
    expect(first, 1);

    container.read(_activeUserProvider.notifier).set(userFor(Role.propertyOfficer));

    expect(await container.read(unreadCountProvider.future), 45);
    final after = api.requests.where((row) => row.path == '/notifications').length;
    expect(after, 2, reason: 'the bell must ask again for the new account');
  });

  test('the inbox itself refetches when the account changes', () async {
    final api = FakeApi()
      ..get('/notifications', {
        'notifications': const [],
        'unreadCount': 0,
        'limit': 50,
        'offset': 0,
      });
    final container = containerFor(api);
    addTearDown(container.dispose);
    container.read(_activeUserProvider.notifier).set(userFor(Role.auditor));

    await container.read(notificationsProvider.future);
    expect(api.requests.where((row) => row.path == '/notifications').length, 1);

    // A personal inbox must not survive an account switch.
    container.read(_activeUserProvider.notifier).set(userFor(Role.propertyOfficer));
    await container.read(notificationsProvider.future);
    expect(api.requests.where((row) => row.path == '/notifications').length, 2);
  });

  test('a signed-out session reads zero, not the last account’s number', () async {
    final api = FakeApi()..get('/requests/pending-count', {'pendingCount': 24});
    final container = containerFor(api);
    addTearDown(container.dispose);
    container.read(_activeUserProvider.notifier).set(userFor(Role.propertyOfficer));

    expect(await container.read(pendingRequestCountProvider.future), 24);
    container.read(_activeUserProvider.notifier).set(null);
    expect(await container.read(pendingRequestCountProvider.future), 0);
  });
}
