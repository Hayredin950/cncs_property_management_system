import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/dashboard_provider.dart';
import '../../data/providers/system_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../data/providers/items_provider.dart';
import '../../data/providers/requests_provider.dart';
import '../../models/request.dart';
import '../../models/system.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badge.dart';
import '../../widgets/charts.dart';
import '../../widgets/data_display.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../../widgets/status_badges.dart';
import '../items/widgets/item_card.dart';

/// `/dashboard` — "quick orientation, not a data dump" (§10.4).
///
/// Three numbers, three shortcuts, and a short preview of the queue. The mobile
/// layout is exactly what the spec asks for at this width: the StatCards become a
/// **horizontally-scrolling row of three** rather than three stacked full-width
/// cards, because "three numbers are worth a swipe, not three full-width screens".
///
/// The preview list's heading changes with the role — "Needs your review" for an
/// admin, "Your recent requests" for a staff member — but the **data** does not:
/// `GET /requests` already scopes by role server-side, so this screen asks once and
/// renders whatever came back rather than branching on the role client-side and
/// risking a disagreement with the API.
class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final stats = ref.watch(dashboardStatsProvider);
    final preview = ref.watch(dashboardPreviewProvider);
    // The SYSTEM_ADMIN is an account role: no register, no audits, no requests of
    // its own. Rendering the three skeleton cards and then three zeros would tell
    // it the register is empty rather than out of scope (spec 2.1.1).
    final showsStats = auth.seesAssetData || auth.canViewOwnRequests;
    final hasShortcuts =
        auth.canCreateItems ||
        auth.canRunAudits ||
        (auth.seesAssetData && !auth.canRunAudits);

    return PageScaffold(
      title: 'Dashboard',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(dashboardStatsProvider);
        ref.invalidate(dashboardPreviewProvider);
        await ref.read(dashboardStatsProvider.future);
      },
      children: [
        // The account role's dashboard used to be a title and one button, which
        // read as "the register is empty" rather than "the register is not your
        // job" (spec 2.1.1). It now answers the two questions an administrator
        // opens the app with: is anybody waiting, and how many accounts exist.
        if (auth.canManageAccounts) ...[
          _adminOverview(context, ref),
          const SizedBox(height: AppSpace.s6),
        ],
        if (showsStats)
          stats.when(
            loading: () => const Row(
              children: [
                Expanded(child: _StatSkeleton()),
                SizedBox(width: AppSpace.s3),
                Expanded(child: _StatSkeleton()),
              ],
            ),
            error: (error, _) => InlineError(
              error: error,
              onRetry: () => ref.invalidate(dashboardStatsProvider),
            ),
            data: (data) => SizedBox(
              height: 116,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: EdgeInsets.zero,
                children: [
                  if (auth.canViewOwnRequests)
                    SizedBox(
                      width: 150,
                      child: StatCard(
                        value: '${data.pendingReview}',
                        // `pending-count` is scoped: a reviewer sees the queue they
                        // decide, everyone else sees their own pending requests. The
                        // old single label called both "Pending review".
                        label: auth.canDecideRequests
                            ? 'Pending review'
                            : 'Awaiting decision',
                        icon: Icons.schedule_outlined,
                        tone: BadgeTone.warning,
                        onTap: () => context.push('/requests'),
                      ),
                    ),
                  if (auth.seesAssetData) ...[
                    if (auth.canViewOwnRequests)
                      const SizedBox(width: AppSpace.s3),
                    SizedBox(
                      width: 150,
                      child: StatCard(
                        value: '${data.itemsTracked}',
                        label: 'Items tracked',
                        icon: Icons.inventory_2_outlined,
                        tone: BadgeTone.brand,
                        onTap: () => context.go('/items'),
                      ),
                    ),
                  ],
                  // `GET /audits` is gated by AUDIT_VIEW. Null means this role has
                  // no such right, so there is no request to make and no card to
                  // show — a card that fires it anyway is the 403 banner a Staff
                  // account met on a real device.
                  if (data.auditsRun != null) ...[
                    const SizedBox(width: AppSpace.s3),
                    SizedBox(
                      width: 150,
                      child: StatCard(
                        value: '${data.auditsRun}',
                        label: 'Audits run',
                        icon: Icons.fact_check_outlined,
                        tone: BadgeTone.success,
                        onTap: () => context.push('/audits'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

        // Every shortcut below is a capability, not a role: a button that leads to
        // a route guard is a dead end that looks like a feature.
        if (hasShortcuts) ...[
          const SizedBox(height: AppSpace.s6),
          const SectionHeader(title: 'Shortcuts'),
        ],
        if (auth.canCreateItems)
          AppButton(
            label: 'Register an item',
            icon: Icons.add_box_outlined,
            variant: AppButtonVariant.primary,
            size: AppButtonSize.lg,
            expand: true,
            onPressed: () => context.push('/items/new'),
          ),
        if (auth.canRunAudits) const SizedBox(height: AppSpace.s2),
        if (auth.canRunAudits)
          AppButton(
            label: 'Start an audit',
            icon: Icons.fact_check_outlined,
            variant: auth.canCreateItems
                ? AppButtonVariant.outline
                : AppButtonVariant.primary,
            size: auth.canCreateItems ? AppButtonSize.md : AppButtonSize.lg,
            expand: true,
            onPressed: () => context.push('/audit/new'),
          ),
        // The auditor's work starts in a session; browsing the register is not a
        // step in it (the web dashboard makes the same exclusion).
        if (auth.seesAssetData && !auth.canRunAudits)
          const SizedBox(height: AppSpace.s2),
        if (auth.seesAssetData && !auth.canRunAudits)
          AppButton(
            label: 'Scan a tag',
            icon: Icons.qr_code_scanner,
            variant: AppButtonVariant.outline,
            expand: true,
            onPressed: () => context.go('/scan'),
          ),
        if (auth.canViewOwnRequests) ...[
          const SizedBox(height: AppSpace.s6),
          preview.when(
            loading: () => const Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(title: 'Requests'),
                SkeletonList(count: 2, height: 86),
              ],
            ),
            error: (error, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(title: 'Requests'),
                InlineError(
                  error: error,
                  onRetry: () => ref.invalidate(dashboardPreviewProvider),
                ),
              ],
            ),
            data: (response) => _preview(
              context,
              ref,
              response.requests,
              pendingCount: stats.value?.pendingReview,
            ),
          ),
        ],

        if (auth.seesAssetData) ...[
          const SizedBox(height: AppSpace.s6),
          SectionHeader(title: 'My holdings'),
          ref
              .watch(myHoldingsProvider)
              .when(
                loading: () => const SkeletonList(count: 2, height: 92),
                error: (error, _) => InlineError(
                  error: error,
                  onRetry: () => ref.invalidate(myHoldingsProvider),
                ),
                data: (response) {
                  final items = response.items.take(3).toList();
                  if (items.isEmpty) {
                    return const AppCard(
                      child: Text(
                        'You are not holding anything right now. Items you borrow or are '
                        'assigned to you will appear here.',
                        style: TextStyle(
                          fontSize: 13.5,
                          color: AppColors.aauGray500,
                          height: 1.5,
                        ),
                      ),
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in items) ...[
                        ItemCard(
                          item: item,
                          onTap: () => context.push('/items/${item.id}'),
                        ),
                        const SizedBox(height: AppSpace.s2),
                      ],
                    ],
                  );
                },
              ),

          const SizedBox(height: AppSpace.s6),
          SectionHeader(title: 'Recently registered'),
          ref
              .watch(recentItemsProvider)
              .when(
                loading: () => const SkeletonList(count: 2, height: 92),
                error: (error, _) => InlineError(
                  error: error,
                  onRetry: () => ref.invalidate(recentItemsProvider),
                ),
                data: (response) {
                  final items = response.items.take(3).toList();
                  if (items.isEmpty) {
                    return const AppCard(
                      child: Text(
                        'No items registered yet. Register the first one to get started.',
                        style: TextStyle(
                          fontSize: 13.5,
                          color: AppColors.aauGray500,
                          height: 1.5,
                        ),
                      ),
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in items) ...[
                        ItemCard(
                          item: item,
                          onTap: () => context.push('/items/${item.id}'),
                        ),
                        const SizedBox(height: AppSpace.s2),
                      ],
                    ],
                  );
                },
              ),
        ],
      ],
    );
  }

  /// The account role's dashboard: two numbers, two jobs, and the queue itself.
  ///
  /// Each tile names the section it opens (`/admin/users?section=…`) rather than
  /// dropping the administrator on a screen and letting them find the tab — the
  /// same three sections the Accounts screen shows, reached in one tap.
  Widget _adminOverview(BuildContext context, WidgetRef ref) {
    final approvals = ref.watch(approvalsProvider);
    final accounts = ref.watch(usersProvider);
    final pending = approvals.value;
    final pendingCount = pending?.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 116,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.zero,
            children: [
              SizedBox(
                width: 150,
                child: StatCard(
                  value: pendingCount?.toString() ?? '—',
                  label: 'Waiting for approval',
                  icon: Icons.how_to_reg_outlined,
                  tone: BadgeTone.warning,
                  onTap: () => context.push('/admin/users?section=requests'),
                ),
              ),
              const SizedBox(width: AppSpace.s3),
              SizedBox(
                width: 150,
                child: StatCard(
                  value: accounts.value?.length.toString() ?? '—',
                  label: 'Accounts',
                  icon: Icons.people_alt_outlined,
                  tone: BadgeTone.brand,
                  onTap: () => context.push('/admin/users?section=accounts'),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpace.s5),
        SectionHeader(
          title: 'Account requests',
          subtitle: pending == null
              ? 'Loading the queue…'
              : pending.isEmpty
              ? 'Nobody is waiting to sign in.'
              : 'Oldest first. Approving assigns the real role; rejecting needs '
                    'a reason.',
        ),
        if (approvals.hasError)
          InlineError(
            error: approvals.error!,
            onRetry: () => ref.invalidate(approvalsProvider),
          )
        else if (pendingCount == null)
          const SkeletonList(count: 1, height: 72)
        else if (pending!.isEmpty)
          AppButton(
            label: 'Invite an account',
            icon: Icons.person_add_alt,
            variant: AppButtonVariant.outline,
            expand: true,
            onPressed: () => context.push('/admin/users?section=invite'),
          )
        else ...[
          for (final account in pending.take(3)) ...[
            AppCard(
              padding: const EdgeInsets.all(AppSpace.s3),
              child: Row(
                children: [
                  InitialsAvatar(
                    initial: account.fullName.isEmpty
                        ? '?'
                        : account.fullName.substring(0, 1),
                    id: account.id,
                  ),
                  const SizedBox(width: AppSpace.s3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          account.fullName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppColors.aauGray900,
                          ),
                        ),
                        Text(
                          account.email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.aauGray600,
                          ),
                        ),
                        Text(
                          'Requested ${formatDateUtc(account.createdAt) ?? ''}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.aauGray400,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: AppColors.aauGray400,
                  ),
                ],
              ),
              onTap: () => context.push('/admin/users?section=requests'),
            ),
            const SizedBox(height: AppSpace.s2),
          ],
          AppButton(
            label: pendingCount > 3
                ? 'Review all $pendingCount requests'
                : 'Review requests',
            icon: Icons.how_to_reg_outlined,
            expand: true,
            onPressed: () => context.push('/admin/users?section=requests'),
          ),
        ],
        const SizedBox(height: AppSpace.s2),
        AppButton(
          label: 'All accounts',
          icon: Icons.people_alt_outlined,
          variant: AppButtonVariant.ghost,
          expand: true,
          onPressed: () => context.push('/admin/users?section=accounts'),
        ),

        // The graphs. The web status page draws these four for the same reason
        // the dashboard carries two of them: an administrator's first question
        // is "how much is in here and is it growing?", and a count in a table
        // does not answer that the way a strip of columns does.
        const SizedBox(height: AppSpace.s6),
        SectionHeader(
          title: 'Usage',
          subtitle:
              'Counts, not rows — the shape of the register, not its contents.',
          actionLabel: 'Full status',
          onAction: () => context.push('/admin/system'),
        ),
        _UsageCard(statistics: ref.watch(systemStatisticsProvider)),

        const SizedBox(height: AppSpace.s6),
        SectionHeader(
          title: 'Activity',
          subtitle:
              'The last few decisions the system recorded about accounts.',
          actionLabel: 'All events',
          onAction: () => context.push('/admin/events'),
        ),
        _ActivityCard(events: ref.watch(recentSystemEventsProvider)),

        const SizedBox(height: AppSpace.s6),
        SectionHeader(title: 'System'),
        _SystemCard(status: ref.watch(systemStatusProvider)),
        const SizedBox(height: AppSpace.s3),
        AppButton(
          label: 'Departments',
          icon: Icons.account_tree_outlined,
          variant: AppButtonVariant.outline,
          expand: true,
          onPressed: () => context.push('/admin/departments'),
        ),
      ],
    );
  }

  Widget _preview(
    BuildContext context,
    WidgetRef ref,
    List<RequestSummary> requests, {
    int? pendingCount,
  }) {
    final decidesRequests = ref.watch(canDecideRequestsProvider);

    if (requests.isEmpty) {
      // The count and the list are two requests: if the list is empty but the
      // count says something is pending, the honest sentence names the number and
      // offers the queue rather than telling a reviewer their queue is empty.
      final stale = decidesRequests && (pendingCount ?? 0) > 0;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHeader(
            title: decidesRequests
                ? 'Needs your review'
                : 'Your recent requests',
          ),
          AppCard(
            child: Text(
              stale
                  ? '$pendingCount pending in the queue — open Requests to see them.'
                  : 'Nothing waiting on you. New requests will show up here.',
              style: const TextStyle(
                fontSize: 13.5,
                color: AppColors.aauGray500,
                height: 1.5,
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: decidesRequests ? 'Needs your review' : 'Your recent requests',
          actionLabel: 'View all',
          onAction: () {
            // The heading says "Needs your review", so the list it opens is that
            // queue — pending, not every request ever filed.
            if (decidesRequests) {
              ref.read(requestQueryProvider.notifier).setStatus('PENDING');
            }
            context.push('/requests');
          },
        ),
        for (final request in requests) ...[
          AppCard(
            onTap: () => context.push('/requests/${request.id}'),
            padding: const EdgeInsets.all(AppSpace.s3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        request.item.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.aauGray900,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpace.s2),
                    RequestStatusBadge(status: request.status, dense: true),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    RequestTypeBadge(type: request.type, dense: true),
                    const SizedBox(width: AppSpace.s2),
                    Expanded(
                      child: Text(
                        formatRelativeTime(request.createdAt),
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.aauGray500,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.s2),
        ],
      ],
    );
  }
}

class _StatSkeleton extends StatelessWidget {
  const _StatSkeleton();

  @override
  Widget build(BuildContext context) => const AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SkeletonBox(height: 26, width: 60),
        SizedBox(height: AppSpace.s2),
        SkeletonBox(height: 12, width: 90),
      ],
    ),
  );
}

