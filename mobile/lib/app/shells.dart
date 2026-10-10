import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/providers/auth_provider.dart';
import '../data/providers/notifications_provider.dart';
import '../data/providers/requests_provider.dart';
import '../theme/tokens.dart';
import '../widgets/app_button.dart';
import '../widgets/feedback.dart';
import '../widgets/media.dart';
import '../widgets/status_badges.dart';

/// The three application shells of docs/frontend-design-system.md §5.5, built once
/// here so no screen owns its own chrome.
///
///   * [PublicShell] — **A**, anonymous: a minimal top bar and nothing to distract
///     a visitor from the one thing they came to do.
///   * [WorkbenchShell] — **C**, the mobile authenticated shell: top bar with the
///     unread bell, content, and a five-slot bottom tab bar whose middle slot is
///     the raised accent Scan action.
///   * [SharedSurface] — the Flutter equivalent of the web's `SmartLayout`: `/scan`,
///     `/items` and `/item/:tagId` are staff destinations *and* public surfaces, so
///     the shell is chosen per navigation rather than per route. Without it,
///     following a tab to Items — or landing on a QR destination after a save —
///     would drop the whole nav.
///
/// There is deliberately **no desktop sidebar**: §5.3 puts it at `lg`+, and a phone
/// never reaches `lg`. Building one would be untested code on a surface no user of
/// this app can see.

/// The AAU crest + lockup, rendered from the same artwork `aau.edu.et` serves and
/// the web app commits (`docs/frontend-aau-rebrand.md` §4). The two wordmark lines
/// are set in one `Column` with negative visual spacing, mirroring the web's
/// `.aau-wordmark` lockup — the values only read correctly together.
class AauLockup extends StatelessWidget {
  const AauLockup({super.key, this.onTap, this.compact = false});

  final VoidCallback? onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final mark = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: compact ? 30 : 34,
          height: compact ? 30 : 34,
          decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
          clipBehavior: Clip.antiAlias,
          child: Image.asset('assets/aau/aau-logo.png', fit: BoxFit.contain),
        ),
        const SizedBox(width: AppSpace.s2),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'አዲስ አበባ ዩኒቨርሲቲ',
              style: TextStyle(
                fontSize: 12,
                letterSpacing: 0.4,
                height: 1.1,
                color: AppColors.aauGray800,
              ),
            ),
            const Text(
              'ADDIS ABABA UNIVERSITY',
              style: TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.6,
                height: 1.4,
                color: AppColors.brand800,
              ),
            ),
          ],
        ),
      ],
    );

    if (onTap == null) return mark;
    return InkWell(onTap: onTap, borderRadius: AppRadius.smAll, child: mark);
  }
}

/// The prefix every shell's title shares: the product name, not the university's,
/// because this is where a user looks to know *which* AAU system they are in.
const String kAppTitle = 'CNCS Property';

/// Shell A — the anonymous surface.
class PublicShell extends StatelessWidget {
  const PublicShell({
    super.key,
    required this.child,
    required this.currentPath,
    this.title,
  });

  final Widget child;

  /// The address the shell is wrapping, handed in by the `ShellRoute` builder that
  /// created it.
  ///
  /// It is a parameter and not `GoRouterState.of(context)` on purpose. A shell is a
  /// widget: [SharedSurface] composes one inside *its own* builder, and the router's
  /// `errorBuilder` composes one outside every route, so in those two places there is
  /// no `GoRouterState` above the shell's context — `GoRouterState.of` threw
  /// `GoError`, the shell's whole subtree failed to build, and the user got a white
  /// screen with a tab bar on it. The route builder always has the state, so it is
  /// the thing that knows the address, and it passes it down.
  final String currentPath;

  /// Left empty on the landing page, which supplies its own hero heading. Set on
  /// the secondary public pages so the top bar says where you are.
  final String? title;

