import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The design system's `Button` (§8) — `frontend/src/components/Button.tsx`.
///
/// The variants are the same six; the two behaviours worth calling out are the
/// ones that are easy to get wrong and that this widget owns centrally:
///
///   * **Loading keeps the width fixed.** The label stays laid out at zero
///     opacity behind a centred spinner, so a button that says "Approve" does not
///     shrink to the size of a spinner and shift everything beside it. A layout
///     jump on a mutation button is exactly what makes a form feel broken.
///   * **Minimum hit target 44×44 on every size.** §12's rule applies below `lg`,
///     and this client is always below `lg`, so even `sm` is 44 points tall.
///
/// `destructive` is the reject/dispose styling; the design system reserves it for
/// irreversible actions, so a caller reaching for it is making a claim about the
/// action, not choosing a colour.
enum AppButtonVariant { primary, secondary, outline, ghost, destructive, link }

enum AppButtonSize { sm, md, lg }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.md,
    this.icon,
    this.trailingIcon,
    this.loading = false,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;

  /// A *concept* icon, mapped by the caller to Material Symbols Outlined — the
  /// bundled counterpart of the web's lucide set (§6).
  final IconData? icon;
  final IconData? trailingIcon;

  final bool loading;

  /// Full width. The default in a form, where a half-width primary button reads
  /// as an optional extra.
  final bool expand;

  bool get _enabled => onPressed != null && !loading;

  @override
  Widget build(BuildContext context) {
    final height = switch (size) {
      AppButtonSize.sm => 44.0,
      AppButtonSize.md => 48.0,
      AppButtonSize.lg => 56.0,
    };
    final gap = size == AppButtonSize.sm ? 6.0 : AppSpace.s2;
    final iconSize = size == AppButtonSize.lg ? 20.0 : 18.0;
    final textSize = switch (size) {
      AppButtonSize.sm => 14.0,
      AppButtonSize.md => 15.0,
      AppButtonSize.lg => 16.0,
    };

    final palette = _palette();

    Widget content = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[
          Icon(icon, size: iconSize, color: palette.foreground),
          SizedBox(width: gap),
        ],
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: textSize,
              fontWeight: FontWeight.w600,
              color: palette.foreground,
              height: 1.2,
            ),
          ),
        ),
        if (trailingIcon != null) ...[
          SizedBox(width: gap),
          Icon(trailingIcon, size: iconSize, color: palette.foreground),
        ],
      ],
    );

    if (loading) {
      // The label is still laid out, just invisible — that is what pins the
      // width. `IgnorePointer` on the spinner is unnecessary because the whole
      // control is already inert while loading.
      content = Stack(
        alignment: Alignment.center,
        children: [
          Opacity(opacity: 0, child: content),
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: palette.foreground,
            ),
          ),
        ],
      );
    }

    final horizontalPadding = switch (size) {
      AppButtonSize.sm => AppSpace.s3,
      AppButtonSize.md => AppSpace.s4,
      AppButtonSize.lg => AppSpace.s5,
    };

    final button = SizedBox(
      height: height,
      child: Material(
        color: palette.background,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.mdAll,
          side: palette.border == null
              ? BorderSide.none
              : BorderSide(color: palette.border!),
        ),
        child: InkWell(
          onTap: _enabled ? onPressed : null,
          borderRadius: AppRadius.mdAll,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
            child: content,
          ),
        ),
      ),
    );

    return expand
        ? SizedBox(width: double.infinity, child: button)
        : button;
  }

  _ButtonPalette _palette() {
    // Disabled controls are still legible — §3.4's contrast floor applies to a
    // disabled submit button too, because "why can't I press this?" is a question
    // a user answers by reading the label.
    final Color? muted = _enabled ? null : AppColors.aauGray400;

    switch (variant) {
      case AppButtonVariant.primary:
        return _ButtonPalette(
          background: _enabled ? AppColors.brand600 : AppColors.aauGray200,
          foreground: muted ?? Colors.white,
        );
      case AppButtonVariant.secondary:
        return _ButtonPalette(
          background: AppColors.aauGray100,
          foreground: muted ?? AppColors.aauGray800,
        );
      case AppButtonVariant.outline:
        return _ButtonPalette(
          background: Colors.white,
          foreground: muted ?? AppColors.aauGray700,
          border: _enabled ? AppColors.aauGray300 : AppColors.aauGray200,
        );
      case AppButtonVariant.ghost:
        return _ButtonPalette(
          background: Colors.transparent,
          foreground: muted ?? AppColors.aauGray700,
        );
      case AppButtonVariant.destructive:
        return _ButtonPalette(
          background: _enabled ? AppColors.danger600 : AppColors.aauGray200,
          foreground: muted ?? Colors.white,
        );
      case AppButtonVariant.link:
        return _ButtonPalette(
          background: Colors.transparent,
          foreground: muted ?? AppColors.brand700,
        );
    }
  }
}

class _ButtonPalette {
  const _ButtonPalette({required this.background, required this.foreground, this.border});

  final Color background;
  final Color foreground;
  final Color? border;
}

/// A square, icon-only button. Always requires a `tooltip`, because an icon alone
/// is never an accessible name (§8) — making it a required parameter is how that
/// rule survives a hurried call site.
class AppIconButton extends StatelessWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    this.onPressed,
    this.variant = AppButtonVariant.ghost,
    this.badgeCount,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;

  /// The unread/pending count rendered on the icon's shoulder. `null` hides it,
  /// and `0` also hides it — a badge reading "0" is noise, not information.
  final int? badgeCount;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final (background, foreground) = switch (variant) {
      AppButtonVariant.primary => (
          enabled ? AppColors.brand600 : AppColors.aauGray200,
          Colors.white,
        ),
      AppButtonVariant.secondary => (AppColors.aauGray100, AppColors.aauGray800),
      AppButtonVariant.outline => (Colors.white, AppColors.aauGray700),
      AppButtonVariant.destructive => (AppColors.danger600, Colors.white),
      AppButtonVariant.ghost || AppButtonVariant.link => (
          Colors.transparent,
          enabled ? AppColors.aauGray700 : AppColors.aauGray400,
        ),
    };

    final button = SizedBox(
      width: 44,
      height: 44,
      child: Material(
        color: background,
        shape: const CircleBorder(),
        child: InkWell(
          onTap: onPressed,
          customBorder: const CircleBorder(),
          child: Tooltip(
            message: tooltip,
            child: Center(child: Icon(icon, size: 21, color: foreground)),
          ),
        ),
      ),
    );

    if (badgeCount == null || badgeCount == 0) return button;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        button,
        Positioned(
          top: 2,
          right: 2,
          child: Container(
            constraints: const BoxConstraints(minWidth: 18),
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: const BoxDecoration(
              color: AppColors.danger600,
              borderRadius: BorderRadius.all(Radius.circular(999)),
            ),
            child: Text(
              badgeCount! > 9 ? '9+' : '$badgeCount',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                height: 1.4,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