/// The dashboard's two graphs: growth over six months, and the account mix.
///
/// Deliberately the two of the status page's four that answer "how much and how
/// is it growing". Assets and decisions stay on the status screen: a dashboard
/// that shows everything is a status page, and an administrator then has two of
/// them.
class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.statistics});

  final AsyncValue<SystemStatistics> statistics;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: statistics.when(
        loading: () => const SkeletonList(count: 2, height: 40),
        error: (error, _) => const Text(
          'The usage numbers could not be loaded.',
          style: TextStyle(fontSize: 13, color: AppColors.aauGray500),
        ),
        data: (data) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${data.accounts.total}',
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    height: 1.1,
                    color: AppColors.aauGray900,
                  ),
                ),
                const SizedBox(width: AppSpace.s2),
                const Padding(
                  padding: EdgeInsets.only(bottom: 3),
                  child: Text(
                    'accounts',
                    style: TextStyle(fontSize: 13, color: AppColors.aauGray500),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.s4),
            const Text(
              'NEW ACCOUNTS, LAST SIX MONTHS',
              style: TextStyle(
                fontSize: 10.5,
                letterSpacing: 0.6,
                color: AppColors.aauGray500,
              ),
            ),
            const SizedBox(height: AppSpace.s2),
            MonthColumns(
              months: [
                for (final month in data.accounts.perMonth)
                  (label: month.shortLabel, count: month.count),
              ],
            ),
            const SizedBox(height: AppSpace.s4),
            BarChart(
              items: [
                for (final entry in data.accounts.byStatus.entries)
                  ChartDatum(label: _capitalise(entry.key), count: entry.value),
              ],
              emptyMessage: 'No accounts recorded yet.',
            ),
          ],
        ),
      ),
    );
  }
}

