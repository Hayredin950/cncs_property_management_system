/// Defensive JSON coercion, in one place.
///
/// The web app casts the parsed body straight to a TypeScript interface and
/// trusts the contract. Dart has no such luxury at runtime: a missing key is a
/// `null` and a wrong type is a `TypeError` thrown halfway through building a
/// widget tree. These helpers make every model parse the same forgiving way and
/// keep the failure at the field, not at the frame.
library;

Map<String, dynamic> asMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

List<Map<String, dynamic>> asMapList(Object? value) {
  if (value is! List) return const [];
  return [
    for (final entry in value)
      if (entry is Map) Map<String, dynamic>.from(entry),
  ];
}

String asString(Object? value, {String fallback = ''}) {
  if (value == null) return fallback;
  if (value is String) return value;
  return '$value';
}

String? asStringOrNull(Object? value) {
  if (value == null) return null;
  if (value is String) return value.isEmpty ? null : value;
  return '$value';
}

/// `Prisma.Decimal` values arrive as strings; keep them as strings (the web app
/// does the same, and `formatCurrencyEtb` parses on display).
String? asDecimalString(Object? value) => asStringOrNull(value);

int asInt(Object? value, {int fallback = 0}) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}

double asDouble(Object? value, {double fallback = 0}) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

bool asBool(Object? value, {bool fallback = false}) {
  if (value is bool) return value;
  if (value is String) return value == 'true';
  if (value is num) return value != 0;
  return fallback;
}
