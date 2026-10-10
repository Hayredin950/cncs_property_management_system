import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../data/providers/audits_provider.dart';
import '../../models/audit.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badge.dart';
import '../../widgets/data_display.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/audits` — the history (§10.8's last bullet).
///
/// "This is the screen that makes a stored audit findable; before it, a session was
/// reachable only by keeping its id." That is the whole purpose, and it is why the
/// rows carry the three counts inline: the counts are what you came to compare, and a
/// list that made you open every session to see them would be an index of ids rather
/// than a history.
///
/// The `mine` toggle exists because an admin's list is every session anyone ever ran,
/// and "which ones did I run" is a different question from "what has been audited".
class AuditListPage extends ConsumerWidget {
  const AuditListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audits = ref.watch(auditListProvider);
    final query = ref.watch(auditQueryProvider);

    return PageScaffold(
      title: 'Audit history',
      subtitle: 'Every session, newest first',
      maxWidth: 720,
      trailing: AppIconButton(
        icon: Icons.add,
        tooltip: 'Start an audit',
        variant: AppButtonVariant.primary,
        onPressed: () => context.push('/audit/new'),
      ),
      onRefresh: () async {
        ref.invalidate(auditListProvider);
        await ref.read(auditListProvider.future);
      },
      children: [
        Wrap(
          spacing: AppSpace.s2,
          runSpacing: AppSpace.s2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _Toggle(
              label: 'Only mine',
              icon: Icons.person_outline,
              active: query.mine,
              onTap: () => ref.read(auditQueryProvider.notifier).setMine(!query.mine),
            ),
            if (query.mine)
              AppButton(
                label: 'Show all',
                variant: AppButtonVariant.outline,
                size: AppButtonSize.sm,
                icon: Icons.groups_outlined,
                onPressed: () => ref.read(auditQueryProvider.notifier).setMine(false),
              ),
          ],
        ),
        const SizedBox(height: AppSpace.s5),

        audits.when(
          loading: () => const SkeletonList(count: 3, height: 132),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(auditListProvider),
          ),
          data: (response) {
            if (response.audits.isEmpty) {
              return query.mine
                  ? const EmptyState(
                      icon: Icons.fact_check_outlined,
                      title: 'You have not run an audit yet',
                      body: 'Start one to begin reconciling a department\u2019s inventory.',
                    )
                  : const EmptyState(
                      icon: Icons.fact_check_outlined,
                      title: 'No audits yet',
                      body: 'Start one to begin reconciling a department\u2019s inventory.',
                    );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(
                  title: '${response.total} '
                      '${response.total == 1 ? 'session' : 'sessions'}',
                ),
                for (final audit in response.audits) ...[
                  _AuditCard(audit: audit),
                  const SizedBox(height: AppSpace.stack),
                ],
                PaginationBar(
                  page: query.page,
                  totalPages:
                      ((response.total + response.limit - 1) ~/ response.limit).clamp(1, 9999),
                  onPageChanged: (page) => ref.read(auditQueryProvider.notifier).setPage(page),
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Toggle extends StatelessWidget {
  const _Toggle({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: active ? AppColors.brand600 : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(999)),
          side: BorderSide(color: active ? AppColors.brand600 : AppColors.aauGray300),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: const BorderRadius.all(Radius.circular(999)),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 15, color: active ? Colors.white : AppColors.aauGray600),
                const SizedBox(width: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                    color: active ? Colors.white : AppColors.aauGray700,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _AuditCard extends StatelessWidget {
  const _AuditCard({required this.audit});

  final AuditSessionSummary audit;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () => context.push('/audit/${audit.id}/report'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      audit.scopeValue ?? audit.scopeType,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      audit.completed
                          ? 'Completed ${formatDateUtc(audit.completedAt) ?? ''}'
                          : 'Started ${formatDateUtc(audit.startedAt) ?? ''}',
                      style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              // Colour plus text, never colour alone (§3.4).
              audit.completed
                  ? const AppBadge(
                      tone: BadgeTone.success,
                      icon: Icons.check_circle_outline,
                      label: 'Completed',
                      dense: true,
                    )
                  : const AppBadge(
                      tone: BadgeTone.warning,
                      icon: Icons.hourglass_empty,
                      label: 'In progress',
                      dense: true,
                    ),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          const Divider(height: 1),
          const SizedBox(height: AppSpace.s3),
          Row(
            children: [
              _Count(value: audit.counts.found, label: 'found', tone: AppColors.success700),
              const SizedBox(width: AppSpace.s4),
              _Count(value: audit.counts.missing, label: 'missing', tone: AppColors.danger700),
              const SizedBox(width: AppSpace.s4),
              _Count(
                value: audit.counts.locationMismatch,
                label: 'wrong place',
                tone: AppColors.warning700,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          Row(
            children: [
              InitialsAvatar(
                initial: audit.runBy.fullName.isEmpty
                    ? '?'
                    : audit.runBy.fullName.substring(0, 1),
                id: audit.runById,
                size: 24,
              ),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: Text(
                  audit.runBy.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray600),
                ),
              ),
              const Text(
                'Open report',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.brand700,
                ),
              ),
              const Icon(Icons.chevron_right, size: 18, color: AppColors.brand700),
            ],
          ),
        ],
      ),
    );
  }
}

class _Count extends StatelessWidget {
  const _Count({required this.value, required this.label, required this.tone});

  final int value;
  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$value',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: tone),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
          ),
        ],
      );
}
