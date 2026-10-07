import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/format.dart';
import '../theme/tokens.dart';
import 'app_fields.dart';

/// §10.3's `ScannerFrame` — the camera viewport, its scan-target overlay, the
/// torch/camera controls, and the manual-entry field that is **always visible
/// below it, never behind a "having trouble?" toggle.**
///
/// Three behaviours here are load-bearing:
///
///   * **Camera unavailable is a designed state, not a blank box.** A permission
///     denial, a device with no camera, and an insecure context are three different
///     sentences, because a demo-day failure that reads as "the app is broken" is
///     the worst possible outcome, while one that reads as "the camera needs
///     permission" is recoverable in five seconds.
///   * **Both the scan and the typed tag resolve to the same destination.**
///     `onTag` receives a normalised tag ID from either path — the parsed one from
///     the QR payload, or the uppercased one typed in.
///   * **No zoom slider.** §10.3 allows one only when the running camera reports a
///     real zoom range, and most phones expose none; "a missing control is honest
///     where a dead one is not", so this widget does not ship a control that cannot
///     do anything. `MobileScannerController.setZoomScale` remains available if a
///     future build can detect a range.
class ScannerFrame extends StatefulWidget {
  const ScannerFrame({
    super.key,
    required this.onTag,
    this.caption,
    this.manualHint = 'CNCS-________',
    this.manualLabel = 'Or type the tag ID',
    this.autoStart = true,
  });

  /// Called with the normalised tag ID, from the camera or from manual entry.
  final ValueChanged<String> onTag;

  final String? caption;
  final String manualHint;
  final String manualLabel;

  /// `false` for the audit walkthrough, where the enclosing screen pauses scanning
  /// while a mutation is in flight and resumes it afterwards.
  final bool autoStart;

  @override
  State<ScannerFrame> createState() => ScannerFrameState();
}

class ScannerFrameState extends State<ScannerFrame> with SingleTickerProviderStateMixin {
  late final MobileScannerController _controller = MobileScannerController(
    // `normal` — not `unrestricted` — because the unrestricted stream re-emits the
    // same code many times a second, and every duplicate is a network call in the
    // audit walkthrough.
    detectionSpeed: DetectionSpeed.normal,
    formats: const [BarcodeFormat.qrCode],
    autoStart: widget.autoStart,
  );

  final _manualController = TextEditingController();
  final _manualFocus = FocusNode();

  /// A scan is ignored for this long after a successful one. Without it, holding
  /// the phone still over a sticker fires a request per detection and the user sees
  /// the same item "open" several times.
  static const _cooldown = Duration(milliseconds: 2500);
  DateTime? _lastAcceptedAt;

  var _flash = false;
  Timer? _flashTimer;

  /// Pulled forward by the enclosing screen so it can pause the camera while a
  /// request is in flight (the audit walkthrough) without rebuilding this widget.
  Future<void> pause() => _controller.stop();

  Future<void> resume() => _controller.start();

  @override
  void dispose() {
    _flashTimer?.cancel();
    _manualController.dispose();
    _manualFocus.dispose();
    _controller.dispose();
    super.dispose();
  }

