import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The design system's `Badge` — `frontend/src/components/Badge.tsx` in Flutter.
///
/// Named `AppBadge` rather than `Badge` because Material ships its own `Badge`
/// (the counter-on-an-icon widget) and a bare `Badge` would be an ambiguous import
/// in every file that needs both.
///
/// §3.1's "50/600/700 rule": tinted background (`*-50`), border on the tint
/// (`*-200`), text at `*-700`. One tone per semantic colour, never a bespoke hex
/// per badge — and colour is never the only signal, which is why every caller
/// passes an icon (§3.4).
enum BadgeTone { brand, accent, success, warning, danger, info, neutral, violet, orange }

/// The tone's three colours, resolved in one place so no chip invents a tint.
class _Tone {
  const _Tone(this.background, this.foreground, this.border);

  final Color background;
  final Color foreground;
  final Color border;

  static _Tone of(BadgeTone tone) => switch (tone) {
        BadgeTone.brand => const _Tone(AppColors.brand50, AppColors.brand700, AppColors.brand200),
        BadgeTone.accent =>
          const _Tone(AppColors.accent50, AppColors.accent700, AppColors.accent200),
        BadgeTone.success =>
          const _Tone(AppColors.success50, AppColors.success700, AppColors.success200),
        BadgeTone.warning =>
          const _Tone(AppColors.warning50, AppColors.warning700, AppColors.warning200),
        BadgeTone.danger =>
          const _Tone(AppColors.danger50, AppColors.danger700, AppColors.danger200),
        BadgeTone.info => const _Tone(AppColors.info50, AppColors.info700, AppColors.info200),
        BadgeTone.neutral =>
          const _Tone(AppColors.aauGray100, AppColors.aauGray700, AppColors.aauGray200),
        BadgeTone.violet =>
          const _Tone(AppColors.violet50, AppColors.violet700, AppColors.violet100),
        BadgeTone.orange =>
          const _Tone(AppColors.orange50, AppColors.orange700, AppColors.orange100),
      };
}

/// A pill: tinted background, hairline border, optional leading icon, label.
class AppBadge extends StatelessWidget {
  const AppBadge({
    super.key,
    required this.tone,
    required this.label,
    this.icon,
    this.dense = false,
  });

  final BadgeTone tone;
  final String label;

  /// A *concept* icon — this widget maps it to Material Symbols Outlined, which
  /// is the bundled equivalent of the web's lucide set. One icon per concept,
  /// used identically everywhere (§6).
  final IconData? icon;

  /// The `icon + text` size used inline in dense list rows.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = _Tone.of(tone);
    final iconSize = dense ? 12.0 : 14.0;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: const BorderRadius.all(Radius.circular(999)),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: dense ? AppSpace.s2 : 10,
          vertical: dense ? 2 : 4,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: iconSize, color: colors.foreground),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: dense ? 11 : 12,
                fontWeight: FontWeight.w500,
                color: colors.foreground,
                height: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