/// The activity strip: five rows, newest first, naming who acted on whom.
class _ActivityCard extends StatelessWidget {
  const _ActivityCard({required this.events});

  final AsyncValue<SystemEventsSlice> events;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: events.when(
        loading: () => const SkeletonList(count: 3, height: 34),
        error: (error, _) => const Text(
          'The account log could not be loaded.',
          style: TextStyle(fontSize: 13, color: AppColors.aauGray500),
        ),
        data: (slice) {
          if (slice.events.isEmpty) {
            return const Text(
              'Nothing has been recorded yet. Approvals, invitations and role changes '
              'appear here.',
              style: TextStyle(
                fontSize: 13.5,
                color: AppColors.aauGray500,
                height: 1.5,
              ),
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, event) in slice.events.indexed) ...[
                if (index > 0) const Divider(height: AppSpace.s4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Icon(
                        Icons.history,
                        size: 15,
                        color: AppColors.aauGray400,
                      ),
                    ),
                    const SizedBox(width: AppSpace.s2),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event.actionLabel,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.aauGray800,
                            ),
                          ),
                          Text(
                            event.message,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.4,
                              color: AppColors.aauGray600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpace.s2),
                    Text(
                      formatRelativeTime(event.timestamp),
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.aauGray400,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Environment, version and uptime in one line, with the date of the build.
class _SystemCard extends StatelessWidget {
  const _SystemCard({required this.status});

  final AsyncValue<SystemStatusInfo> status;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: status.when(
        loading: () => const SkeletonList(count: 1, height: 30),
        error: (error, _) => const Text(
          'The build facts could not be loaded.',
          style: TextStyle(fontSize: 13, color: AppColors.aauGray500),
        ),
        data: (data) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${_capitalise(data.environment)} · v${data.version}',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.aauGray900,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Up ${formatUptimeLabel(data.uptime)} · deployed '
              '${data.builtAt == null ? 'before the build stamp' : formatDateUtc(data.builtAt) ?? 'unknown'}',
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.aauGray500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _capitalise(String value) =>
    value.isEmpty ? value : '${value[0].toUpperCase()}${value.substring(1)}';