  @override
  Widget build(BuildContext context) {
    final location = currentPath;

    return Scaffold(
      backgroundColor: AppColors.aauGray50,
      appBar: AppBar(
        titleSpacing: AppSpace.s4,
        title: AauLockup(onTap: () => context.go('/')),
        actions: [
          // "Browse by building" belongs on the visitor's chrome, not only on the
          // landing page's body: a visitor who has followed a QR code or is standing
          // on the scanner is exactly the person asking where the rest of the
          // building's equipment is. Hidden while already there, so the bar never
          // offers the page it is showing.
          if (location != '/login' && location != '/map')
            AppIconButton(
              icon: Icons.map_outlined,
              tooltip: 'Browse by building',
              onPressed: () => context.push('/map'),
            ),
          if (location != '/login')
            Padding(
              padding: const EdgeInsets.only(right: AppSpace.s3),
              child: TextButton(
                onPressed: () => context.go('/login'),
                style: TextButton.styleFrom(foregroundColor: AppColors.brand700),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Staff login', style: TextStyle(fontWeight: FontWeight.w600)),
                    SizedBox(width: 4),
                    Icon(Icons.arrow_forward, size: 16),
                  ],
                ),
              ),
            ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null) _BarTitle(title!),
          Expanded(child: child),
        ],
      ),
    );
  }
}

/// Shell C — the authenticated mobile shell: top bar, content, bottom tab bar.
class WorkbenchShell extends ConsumerWidget {
  const WorkbenchShell({super.key, required this.child, required this.currentPath});

  final Widget child;

  /// See [PublicShell.currentPath] for why this is passed in rather than read from
  /// the tree.
  final String currentPath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = currentPath;
    final unread = ref.watch(unreadCountProvider).value ?? 0;

    return Scaffold(
      backgroundColor: AppColors.aauGray50,
      appBar: AppBar(
        titleSpacing: AppSpace.s4,
        title: AauLockup(compact: true, onTap: () => context.go('/dashboard')),
        actions: [
          AppIconButton(
            icon: Icons.notifications_outlined,
            tooltip: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
            badgeCount: unread,
            onPressed: () => context.push('/notifications'),
          ),
          const SizedBox(width: AppSpace.s2),
        ],
      ),
      body: child,
      bottomNavigationBar: AppTabBar(currentPath: location),
    );
  }
}

/// `/scan`, `/items` and `/item/:tagId` are staff destinations **and** public
/// surfaces, so the shell is decided at navigation time from the auth state.
///
/// This is the web's `SmartLayout` bug fix in Flutter form: putting those three in
/// the authenticated shell alone would 401 a visitor mid-scan, and putting them in
/// the public shell alone would drop the tab bar the moment a staff member tapped
/// "Items" — so neither fixed position is correct and the choice has to be dynamic.
class SharedSurface extends ConsumerWidget {
  const SharedSurface({super.key, required this.child, this.currentPath = ''});

  final Widget child;

  /// The address being wrapped, for the chrome's active state. The router's
  /// `errorBuilder` builds this shell for an address that matched nothing, and there
  /// is no `ShellRoute` state to hand it, so it defaults to empty — which is also the
  /// one case where no tab should look selected.
  final String currentPath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth.status == AuthStatus.unknown) {
      // Still checking the stored token. Showing the public chrome here would make
      // a signed-in user's tab bar blink into place; an empty branded surface is
      // the honest interim.
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    return auth.isAuthenticated
        ? WorkbenchShell(currentPath: currentPath, child: child)
        : PublicShell(currentPath: currentPath, child: child);
  }
}

class _BarTitle extends StatelessWidget {
  const _BarTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(bottom: BorderSide(color: AppColors.aauGrayLine)),
        ),
        padding: const EdgeInsets.fromLTRB(AppSpace.gutter, 0, AppSpace.gutter, AppSpace.s3),
        child: Text(
          title,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: AppColors.aauGray900,
          ),
        ),
      );
}

/// The five-slot tab bar (shell C). Five, and no more: §5.5 is explicit that a
/// sixth slot shrinks every touch target below the 44pt minimum, which is why
/// Audits, Reports and Admin live in the More sheet instead of on the bar.
///
/// The middle slot is the raised, accent-filled Scan action — "the one flagship
/// action gets visual priority even inside the staff app".
class AppTabBar extends ConsumerWidget {
  const AppTabBar({super.key, required this.currentPath});

