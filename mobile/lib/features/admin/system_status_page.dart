import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../data/providers/system_provider.dart';
import '../../models/system.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/charts.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/admin/system` — the build facts, and the **shape** of the college's
/// register.
///
/// "Is it up?" is one line of this screen. The rest is what an administrator
/// actually opens it for: how many accounts there are and how they arrived, what
/// the assets look like and where they sit, what the decisions were, and whether
/// requests are moving. The graphs are the web status page's four, drawn with
/// the same plain widgets (no chart package) in the same order, so a person
/// reading one screen and then the other is not re-learning the layout.
class SystemStatusPage extends ConsumerWidget {
  const SystemStatusPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(systemStatusProvider);
    final stats = ref.watch(systemStatisticsProvider);

    return PageScaffold(
      title: 'System status',
      subtitle: 'The build facts, and the shape of the college\u2019s register',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(systemStatusProvider);
        ref.invalidate(systemStatisticsProvider);
        await Future.wait([
          ref.read(systemStatusProvider.future),
          ref.read(systemStatisticsProvider.future),
        ]);
      },
      children: [
        status.when(
          loading: () => const AppCard(child: SkeletonList(count: 3, height: 28)),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(systemStatusProvider),
          ),
          data: (data) => AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Fact(label: 'Environment', value: data.environment),
                _Fact(label: 'Version', value: data.version, mono: true),
                _Fact(
                  label: 'Uptime',
                  value: '${formatUptimeLabel(data.uptime)} \u00b7 of the instance serving this request',
                ),
                _Fact(
                  label: 'Deployed',
                  value: data.builtAt == null
                      ? 'Not recorded'
                      : formatDateTimeUtc(data.builtAt) ?? 'Not recorded',
                  hint: data.startedAt == null
                      ? null
                      : 'Instance since ${formatRelativeTime(data.startedAt)}',
                ),
                _Fact(label: 'Database', value: data.database, last: true),
              ],
            ),
          ),
        ),

        const SizedBox(height: AppSpace.s6),
        stats.when(
          loading: () => const SkeletonList(count: 3, height: 140),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(systemStatisticsProvider),
          ),
          data: (data) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _AccountsCard(accounts: data.accounts),
              const SizedBox(height: AppSpace.s4),
              _AssetsCard(items: data.items),
              const SizedBox(height: AppSpace.s4),
              _DecisionsCard(decisions: data.decisions),
              const SizedBox(height: AppSpace.s4),
              _InFlightCard(requests: data.requests),
            ],
          ),
        ),
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({
    required this.label,
    required this.value,
    this.hint,
    this.mono = false,
    this.last = false,
  });

  final String label;
  final String value;
  final String? hint;
  final bool mono;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : AppSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 10.5,
              letterSpacing: 0.6,
              color: AppColors.aauGray500,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.aauGray900,
              fontFamily: mono ? 'monospace' : null,
            ),
          ),
          if (hint != null)
            Text(
              hint!,
              style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray400),
            ),
        ],
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.icon, required this.title, required this.children});

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 17, color: AppColors.aauGray400),
              const SizedBox(width: AppSpace.s2),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s4),
          ...children,
        ],
      ),
    );
  }
}

/// A big total, the words "total accounts", and the two charts under it.
class _AccountsCard extends StatelessWidget {
  const _AccountsCard({required this.accounts});

  final AccountStatistics accounts;

  @override
  Widget build(BuildContext context) {
    return _ChartCard(
      icon: Icons.people_alt_outlined,
      title: 'Accounts',
      children: [
        Text(
          '${accounts.total}',
          style: const TextStyle(
            fontSize: 30,
            fontWeight: FontWeight.w700,
            height: 1.1,
            color: AppColors.aauGray900,
          ),
        ),
        const SizedBox(height: AppSpace.s3),
        BarChart(
          items: [
            for (final entry in accounts.byStatus.entries)
              ChartDatum(label: _titleCase(entry.key), count: entry.value),
          ],
          emptyMessage: 'No accounts recorded yet.',
        ),
        const SizedBox(height: AppSpace.s3),
        const _ChartLabel('New accounts, last six months'),
        const SizedBox(height: AppSpace.s2),
        MonthColumns(
          months: [
            for (final month in accounts.perMonth)
              (label: month.shortLabel, count: month.count),
          ],
        ),
      ],
    );
  }
}

class _AssetsCard extends StatelessWidget {
  const _AssetsCard({required this.items});

  final ItemStatistics items;

  @override
  Widget build(BuildContext context) {
    return _ChartCard(
      icon: Icons.inventory_2_outlined,
      title: 'Assets',
      children: [
        Text(
          '${items.total}',
          style: const TextStyle(
            fontSize: 30,
            fontWeight: FontWeight.w700,
            height: 1.1,
            color: AppColors.aauGray900,
          ),
        ),
        const SizedBox(height: AppSpace.s3),
        BarChart(
          items: [
            for (final entry in items.byStatus.entries)
              ChartDatum(label: _titleCase(entry.key), count: entry.value),
          ],
          tone: ChartTone.success,
          emptyMessage: 'No items registered yet.',
        ),
        if (items.byDepartment.isNotEmpty) ...[
          const SizedBox(height: AppSpace.s3),
          const _ChartLabel('By department'),
          const SizedBox(height: AppSpace.s2),
          BarChart(
            items: [
              for (final row in items.byDepartment.take(6))
                ChartDatum(label: row.label, count: row.count),
            ],
            tone: ChartTone.brand,
          ),
        ],
      ],
    );
  }
}

class _DecisionsCard extends StatelessWidget {
  const _DecisionsCard({required this.decisions});

  final List<CountRow> decisions;

  @override
  Widget build(BuildContext context) {
    return _ChartCard(
      icon: Icons.fact_check_outlined,
      title: 'Decisions',
      children: [
        BarChart(
          items: [
            for (final row in decisions.take(6))
              ChartDatum(label: _titleCase(row.label), count: row.count),
          ],
          tone: ChartTone.accent,
          emptyMessage: 'No decisions recorded yet.',
        ),
      ],
    );
  }
}

class _InFlightCard extends StatelessWidget {
  const _InFlightCard({required this.requests});

  final CountStatistics requests;

  @override
  Widget build(BuildContext context) {
    return _ChartCard(
      icon: Icons.timeline_outlined,
      title: 'In flight',
      children: [
        BarChart(
          items: [
            for (final entry in requests.byStatus.entries)
              ChartDatum(label: _titleCase(entry.key), count: entry.value),
          ],
          tone: ChartTone.warning,
          emptyMessage: 'No requests filed yet.',
        ),
        if (requests.byType.isNotEmpty) ...[
          const SizedBox(height: AppSpace.s3),
          const _ChartLabel('By type'),
          const SizedBox(height: AppSpace.s2),
          BarChart(
            items: [
              for (final entry in requests.byType.entries)
                ChartDatum(label: _titleCase(entry.key), count: entry.value),
            ],
            tone: ChartTone.neutral,
          ),
        ],
      ],
    );
  }
}

class _ChartLabel extends StatelessWidget {
  const _ChartLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: const TextStyle(
      fontSize: 10.5,
      letterSpacing: 0.6,
      color: AppColors.aauGray500,
    ),
  );
}

/// `pending approval` → `Pending approval`, without touching acronyms inside the
/// word (the API's labels are single words or two-word phrases).
String _titleCase(String value) {
  if (value.isEmpty) return value;
  return '${value[0].toUpperCase()}${value.substring(1)}';
}
