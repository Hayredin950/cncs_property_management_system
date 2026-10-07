import 'package:cncs_pms_mobile/widgets/scanner_frame.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../support/pump.dart';

/// The scanner's one job: turn a decoded code into a tag lookup.
///
/// This is the regression test for a bug that was invisible in every other way. The
/// camera preview started, the torch button appeared and the manual field worked —
/// but aiming the phone at a sticker did *nothing at all*, because nothing ever
/// subscribed to the decoded barcodes. In `mobile_scanner` 7.x that subscription is
/// created by the `MobileScanner` widget only when `onDetect` is supplied, and
/// `ScannerFrame` did not supply one.
///
/// So these tests reach the handler **through the widget's own callback**, taken off
/// the mounted `MobileScanner`. A test that called `ScannerFrameState.handleCapture`
/// directly would pass on the broken code too; this one fails, which is the whole
/// point.
void main() {
  /// A phone-shaped viewport: the default 800x600 test surface is shorter than the
  /// preview, the controls and the manual field together, so the manual field would
  /// be off screen and `tap`/`enterText` would miss it.
  void useTallViewport(WidgetTester tester) {
    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  /// Mounts one scanner and returns the list its `onTag` collects into.
  Future<List<String>> pumpScanner(WidgetTester tester) async {
    useTallViewport(tester);
    final scanned = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: ScannerFrame(onTag: scanned.add)),
        ),
      ),
    );
    await pumpFrames(tester);
    return scanned;
  }

  /// What `backend/src/utils/qrGenerator.ts` burns into every sticker:
  /// `${PUBLIC_BASE_URL}/item/${tagId}` — a URL, not a bare tag ID, so the parse
  /// has to pull the ID back out of the path.
  const stickerUrl = 'https://cncs-pms.vercel.app/item/CNCS-DEMO-0001';

  /// Settles the accent flash's 220 ms timer, so no timer outlives the test.
  Future<void> settleFlash(WidgetTester tester) =>
      tester.pump(const Duration(milliseconds: 300));

  testWidgets('a decoded sticker opens the item it names', (tester) async {
    final scanned = await pumpScanner(tester);

    final onDetect = tester.widget<MobileScanner>(find.byType(MobileScanner)).onDetect;
    expect(
      onDetect,
      isNotNull,
      reason: 'MobileScanner only subscribes to decoded barcodes when onDetect is '
          'passed, so without it the camera previews but never reports a code',
    );

    onDetect!(const BarcodeCapture(barcodes: [Barcode(rawValue: stickerUrl)]));
    await settleFlash(tester);

    expect(scanned, ['CNCS-DEMO-0001']);
  });

  testWidgets('typing the tag ID resolves to the same destination as a scan',
      (tester) async {
    final scanned = await pumpScanner(tester);

    await tester.enterText(find.byType(TextField), 'cncs-demo-0001');
    await tester.tap(find.byTooltip('Look up this tag'));
    await settleFlash(tester);

    expect(scanned, ['CNCS-DEMO-0001']);
  });

  testWidgets('a second read of the same sticker inside the cooldown is ignored',
      (tester) async {
    final scanned = await pumpScanner(tester);

    final onDetect = tester.widget<MobileScanner>(find.byType(MobileScanner)).onDetect!;
    onDetect(const BarcodeCapture(barcodes: [Barcode(rawValue: stickerUrl)]));
    onDetect(const BarcodeCapture(barcodes: [Barcode(rawValue: stickerUrl)]));
    await settleFlash(tester);

    // One lookup per sticker, not one per camera frame: the unthrottled version
    // fires a request per detection and the same item "opens" several times.
    expect(scanned, ['CNCS-DEMO-0001']);
  });

  testWidgets('a frame carrying several codes acts on the first only', (tester) async {
    final scanned = await pumpScanner(tester);

    final onDetect = tester.widget<MobileScanner>(find.byType(MobileScanner)).onDetect!;
    onDetect(const BarcodeCapture(barcodes: [
      Barcode(rawValue: stickerUrl),
      Barcode(rawValue: 'https://cncs-pms.vercel.app/item/CNCS-DEMO-0002'),
    ]));
    await settleFlash(tester);

    // Opening the second one would send the user to an item they did not aim at.
    expect(scanned, ['CNCS-DEMO-0001']);
  });
}
