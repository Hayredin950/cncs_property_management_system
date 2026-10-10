import 'package:flutter/material.dart';

/// Design tokens — the mobile twin of `frontend/src/styles/tokens.css`
/// (docs/frontend-design-system.md §3.5, §4, §5).
///
/// The prompt for this client was "indistinguishable from the web app", and colour
/// is where an app drifts first. So the **values** are not re-picked here: they are
/// the same AAU ramp the web stylesheet copies from `aau.edu.et` itself —
///
///   * `brand-*` is AAU's official blue, with `brand-900` their footer navy;
///   * `accent-*` is AAU's red, which is what the scan flow uses;
///   * `aau-gray-*` is their overridden gray scale, used by the new chrome;
///   * `slate-*` is the incumbent neutral older screens still use, kept so this
///     file can mirror both without inventing a third grey.
///
/// Anything in `tokens.css` that a widget could want lives here as a named
/// constant, so no screen reaches for a raw `Color(0x…)`. When the web tokens
/// change, this file changes with them and every screen follows.
class AppColors {
  const AppColors._();

  // ── Brand: AAU official blue ───────────────────────────────────────────────
  static const brand50 = Color(0xFFE6F1F8);
  static const brand100 = Color(0xFFB1D5EA);
  static const brand200 = Color(0xFF8BC0DF);
  static const brand300 = Color(0xFF55A4D1);
  static const brand400 = Color(0xFF3592C8);
  static const brand500 = Color(0xFF0277BA);
  static const brand600 = Color(0xFF026CA9);
  static const brand700 = Color(0xFF015484);
  static const brand800 = Color(0xFF014166);
  static const brand900 = Color(0xFF01324E);

  // ── Accent: AAU red — the scan / QR flagship flow (§3.1) ───────────────────
  static const accent50 = Color(0xFFFFECEB);
  static const accent100 = Color(0xFFFFC5C1);
  static const accent200 = Color(0xFFFFA9A3);
  static const accent500 = Color(0xFFEF4C54);
  static const accent600 = Color(0xFFD9454C);
  static const accent700 = Color(0xFFAA363C);

  // ── AAU's own named extras ────────────────────────────────────────────────
  /// Their `blue-900`; the footer background.
  static const aauNavy = Color(0xFF01324E);

  /// Their `customBlue-main`; dropdown group labels.
  static const aauCustomBlue = Color(0xFF005F9F);

  /// Their `gray-line`; header border and dividers.
  static const aauGrayLine = Color(0xFFE0E0E0);

  /// Portal card headings.
  static const aauYellow = Color(0xFFFFCC00);

  // ── AAU gray scale ────────────────────────────────────────────────────────
  static const aauGray50 = Color(0xFFF9FAFB);
  static const aauGray100 = Color(0xFFF8F9FC);
  static const aauGray200 = Color(0xFFE4E7EC);
  static const aauGray300 = Color(0xFFD0D5DD);
  static const aauGray400 = Color(0xFF98A2B3);
  static const aauGray500 = Color(0xFF667085);
  static const aauGray600 = Color(0xFF475467);
  static const aauGray700 = Color(0xFF344054);
  static const aauGray800 = Color(0xFF1D2939);
  static const aauGray900 = Color(0xFF101828);

  // ── Semantic ──────────────────────────────────────────────────────────────
  static const success50 = Color(0xFFECFDF5);
  static const success100 = Color(0xFFD1FAE5);
  static const success200 = Color(0xFFA7F3D0);
  static const success500 = Color(0xFF10B981);
  static const success600 = Color(0xFF059669);
  static const success700 = Color(0xFF047857);

  static const warning50 = Color(0xFFFFFBEB);
  static const warning100 = Color(0xFFFEF3C7);
  static const warning200 = Color(0xFFFDE68A);
  static const warning500 = Color(0xFFF59E0B);
  static const warning600 = Color(0xFFD97706);
  static const warning700 = Color(0xFFB45309);

  /// Danger reuses AAU's red, so alerts and the wordmark agree.
  static const danger50 = accent50;
  static const danger100 = accent100;
  static const danger200 = accent200;
  static const danger500 = accent500;
  static const danger600 = accent600;
  static const danger700 = accent700;

  static const info50 = Color(0xFFF0F9FF);
  static const info100 = Color(0xFFE0F2FE);
  static const info200 = Color(0xFFBAE6FD);
  static const info500 = Color(0xFF0EA5E9);
  static const info600 = Color(0xFF0284C7);
  static const info700 = Color(0xFF0369A1);

  /// The two condition-ramp extras the web keeps outside the semantic ramps
  /// ("Damaged" / role "Admin").
  static const orange50 = Color(0xFFFFF7ED);
  static const orange100 = Color(0xFFFFEDD5);
  static const orange500 = Color(0xFFF97316);
  static const orange600 = Color(0xFFEA580C);
  static const orange700 = Color(0xFFC2410C);

  static const violet50 = Color(0xFFF5F3FF);
  static const violet100 = Color(0xFFEDE9FE);
  static const violet500 = Color(0xFF8B5CF6);
  static const violet600 = Color(0xFF7C3AED);
  static const violet700 = Color(0xFF6D28D9);
}

/// Tailwind's 4px-base spacing scale, unmodified, plus the semantic aliases
/// §5.1 defines on top of it.
class AppSpace {
  const AppSpace._();

  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20;
  static const double s6 = 24;
  static const double s8 = 32;
  static const double s10 = 40;
  static const double s12 = 48;

  /// Page edge padding below `md` — this client is always below `md`.
  static const double gutter = s4;

  /// Between a label and its input, an icon and its label.
  static const double stackTight = s2;

  /// Between form fields, between list items.
  static const double stack = s4;

  /// Between major page sections.
  static const double sectionGap = s8;

  /// Inside a card.
  static const double cardPadding = s4;
}

/// Radius scale (§5.2).
class AppRadius {
  const AppRadius._();

  /// Inputs, chips, badges.
  static const double sm = 6;

  /// Buttons, cards.
  static const double md = 10;

  /// Modals, and the bottom sheet's top corners.
  static const double lg = 16;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));

  /// The bottom sheet's top corners only — the shape §5.2 names.
  static const BorderRadius sheetTop = BorderRadius.vertical(
    top: Radius.circular(lg),
  );
}

/// Elevation scale. `e3` is the maximum anywhere in the app — nothing floats
/// higher than a modal or a toast.
class AppElevation {
  const AppElevation._();

  /// Cards.
  static const List<BoxShadow> e1 = [
    BoxShadow(color: Color(0x0D101828), blurRadius: 3, offset: Offset(0, 1)),
  ];

  /// Dropdowns, popovers.
  static const List<BoxShadow> e2 = [
    BoxShadow(color: Color(0x14101828), blurRadius: 8, offset: Offset(0, 2)),
    BoxShadow(color: Color(0x0A101828), blurRadius: 4, offset: Offset(0, 1)),
  ];

  /// Modals, toasts.
  static const List<BoxShadow> e3 = [
    BoxShadow(color: Color(0x1A101828), blurRadius: 20, offset: Offset(0, 8)),
    BoxShadow(color: Color(0x0F101828), blurRadius: 8, offset: Offset(0, 3)),
  ];
}

/// Interaction timings (§7). Micro-interactions are one tick; component
/// transitions are two. There is deliberately no route-level transition token —
/// "a visitor who just scanned a sticker wants the item on screen immediately,
/// not after a slide", so every navigation is instant.
class AppMotion {
  const AppMotion._();

  static const Duration micro = Duration(milliseconds: 100);
  static const Duration component = Duration(milliseconds: 180);
}