  /// The decoded-barcode entry point, handed to `MobileScanner(onDetect:)`.
  ///
  /// This method existing is not enough on its own: in `mobile_scanner` 7.x the
  /// `MobileScanner` widget subscribes to `controller.barcodes` **only when
  /// `onDetect` is supplied**, and a `MobileScanner` without it renders a live
  /// camera preview that never reports a single code — which to a user is
  /// indistinguishable from "the scanner is broken". So the `onDetect:` argument
  /// in [build] and this handler are a pair; `test/widget/scanner_frame_test.dart`
  /// asserts both.
  @visibleForTesting
  void handleCapture(BarcodeCapture capture) {
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw != null && raw.isNotEmpty) {
        // The first decodable value wins. A frame can carry several codes; acting
        // on more than one would open an item the user did not aim at.
        _accept(raw);
        return;
      }
    }
  }

  void _accept(String rawTag) {
    final tagId = parseScannedTagId(rawTag);
    if (tagId == null || tagId.isEmpty) return;

    final now = DateTime.now();
    if (_lastAcceptedAt != null && now.difference(_lastAcceptedAt!) < _cooldown) {
      // A near-duplicate within the cooldown. Silent on purpose: the toast/error
      // belongs to the enclosing screen's mutation, and a "already scanned" message
      // here would be reporting this widget's own debouncing.
      return;
    }
    _lastAcceptedAt = now;

    _pulse();
    widget.onTag(tagId);
  }

  /// The brief accent flash §10.3 asks for — "enough feedback that the user trusts
  /// the scan registered before the page changes underneath them". Paired with a
  /// medium haptic, because a user staring at a sticker is not looking at the flash.
  void _pulse() {
    HapticFeedback.mediumImpact();
    setState(() => _flash = true);
    _flashTimer?.cancel();
    _flashTimer = Timer(const Duration(milliseconds: 220), () {
      if (mounted) setState(() => _flash = false);
    });
  }

  void _submitManual() {
    final value = _manualController.text.trim();
    if (value.isEmpty) return;
    _accept(value);
    _manualController.clear();
    _manualFocus.unfocus();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _viewport(),
        if (widget.caption != null) ...[
          const SizedBox(height: AppSpace.s3),
          Text(
            widget.caption!,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: AppColors.aauGray500, height: 1.45),
          ),
        ],
        _controls(),
        const SizedBox(height: AppSpace.s5),
        Row(
          children: const [
            Expanded(child: Divider()),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpace.s3),
              child: Text(
                '— or type it —',
                style: TextStyle(fontSize: 12.5, color: AppColors.aauGray400),
              ),
            ),
            Expanded(child: Divider()),
          ],
        ),
        const SizedBox(height: AppSpace.s5),
        AppTextField(
          label: widget.manualLabel,
          controller: _manualController,
          focusNode: _manualFocus,
          hint: widget.manualHint,
          uppercase: true,
          mono: true,
          textInputAction: TextInputAction.search,
          prefixIcon: Icons.qr_code_2_outlined,
          onSubmitted: (_) => _submitManual(),
          suffix: IconButton(
            onPressed: _submitManual,
            tooltip: 'Look up this tag',
            icon: const Icon(Icons.arrow_forward, size: 20),
            color: AppColors.brand700,
          ),
        ),
        const SizedBox(height: AppSpace.s2),
        const Text(
          'Manual entry works exactly like a scan — same lookup, same result.',
          style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.4),
        ),
      ],
    );
  }

  Widget _viewport() {
    return ClipRRect(
      borderRadius: AppRadius.lgAll,
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: AppColors.aauGray900),
            MobileScanner(
              controller: _controller,
              onDetect: handleCapture,
              fit: BoxFit.cover,
              // Full-frame scanning rather than a `scanWindow`: a phone aimed at a
              // 40mm sticker one-handed is imprecise, and rejecting a code that is
              // visibly on screen reads as a malfunction. The overlay still shows
              // the target so the intent is clear.
              errorBuilder: (context, error) => _unavailable(error),
              placeholderBuilder: (context) => const Center(
                child: SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                ),
              ),
              overlayBuilder: (context, _) => const IgnorePointer(
                child: CustomPaint(painter: _ScanTargetPainter()),
              ),
            ),
            // The accent flash, above the preview and below the controls.
            IgnorePointer(
              child: AnimatedOpacity(
                opacity: _flash ? 1 : 0,
                duration: const Duration(milliseconds: 120),
                child: const ColoredBox(color: Color(0x66D9454C)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// The three camera failures, each with its own sentence. `permissionDenied` is
  /// by far the most common and the only one the user can fix, so it is the one
  /// that gets told exactly what to do.
  Widget _unavailable(MobileScannerException error) {
    final (icon, message) = switch (error.errorCode) {
      MobileScannerErrorCode.permissionDenied => (
          Icons.no_photography_outlined,
          'Camera permission was denied. You can still type the tag ID below — or '
              'enable the camera for this app in your device settings.',
        ),
      MobileScannerErrorCode.unsupported => (
          Icons.videocam_off_outlined,
          'This device has no camera available to the app. Type the tag ID below '
              'instead — the lookup is identical.',
        ),
      _ => (
          Icons.videocam_off_outlined,
          'The camera could not start. Type the tag ID below instead — the lookup '
              'is identical.',
        ),
    };

    return ColoredBox(
      color: AppColors.aauGray900,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s5),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 34, color: Colors.white70),
              const SizedBox(height: AppSpace.s3),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  color: Colors.white70,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _controls() {
    return ValueListenableBuilder<MobileScannerState>(
      valueListenable: _controller,
      builder: (context, state, _) {
        if (!state.isRunning) return const SizedBox(height: AppSpace.s2);

        final torchOn = state.torchState == TorchState.on;
        final torchAvailable = state.torchState != TorchState.unavailable;
        final multiCamera = (state.availableCameras ?? 1) > 1;

        return Padding(
          padding: const EdgeInsets.only(top: AppSpace.s3),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (torchAvailable)
                _ScannerControl(
                  icon: torchOn ? Icons.flashlight_on_outlined : Icons.flashlight_off_outlined,
                  label: torchOn ? 'Turn the light off' : 'Turn the light on',
                  onTap: _controller.toggleTorch,
                  active: torchOn,
                ),
              if (torchAvailable && multiCamera) const SizedBox(width: AppSpace.s4),
              if (multiCamera)
                _ScannerControl(
                  icon: Icons.cameraswitch_outlined,
                  label: 'Switch camera',
                  onTap: _controller.switchCamera,
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ScannerControl extends StatelessWidget {
  const _ScannerControl({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: active ? AppColors.accent600 : Colors.white,
          shape: const CircleBorder(),
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: Tooltip(
              message: label,
              child: Center(
                child: Icon(icon, size: 20, color: active ? Colors.white : AppColors.aauGray700),
              ),
            ),
          ),
        ),
      );
}

/// Four corner brackets. A custom painter rather than four positioned containers
/// so the bracket thickness and inset stay in one place, and so the overlay costs
/// exactly one layer.
class _ScanTargetPainter extends CustomPainter {
  const _ScanTargetPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.accent600
      ..strokeWidth = 3.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    // A square target inset from the viewport, which is what the eye aims for.
    final side = size.shortestSide * 0.66;
    final rect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: side,
      height: side,
    );
    const arm = 26.0;

    // Top-left, top-right, bottom-right, bottom-left — each an "L" of two strokes.
    final paths = [
      Path()
        ..moveTo(rect.left, rect.top + arm)
        ..lineTo(rect.left, rect.top)
        ..lineTo(rect.left + arm, rect.top),
      Path()
        ..moveTo(rect.right - arm, rect.top)
        ..lineTo(rect.right, rect.top)
        ..lineTo(rect.right, rect.top + arm),
      Path()
        ..moveTo(rect.right, rect.bottom - arm)
        ..lineTo(rect.right, rect.bottom)
        ..lineTo(rect.right - arm, rect.bottom),
      Path()
        ..moveTo(rect.left + arm, rect.bottom)
        ..lineTo(rect.left, rect.bottom)
        ..lineTo(rect.left, rect.bottom - arm),
    ];

    for (final path in paths) {
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
