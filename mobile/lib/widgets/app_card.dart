import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The design system's `Card` — `e1` elevation, `radius-md`, white surface.
///
/// Three states, exactly as the web component has them: default, `onTap`
/// (interactive), and `disabled`/read-only — which is what a disposed item's edit
/// card becomes. Note the deliberate omission: **hover elevation does not exist
/// here.** §7 makes hover a desktop-only enhancement, and this client has no
/// hover, so the interactive state is expressed with a ripple and a tappable
/// surface instead of a floating shadow nobody could ever see.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(AppSpace.cardPadding),
    this.readOnly = false,
    this.accented = false,
    this.margin,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  /// Renders at reduced emphasis with no ripple — an item that cannot be acted
  /// on should look like it, rather than inviting a tap that does nothing.
  final bool readOnly;

  /// A brand-tinted edge, used for "this is the one you're working on" cards.
  final bool accented;

  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final borderColor = accented ? AppColors.brand200 : AppColors.aauGray200;

    // No tap target and no read-only state: a plain decorated box. Building the
    // Material/InkWell stack for a card nobody can press would add a ripple
    // surface that never ripples.
    if (onTap == null || readOnly) {
      return Padding(
        padding: margin ?? EdgeInsets.zero,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: readOnly ? AppColors.aauGray100 : Colors.white,
            borderRadius: AppRadius.mdAll,
            border: Border.all(color: borderColor),
            boxShadow: readOnly ? null : AppElevation.e1,
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    }

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.mdAll,
          side: BorderSide(color: borderColor),
        ),
        elevation: 0,
        child: InkWell(
          onTap: onTap,
          borderRadius: AppRadius.mdAll,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}
