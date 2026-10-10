import 'package:intl/intl.dart';

/// Money, dates, and tag-ID parsing — the mobile twin of
/// `frontend/src/lib/formatters.ts`, kept in one file so no screen invents its
/// own rule (frontend-design-system.md §8/§4).

/// Purchase cost / current value are `Prisma.Decimal` serialized as **strings**
/// (e.g. `"45000"`), and the web app deliberately does not use a currency-aware
/// formatter: `en-ET` ICU data for Birr is not guaranteed to resolve identically
/// everywhere, and on Flutter it may not be bundled at all. So this is the same
/// hand-rolled grouping: `"ETB 45,000.00"`.
String? formatCurrencyEtb(Object? value) {
  if (value == null || value == '') return null;

  final num? parsed = value is num ? value : num.tryParse('$value');
  if (parsed == null || !parsed.isFinite) return null;

  final negative = parsed < 0;
  final parts = parsed.abs().toStringAsFixed(2).split('.');
  final whole = parts[0];
  final fraction = parts.length > 1 ? parts[1] : '00';

  final grouped = whole.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );

  return '${negative ? '-' : ''}ETB $grouped.$fraction';
}

final DateFormat _dateFormat = DateFormat('d MMM yyyy');
final DateFormat _dateTimeFormat = DateFormat('d MMM yyyy, HH:mm');

/// e.g. `"21 Sep 2026"`. Always UTC — report filters and timestamps are UTC
/// throughout the API, and a local-time render would silently shift a day.
String? formatDateUtc(String? iso) {
  final date = _parseIso(iso);
  if (date == null) return null;
  return _dateFormat.format(date.toUtc());
}

/// e.g. `"21 Sep 2026, 14:32 UTC"` — the label makes the timezone explicit
/// rather than leaving the reader to assume local time.
String? formatDateTimeUtc(String? iso) {
  final date = _parseIso(iso);
  if (date == null) return null;
  return '${_dateTimeFormat.format(date.toUtc())} UTC';
}

/// The `YYYY-MM-DD` form the report endpoints expect, in UTC. The web client's
/// `todayStamp()` is the same expression, so a file is named identically whether
/// the name comes from the server's `Content-Disposition` or from here.
String todayStampUtc([DateTime? now]) =>
    (now ?? DateTime.now()).toUtc().toIso8601String().substring(0, 10);

/// e.g. `"3 hr. ago"`. Pair with [formatDateTimeUtc] wherever the absolute time is
/// worth showing as well.
///
/// The strings are the web client's, deliberately: `frontend/src/lib/formatters.ts`
/// uses `Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'short' })`, and
/// its tests pin `"30 min. ago"`, `"3 hr. ago"` and `"3 days ago"`. A phone that
/// said `"-3h"` where the browser said `"3 hr. ago"` would be a visible parity break
/// in the one place a user compares the two.
String formatRelativeTime(String? iso, {DateTime? now}) {
  final date = _parseIso(iso);
  if (date == null) return '';

  final reference = (now ?? DateTime.now()).toUtc();
  final diffMs = date.toUtc().difference(reference).inMilliseconds;
  final absMs = diffMs.abs();

  if (absMs < 45 * 1000) return 'Just now';

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs >= year) return _relative(diffMs, year, 'yr.');
  if (absMs >= month) return _relative(diffMs, month, 'mo.');
  if (absMs >= day) return _relative(diffMs, day, 'day');
  if (absMs >= hour) return _relative(diffMs, hour, 'hr.');
  return _relative(diffMs, minute, 'min.');
}

/// `Intl.RelativeTimeFormat`'s `style: 'short'` shape: `"3 hr. ago"`, `"1 day ago"`,
/// `"in 2 mo."`. Only `day` is pluralized — that is what the ICU data does for the
/// short style (`yr.`/`mo.`/`hr.`/`min.` are invariant).
String _relative(int diffMs, int unitMs, String unit) {
  final value = (diffMs / unitMs).round();
  final count = value.abs();
  final label = unit == 'day' && count != 1 ? '$count days' : '$count $unit';
  return value < 0 ? '$label ago' : 'in $label';
}

/// A scanned QR encodes `${PUBLIC_BASE_URL}/item/:tagId` (frontend-plan.md §6),
/// but manual entry (F4.1) is always available too — so this accepts a full
/// scanned URL or a bare typed tag, and normalizes casing either way.
String? parseScannedTagId(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;

  final uri = Uri.tryParse(trimmed);
  if (uri != null && uri.hasScheme) {
    final match = RegExp(r'/item/([^/?#]+)').firstMatch(uri.path);
    final captured = match?.group(1);
    if (captured != null && captured.isNotEmpty) {
      return Uri.decodeComponent(captured).toUpperCase();
    }
  }

  return trimmed.toUpperCase();
}

DateTime? _parseIso(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  return DateTime.tryParse(iso);
}

/// `true` for a string that looks like a bare tag ID (`CNCS-…`), used to decide
/// whether a search box should link straight to the tag lookup instead of
/// running a name search.
bool looksLikeTagId(String value) => RegExp(r'^CNCS-[A-Z0-9-]+$', caseSensitive: false).hasMatch(value.trim());
