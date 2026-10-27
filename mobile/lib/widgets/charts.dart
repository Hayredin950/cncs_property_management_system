import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The two shapes every graph on these screens uses — plain widgets, no chart
/// package.
///
/// The web app draws the same four graphs with CSS bars, for the same reason: a
/// chart library is a dependency and a bundle for counts a person reads once to
/// see whether the college is being used. Here the widgets are a labelled bar
/// list (statuses, departments, decisions) and a column strip (accounts per
/// month), and both scale to the largest value in their own set.

/// Semantic tones, matching the web's `bg-*-500` scale.
enum ChartTone { brand, success, accent, warning, neutral }

Color _toneColor(ChartTone tone) => switch (tone) {
  ChartTone.brand => AppColors.brand600,
  ChartTone.success => AppColors.success600,
  ChartTone.accent => AppColors.accent600,
  ChartTone.warning => AppColors.warning600,
  ChartTone.neutral => AppColors.aauGray400,
};

/// One labelled count.
class ChartDatum {
  const ChartDatum({required this.label, required this.count});

  final String label;
  final int count;
}

/// A labelled horizontal bar per row, scaled to the largest count.
///
/// The count is always printed: a bar is a comparison, and the number is what
/// the reader actually came for.
class BarChart extends StatelessWidget {
  const BarChart({
    super.key,
    required this.items,
    this.tone = ChartTone.brand,
    this.emptyMessage = 'Nothing recorded yet.',
  });

  final List<ChartDatum> items;
  final ChartTone tone;
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Text(
        emptyMessage,
        style: const TextStyle(fontSize: 13, color: AppColors.aauGray500),
      );
    }
    final max = items.map((item) => item.count).fold<int>(1, (a, b) => b > a ? b : a);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final item in items) ...[
          Semantics(
            label: '${item.label}: ${item.count}',
            child: Row(
              children: [
                SizedBox(
                  width: 110,
                  child: Text(
                    item.label,
                    // Two lines, not one: "Pending email verification" is the
                    // longest status the system records, and truncating it to
                    // "Pending approv…" made two different statuses read the
                    // same on the phone.
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppColors.aauGray600, height: 1.25),
                  ),
                ),
                const SizedBox(width: AppSpace.s2),
                Expanded(
                  child: Container(
                    height: 12,
                    decoration: const BoxDecoration(
                      color: AppColors.aauGray100,
                      borderRadius: AppRadius.smAll,
                    ),
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      // A non-zero count always gets a visible sliver: a 1-of-80
                      // row that renders as an empty track reads as zero.
                      widthFactor: item.count == 0 ? 0 : (item.count / max).clamp(0.03, 1.0),
                      child: Container(
                        decoration: BoxDecoration(
                          color: _toneColor(tone),
                          borderRadius: AppRadius.smAll,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.s2),
                SizedBox(
                  width: 32,
                  child: Text(
                    '${item.count}',
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.aauGray600,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
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

/// A column per month — the growth strip above the status lists.
class MonthColumns extends StatelessWidget {
  const MonthColumns({
    super.key,
    required this.months,
    this.tone = ChartTone.brand,
    this.height = 64,
  });

  /// Each entry is a short month label (`05`) and its count.
  final List<({String label, int count})> months;
  final ChartTone tone;
  final double height;

  @override
  Widget build(BuildContext context) {
    if (months.isEmpty) {
      return const Text(
        'No months recorded yet.',
        style: TextStyle(fontSize: 13, color: AppColors.aauGray500),
      );
    }
    final max = months.map((month) => month.count).fold<int>(1, (a, b) => b > a ? b : a);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final month in months)
          Expanded(
            child: Semantics(
              label: '${month.label}: ${month.count} accounts',
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${month.count}',
                    style: const TextStyle(fontSize: 11, color: AppColors.aauGray600),
                  ),
                  const SizedBox(height: 2),
                  Container(
                    // The same floor the web uses: a zero month is still a tick on
                    // the axis, and a month with one account is not invisible.
                    height: month.count == 0 ? 4 : (month.count / max * height).clamp(4.0, height),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: _toneColor(tone),
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    month.label,
                    style: const TextStyle(fontSize: 10, color: AppColors.aauGray400),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
