import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/dashboard_provider.dart';
import '../../data/providers/items_provider.dart';
import '../../models/request.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badge.dart';
import '../../widgets/data_display.dart';
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
        (auth.seesAssetData && !auth.canRunAudits) ||
        auth.canManageAccounts;

    return PageScaffold(
      title: 'Dashboard',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(dashboardStatsProvider);
        ref.invalidate(dashboardPreviewProvider);
        await ref.read(dashboardStatsProvider.future);
      },
      children: [
        if (showsStats)
          stats.when(
            loading: () => const Row(
              children: [
                Expanded(child: _StatSkeleton()),
                SizedBox(width: AppSpace.s3),
                Expanded(child: _StatSkeleton()),
              ],
            ),
            error: (error, _) =>
                InlineError(error: error, onRetry: () => ref.invalidate(dashboardStatsProvider)),
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
                        label: auth.canDecideRequests ? 'Pending review' : 'Awaiting decision',
                        icon: Icons.schedule_outlined,
                        tone: BadgeTone.warning,
                        onTap: () => context.push('/requests'),
                      ),
                    ),
                  if (auth.seesAssetData) ...[
                    if (auth.canViewOwnRequests) const SizedBox(width: AppSpace.s3),
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
            variant: auth.canCreateItems ? AppButtonVariant.outline : AppButtonVariant.primary,
            size: auth.canCreateItems ? AppButtonSize.md : AppButtonSize.lg,
            expand: true,
            onPressed: () => context.push('/audit/new'),
          ),
        // The auditor's work starts in a session; browsing the register is not a
        // step in it (the web dashboard makes the same exclusion).
        if (auth.seesAssetData && !auth.canRunAudits) const SizedBox(height: AppSpace.s2),
        if (auth.seesAssetData && !auth.canRunAudits)
          AppButton(
            label: 'Scan a tag',
            icon: Icons.qr_code_scanner,
            variant: AppButtonVariant.outline,
            expand: true,
            onPressed: () => context.go('/scan'),
          ),
        if (auth.canManageAccounts) const SizedBox(height: AppSpace.s2),
        if (auth.canManageAccounts)
          AppButton(
            label: 'Manage accounts',
            icon: Icons.verified_user_outlined,
            variant: AppButtonVariant.primary,
            size: AppButtonSize.lg,
            expand: true,
            onPressed: () => context.push('/admin/users'),
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
                InlineError(error: error, onRetry: () => ref.invalidate(dashboardPreviewProvider)),
              ],
            ),
            data: (response) => _preview(context, ref, response.requests),
          ),
        ],

        if (auth.seesAssetData) ...[
          const SizedBox(height: AppSpace.s6),
          SectionHeader(title: 'My holdings'),
          ref
              .watch(myHoldingsProvider)
              .when(
                loading: () => const SkeletonList(count: 2, height: 92),
                error: (error, _) =>
                    InlineError(error: error, onRetry: () => ref.invalidate(myHoldingsProvider)),
                data: (response) {
                  final items = response.items.take(3).toList();
                  if (items.isEmpty) {
                    return const AppCard(
                      child: Text(
                        'You are not holding anything right now. Items you borrow or are '
                        'assigned to you will appear here.',
                        style: TextStyle(fontSize: 13.5, color: AppColors.aauGray500, height: 1.5),
                      ),
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in items) ...[
                        ItemCard(item: item, onTap: () => context.push('/items/${item.id}')),
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
                error: (error, _) =>
                    InlineError(error: error, onRetry: () => ref.invalidate(recentItemsProvider)),
                data: (response) {
                  final items = response.items.take(3).toList();
                  if (items.isEmpty) {
                    return const AppCard(
                      child: Text(
                        'No items registered yet. Register the first one to get started.',
                        style: TextStyle(fontSize: 13.5, color: AppColors.aauGray500, height: 1.5),
                      ),
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in items) ...[
                        ItemCard(item: item, onTap: () => context.push('/items/${item.id}')),
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

  Widget _preview(BuildContext context, WidgetRef ref, List<RequestSummary> requests) {
    final decidesRequests = ref.watch(canDecideRequestsProvider);

    if (requests.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHeader(title: decidesRequests ? 'Needs your review' : 'Your recent requests'),
          const AppCard(
            child: Text(
              'Nothing waiting on you. New requests will show up here.',
              style: TextStyle(fontSize: 13.5, color: AppColors.aauGray500, height: 1.5),
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
          onAction: () => context.push('/requests'),
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
                        style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
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
