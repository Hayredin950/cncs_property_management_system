import 'package:cncs_pms_mobile/core/format.dart';
import 'package:flutter_test/flutter_test.dart';

/// The formatters are the mobile twin of `frontend/src/lib/formatters.ts`, and the web
/// app already has tests for them. These cover the same decisions, because a currency
/// that groups differently on a phone than in the browser is a support ticket waiting
/// to happen.

void main() {
  group('formatCurrencyEtb', () {
    test('groups thousands and always shows two decimals', () {
      // `Prisma.Decimal` arrives as a string, which is why the input is a string.
      expect(formatCurrencyEtb('45000'), 'ETB 45,000.00');
      expect(formatCurrencyEtb('1234567.5'), 'ETB 1,234,567.50');
      expect(formatCurrencyEtb(0), 'ETB 0.00');
    });

    test('keeps the sign outside the grouped digits', () {
      expect(formatCurrencyEtb('-1500'), '-ETB 1,500.00');
    });

    test('returns null for absent or unparseable values, never "ETB NaN"', () {
      expect(formatCurrencyEtb(null), isNull);
      expect(formatCurrencyEtb(''), isNull);
      expect(formatCurrencyEtb('not a number'), isNull);
    });
  });

  group('UTC dates', () {
    test('renders the UTC calendar day, not the local one', () {
      // 2026-09-21T23:30Z is the 22nd in Addis (UTC+3). A report labelled by local
      // time would silently disagree with the server's own date window.
      expect(formatDateTimeUtc('2026-09-21T23:30:00.000Z'), '21 Sep 2026, 23:30 UTC');
      expect(formatDateUtc('2026-09-21T23:30:00.000Z'), '21 Sep 2026');
    });

    test('todayStampUtc is a bare YYYY-MM-DD', () {
      expect(todayStampUtc(DateTime.utc(2026, 10, 7, 13)), '2026-10-07');
    });

    test('absent dates render as null rather than an epoch date', () {
      expect(formatDateUtc(null), isNull);
      expect(formatDateTimeUtc(''), isNull);
    });
  });

  group('formatRelativeTime', () {
    // Same strings as `frontend/src/lib/formatters.test.ts`, because the mobile
    // client is meant to read identically to the web one here.
    test('describes the gap in the largest sensible unit', () {
      final now = DateTime.utc(2026, 10, 7, 12);
      expect(formatRelativeTime('2026-10-07T11:30:00.000Z', now: now), '30 min. ago');
      expect(formatRelativeTime('2026-10-07T09:00:00.000Z', now: now), '3 hr. ago');
      expect(formatRelativeTime('2026-10-04T12:00:00.000Z', now: now), '3 days ago');
      expect(formatRelativeTime('2026-08-07T12:00:00.000Z', now: now), '2 mo. ago');
    });

    test('a few seconds either side reads as "Just now"', () {
      final now = DateTime.utc(2026, 10, 7, 12);
      expect(formatRelativeTime('2026-10-07T12:00:20.000Z', now: now), 'Just now');
    });
  });

  group('parseScannedTagId', () {
    test('accepts a bare tag and normalises its case', () {
      expect(parseScannedTagId('  cncs-demo-0001 '), 'CNCS-DEMO-0001');
    });

    test('accepts the QR payload, which is a full public URL', () {
      // This is the shape `qrGenerator` encodes into every printed sticker.
      expect(
        parseScannedTagId('https://cncs.example.et/item/CNCS-DEMO-0007'),
        'CNCS-DEMO-0007',
      );
      expect(
        parseScannedTagId('https://cncs.example.et/item/cncs-demo-0007?ref=sticker'),
        'CNCS-DEMO-0007',
      );
    });

    test('an empty scan is null, so a stray frame never navigates', () {
      expect(parseScannedTagId(''), isNull);
      expect(parseScannedTagId('   '), isNull);
    });
  });

  group('looksLikeTagId', () {
    test('recognises the tag shape', () {
      expect(looksLikeTagId('CNCS-DEMO-0001'), isTrue);
      expect(looksLikeTagId('dell latitude'), isFalse);
    });
  });
}
