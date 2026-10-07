import 'package:flutter/material.dart';

import 'tokens.dart';

/// The app's `ThemeData` — the Flutter translation of `tokens.css` plus the
/// component rules in docs/frontend-design-system.md §5–§8.
///
/// Only the slots Flutter genuinely owns are set here (colour, type, app bar,
/// inputs, dividers, snack bars). Everything with a bespoke shape in the design
/// system — cards, buttons, dialogs, tabs, toasts — has its own widget under
/// `lib/widgets/`, because a `ThemeData` slot cannot express "loading keeps the
/// width fixed" or "error text is referenced by aria-describedby". Styling those
/// twice would be the drift this file exists to prevent.
class AppTheme {
  const AppTheme._();

  /// Geist Sans — the face `aau.edu.et` renders in, bundled from the same
  /// upstream release as the web app's `@fontsource-variable/geist` build.
  static const String fontSans = 'Geist';

  /// Geist Mono — carries tag IDs, tracked out so `0`/`O` and `1`/`I`/`l` read
  /// apart (the web's `.tag-id` class).
  static const String fontMono = 'GeistMono';

  static ThemeData light() {
    final scheme = _scheme();

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: fontSans,
      scaffoldBackgroundColor: AppColors.aauGray50,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: AppColors.aauGray900,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        // The 1px hairline §5.2 gives every chrome surface, drawn as the app
        // bar's own bottom border rather than a wrapper widget.
        shape: Border(bottom: BorderSide(color: AppColors.aauGrayLine)),
        titleTextStyle: TextStyle(
          fontFamily: fontSans,
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: AppColors.aauGray900,
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.aauGrayLine,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: _inputDecoration(),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.aauGray900,
        contentTextStyle: const TextStyle(
          fontFamily: fontSans,
          fontSize: 14,
          color: Colors.white,
          height: 1.35,
        ),
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.mdAll),
        insetPadding: const EdgeInsets.all(AppSpace.s4),
        elevation: 6,
        actionTextColor: AppColors.brand200,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.brand600,
      ),
      // §12: nothing may remap the platform text scale. Declaring the clamp here
      // (rather than per screen) is what keeps a form usable at 200% without a
      // screen silently shrinking its own copy.
      visualDensity: VisualDensity.standard,
    );
  }

  /// AAU blue is the primary. `secondary` is AAU red, reserved for the scan
  /// flow — a screen that reaches for `secondary` is asking for the flagship
  /// action colour, which is why almost nothing does.
  static ColorScheme _scheme() => ColorScheme.fromSeed(
        seedColor: AppColors.brand600,
      ).copyWith(
        primary: AppColors.brand600,
        onPrimary: Colors.white,
        primaryContainer: AppColors.brand50,
        onPrimaryContainer: AppColors.brand900,
        secondary: AppColors.accent600,
        onSecondary: Colors.white,
        secondaryContainer: AppColors.accent50,
        onSecondaryContainer: AppColors.accent700,
        tertiary: AppColors.success600,
        onTertiary: Colors.white,
        error: AppColors.danger600,
        onError: Colors.white,
        errorContainer: AppColors.danger50,
        onErrorContainer: AppColors.danger700,
        surface: Colors.white,
        onSurface: AppColors.aauGray900,
        surfaceContainerHighest: AppColors.aauGray100,
        outline: AppColors.aauGray300,
        outlineVariant: AppColors.aauGray200,
      );

  /// Inputs (§8): a `radius-sm` shell, a visible focus ring in `brand-600`, and
  /// `danger-600` on error with the message below in `danger-700`. The 16px
  /// minimum text size below `md` is the one rule that stops iOS Safari from
  /// zooming on focus, and this client is always below `md` — so it is the
  /// default, not a mobile variant.
  static InputDecorationTheme _inputDecoration() => InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpace.s3,
          vertical: AppSpace.s3,
        ),
        hintStyle: const TextStyle(
          fontFamily: fontSans,
          fontSize: 16,
          color: AppColors.aauGray400,
        ),
        labelStyle: const TextStyle(
          fontFamily: fontSans,
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.aauGray700,
        ),
        floatingLabelStyle: const TextStyle(
          fontFamily: fontSans,
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.brand700,
        ),
        errorStyle: const TextStyle(
          fontFamily: fontSans,
          fontSize: 13,
          color: AppColors.danger700,
        ),
        border: _inputBorder(AppColors.aauGray300),
        enabledBorder: _inputBorder(AppColors.aauGray300),
        disabledBorder: _inputBorder(AppColors.aauGray200),
        focusedBorder: _inputBorder(AppColors.brand600, width: 1.5),
        errorBorder: _inputBorder(AppColors.danger600),
        focusedErrorBorder: _inputBorder(AppColors.danger600, width: 1.5),
      );

  static OutlineInputBorder _inputBorder(Color color, {double width = 1}) =>
      OutlineInputBorder(
        borderRadius: AppRadius.smAll,
        borderSide: BorderSide(color: color, width: width),
      );

  /// §7's `prefers-reduced-motion`: every transition collapses to an instant
  /// state change when the platform asks for it. It is wired in one place so no
  /// later screen has to remember.
  static Duration motion(BuildContext context, Duration duration) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : duration;
}