  final String currentPath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingCountForTabBar);
    // The tab bar's Requests badge is the review queue, which is an admin's to act
    // on. A staff member's own pending requests are not a queue anyone is waiting on,
    // so badging them would be a permanent unactionable number.
    final isAdmin = ref.watch(isAdminProvider);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.aauGrayLine)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 62,
          child: Row(
            children: [
              _TabSlot(
                icon: Icons.space_dashboard_outlined,
                activeIcon: Icons.space_dashboard,
                label: 'Home',
                active: currentPath.startsWith('/dashboard'),
                onTap: () => context.go('/dashboard'),
              ),
              _TabSlot(
                icon: Icons.qr_code_scanner,
                activeIcon: Icons.qr_code_scanner,
                label: 'Scan',
                active: currentPath.startsWith('/scan'),
                raised: true,
                onTap: () => context.go('/scan'),
              ),
              _TabSlot(
                icon: Icons.inventory_2_outlined,
                activeIcon: Icons.inventory_2,
                label: 'Items',
                active: currentPath.startsWith('/item'),
                onTap: () => context.go('/items'),
              ),
              _TabSlot(
                icon: Icons.assignment_outlined,
                activeIcon: Icons.assignment,
                label: 'Requests',
                active: currentPath.startsWith('/requests'),
                badgeCount: isAdmin ? pending : null,
                onTap: () => context.go('/requests'),
              ),
              _TabSlot(
                icon: Icons.more_horiz,
                activeIcon: Icons.more_horiz,
                label: 'More',
                active: false,
                onTap: () => showMoreSheet(context, ref),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The pending count, and — the point of this provider existing — **not fetched at
/// all for a staff session**. An admin's badge is a real queue; a staff member's
/// would be a number with nothing behind it, so the request is not made.
final pendingCountForTabBar = Provider<int>((ref) {
  if (!ref.watch(isAdminProvider)) return 0;
  return ref.watch(pendingRequestCountProvider).value ?? 0;
});

class _TabSlot extends StatelessWidget {
  const _TabSlot({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.active,
    required this.onTap,
    this.badgeCount,
    this.raised = false,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  final int? badgeCount;
  final bool raised;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.brand600 : AppColors.aauGray500;

    return Expanded(
      child: Semantics(
        selected: active,
        button: true,
        label: label,
        child: InkWell(
          onTap: onTap,
          // The ripple is suppressed on the raised slot: it sits above the bar's
          // own surface, so a rectangular splash would spill outside the circle.
          child: SizedBox.expand(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (raised)
                  Container(
                    width: 44,
                    height: 30,
                    decoration: const BoxDecoration(
                      color: AppColors.accent600,
                      borderRadius: BorderRadius.all(Radius.circular(999)),
                    ),
                    child: const Icon(Icons.qr_code_scanner, size: 20, color: Colors.white),
                  )
                else
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Icon(active ? activeIcon : icon, size: 23, color: color),
                      if ((badgeCount ?? 0) > 0)
                        Positioned(
                          top: -4,
                          right: -8,
                          child: Container(
                            constraints: const BoxConstraints(minWidth: 16),
                            padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 0.5),
                            decoration: const BoxDecoration(
                              color: AppColors.danger600,
                              borderRadius: BorderRadius.all(Radius.circular(999)),
                            ),
                            child: Text(
                              badgeCount! > 9 ? '9+' : '$badgeCount',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                                height: 1.5,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                const SizedBox(height: 3),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10.5,
                    // Weight accompanies colour, never colour alone (§12).
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    color: raised ? AppColors.accent700 : color,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The "More" sheet.
///
/// A sheet rather than a sixth tab, and it duplicates the Notifications badge from
/// the top bar so it is reachable one-handed — which is the whole point of the
/// mobile shell (§5.5).
Future<void> showMoreSheet(BuildContext context, WidgetRef ref) {
  final auth = ref.read(authProvider);
  final user = auth.user;
  final unread = ref.read(unreadCountProvider).value ?? 0;

  return showAppSheet<void>(
    context,
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: AppSpace.s2),
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: const BoxDecoration(
                color: AppColors.aauGray300,
                borderRadius: BorderRadius.all(Radius.circular(999)),
              ),
            ),
          ),
          if (user != null) ...[
            const SizedBox(height: AppSpace.s4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.s4),
              child: Row(
                children: [
                  InitialsAvatar(initial: user.initial, id: user.id, size: 44),
                  const SizedBox(width: AppSpace.s3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.fullName,
                          style: const TextStyle(
                            fontSize: 15.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.aauGray900,
                          ),
                        ),
                        Text(
                          user.email,
                          style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
                        ),
                      ],
                    ),
                  ),
                  RoleBadge(role: user.role, dense: true),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpace.s4),
          const Divider(height: 1),
          _MoreRow(
            icon: Icons.play_circle_outline,
            label: 'Start an audit',
            onTap: () {
              Navigator.of(context).pop();
              context.push('/audit/new');
            },
          ),
          _MoreRow(
            icon: Icons.history,
            label: 'Audit history',
            onTap: () {
              Navigator.of(context).pop();
              context.push('/audits');
            },
          ),
          _MoreRow(
            icon: Icons.bar_chart_outlined,
            label: 'Reports',
            onTap: () {
              Navigator.of(context).pop();
              context.push('/reports');
            },
          ),
          _MoreRow(
            icon: Icons.notifications_outlined,
            label: 'Notifications',
            badgeCount: unread,
            onTap: () {
              Navigator.of(context).pop();
              context.push('/notifications');
            },
          ),
          // Staff-only as far as the sheet goes: `/map` itself is open to everyone,
          // but a signed-in user reaching it from the workbench is the one who came
          // here looking for it, since the public shell already carries the link.
          _MoreRow(
            icon: Icons.map_outlined,
            label: 'Browse by building',
            onTap: () {
              Navigator.of(context).pop();
              context.push('/map');
            },
          ),
          if (auth.isAdmin) ...[
            const Divider(height: 1),
            const _MoreSectionLabel('Administration'),
            _MoreRow(
              icon: Icons.verified_user_outlined,
              label: 'Accounts',
              onTap: () {
                Navigator.of(context).pop();
                context.push('/admin/users');
              },
            ),
            _MoreRow(
              icon: Icons.sell_outlined,
              label: 'Categories',
              onTap: () {
                Navigator.of(context).pop();
                context.push('/admin/categories');
              },
            ),
          ],
          const Divider(height: 1),
          _MoreRow(
            icon: Icons.person_outline,
            label: 'Profile',
            onTap: () {
              Navigator.of(context).pop();
              context.push('/profile');
            },
          ),
          _MoreRow(
            icon: Icons.lock_outline,
            label: 'Change password',
            onTap: () {
              Navigator.of(context).pop();
              context.push('/change-password');
            },
          ),
          _MoreRow(
            icon: Icons.logout,
            label: 'Sign out',
            destructive: true,
            onTap: () async {
              Navigator.of(context).pop();
              final confirmed = await showConfirmDialog(
                context,
                title: 'Sign out?',
                body: 'You will need your email and password to sign back in. '
                    'Anything you have not submitted is discarded.',
                confirmLabel: 'Sign out',
                destructive: true,
                icon: Icons.logout,
              );
              if (confirmed) await ref.read(authProvider.notifier).logout();
            },
          ),
          const SizedBox(height: AppSpace.s4),
        ],
      ),
    ),
  );
}

class _MoreSectionLabel extends StatelessWidget {
  const _MoreSectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.s4,
          AppSpace.s3,
          AppSpace.s4,
          AppSpace.s1,
        ),
        child: Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            color: AppColors.aauGray400,
          ),
        ),
      );
}

class _MoreRow extends StatelessWidget {
  const _MoreRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badgeCount,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int? badgeCount;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.danger700 : AppColors.aauGray800;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.s4,
          vertical: AppSpace.s3,
        ),
        child: Row(
          children: [
            Icon(icon, size: 21, color: destructive ? AppColors.danger600 : AppColors.aauGray500),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: Text(
                label,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: color),
              ),
            ),
            if ((badgeCount ?? 0) > 0) ...[
              Container(
                constraints: const BoxConstraints(minWidth: 20),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: const BoxDecoration(
                  color: AppColors.danger600,
                  borderRadius: BorderRadius.all(Radius.circular(999)),
                ),
                child: Text(
                  badgeCount! > 9 ? '9+' : '$badgeCount',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    height: 1.3,
                  ),
                ),
              ),
              const SizedBox(width: AppSpace.s2),
            ],
            const Icon(Icons.chevron_right, size: 20, color: AppColors.aauGray400),
          ],
        ),
      ),
    );
  }
}
