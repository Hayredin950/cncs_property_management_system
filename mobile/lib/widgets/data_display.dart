import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import 'app_button.dart';
import 'badge.dart';

/// §8's `Table ⇄ ResponsiveList` — the phone half.
///
/// The design system is explicit about what a mobile data view must *not* be:
/// "never a horizontally-scrolling table, which is unusable on a phone held
/// one-handed". So a record renders as label:value pairs, stacked in one column,
/// and this is the one widget that draws them.
class FieldRow extends StatelessWidget {
  const FieldRow({
    super.key,
    required this.label,
    this.value,
    this.valueWidget,
    this.icon,
    this.layout = FieldLayout.inline,
    this.muted = false,
  });

  final String label;

  /// Rendered as text. Optional, because a row whose value is a badge, a tag ID or a
  /// copy control supplies [valueWidget] instead and has no text form at all.
  final String? value;
  final Widget? valueWidget;
  final IconData? icon;
  final FieldLayout layout;

  /// Renders the value in the muted grey, for a field whose absence is the point
  /// ("S/N —").
  final bool muted;

  @override
  Widget build(BuildContext context) {
    // `Flexible` is load-bearing: the label column is capped at 128pt, and a
    // label whose natural width exceeds that ("Registered (UTC)", "Current value")
    // would otherwise overflow its `Row` — yellow-and-black stripes in debug,
    // clipped text in release. Inside an already-constrained `ConstrainedBox` the
    // `Flexible` lets the text wrap rather than run past the edge.
    final labelWidget = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 15, color: AppColors.aauGray400),
          const SizedBox(width: 6),
        ],
        Flexible(
          child: Text(
            label,
            style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
          ),
        ),
      ],
    );

    final valueChild = valueWidget ??
        Text(
          value ?? '—',
          style: TextStyle(
            fontSize: 14,
            height: 1.4,
            color: muted || value == null
                ? AppColors.aauGray400
                : AppColors.aauGray900,
          ),
        );

    if (layout == FieldLayout.stacked) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          labelWidget,
          const SizedBox(height: 3),
          valueChild,
        ],
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 96, maxWidth: 128),
            child: labelWidget,
          ),
          const SizedBox(width: AppSpace.s3),
          Expanded(child: Align(alignment: Alignment.centerLeft, child: valueChild)),
        ],
      ),
    );
  }
}

enum FieldLayout { inline, stacked }

/// A titled block of [FieldRow]s — the detail page's "Location", "Owner",
/// "Value", "Specs" groups (§10.2).
class DetailGroup extends StatelessWidget {
  const DetailGroup({
    super.key,
    required this.title,
    this.icon,
    required this.rows,
    this.trailing,
    this.note,
  });

  final String title;
  final IconData? icon;
  final List<Widget> rows;
  final Widget? trailing;
  final String? note;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: AppColors.aauGray400),
              const SizedBox(width: 6),
            ],
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray700,
                ),
              ),
            ),
            ?trailing,
          ],
        ),
        const SizedBox(height: AppSpace.s3),
        ...rows,
        if (note != null) ...[
          const SizedBox(height: AppSpace.s2),
          Text(
            note!,
            style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.4),
          ),
        ],
      ],
    );
  }
}

/// §8's `StatCard` — the dashboard's big number. Optionally tappable, because a
/// dashboard number nobody can drill into is a decoration.
class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.value,
    required this.label,
    this.icon,
    this.tone = BadgeTone.brand,
    this.onTap,
    this.width,
  });

  final String value;
  final String label;
  final IconData? icon;
  final BadgeTone tone;
  final VoidCallback? onTap;

  /// Set in the dashboard's horizontally-scrolling row, where three numbers are
  /// worth a swipe rather than three full-width screens (§10.4).
  final double? width;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      BadgeTone.brand => (AppColors.brand50, AppColors.brand700),
      BadgeTone.success => (AppColors.success50, AppColors.success700),
      BadgeTone.warning => (AppColors.warning50, AppColors.warning700),
      BadgeTone.danger => (AppColors.danger50, AppColors.danger700),
      BadgeTone.info => (AppColors.info50, AppColors.info700),
      BadgeTone.accent => (AppColors.accent50, AppColors.accent700),
      BadgeTone.violet => (AppColors.violet50, AppColors.violet700),
      BadgeTone.orange => (AppColors.orange50, AppColors.orange700),
      BadgeTone.neutral => (AppColors.aauGray100, AppColors.aauGray700),
    };

    final content = Padding(
      padding: const EdgeInsets.all(AppSpace.cardPadding),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null)
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(color: colors.$1, borderRadius: AppRadius.smAll),
              child: Icon(icon, size: 18, color: colors.$2),
            ),
          if (icon != null) const SizedBox(height: AppSpace.s3),
          Text(
            value,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: AppColors.aauGray900,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              color: AppColors.aauGray500,
              height: 1.35,
            ),
          ),
        ],
      ),
    );

    return Container(
      width: width,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: AppColors.aauGray200),
        boxShadow: AppElevation.e1,
      ),
      // The ripple must be *inside* the opaque surface, not around it: an
      // InkWell wrapping a filled Container paints its splash underneath that
      // fill and therefore never appears.
      child: onTap == null
          ? content
          : Material(
              color: Colors.transparent,
              borderRadius: AppRadius.mdAll,
              child: InkWell(
                onTap: onTap,
                borderRadius: AppRadius.mdAll,
                child: content,
              ),
            ),
    );
  }
}

/// Prev/Next plus a page indicator. Deliberately no jump-to-page input: the API's
/// own `limit` caps at 100, so the pages are small enough that the extra control
/// would be more to explain than to use (§8).
class PaginationBar extends StatelessWidget {
  const PaginationBar({
    super.key,
    required this.page,
    required this.totalPages,
    required this.onPageChanged,
    this.totalLabel,
  });

  final int page;
  final int totalPages;
  final ValueChanged<int> onPageChanged;

  /// e.g. "153 items" — the total, which is the thing the page indicator cannot
  /// tell you.
  final String? totalLabel;

  @override
  Widget build(BuildContext context) {
    if (totalPages <= 1) {
      if (totalLabel == null) return const SizedBox.shrink();
      return Padding(
        padding: const EdgeInsets.only(top: AppSpace.s3),
        child: Center(
          child: Text(
            totalLabel!,
            style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.s4),
      child: Row(
        children: [
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: AppButton(
                label: 'Previous',
                variant: AppButtonVariant.outline,
                size: AppButtonSize.sm,
                icon: Icons.chevron_left,
                onPressed: page > 1 ? () => onPageChanged(page - 1) : null,
              ),
            ),
          ),
          Text(
            'Page $page of $totalPages',
            style: const TextStyle(fontSize: 13, color: AppColors.aauGray600),
          ),
          Expanded(
            child: Align(
              alignment: Alignment.centerRight,
              child: AppButton(
                label: 'Next',
                variant: AppButtonVariant.outline,
                size: AppButtonSize.sm,
                trailingIcon: Icons.chevron_right,
                onPressed: page < totalPages ? () => onPageChanged(page + 1) : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
