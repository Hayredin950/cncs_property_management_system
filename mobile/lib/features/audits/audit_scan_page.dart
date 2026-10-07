import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/format.dart';
import '../../data/providers/audits_provider.dart';
import '../../data/providers/core_providers.dart';
import '../../models/audit.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/feedback.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/scanner_frame.dart';
import '../../widgets/states.dart';

/// `/audit/:id/scan` (§10.8) — the walkthrough.
///
/// The same `ScannerFrame` as the public scan page, plus the running list this
/// session has recorded. Three behaviours are specific to this screen:
///
///   * **The list is client-side, and it has to be.** The server stores scan rows but
///     exposes no scan listing, so "what have I scanned so far" has no server-side
///     answer. It lives in [auditWalkthroughProvider], keyed by session id so two open
///     sessions cannot contaminate each other's counter.
///   * **The camera pauses while a scan is in flight.** A phone held over a shelf
///     fires detections continuously; without the pause, one sticker becomes five
///     requests the moment the network is slower than the camera. Pausing also makes
///     the toast the only thing moving on screen, which is what "did that register?"
///     needs.
///   * **Complete is disabled until at least one scan, and confirmed.** Completion is
///     final — a second call answers 409 and there is no restart — so the dialog says
///     exactly that instead of asking "Are you sure?".
class AuditScanPage extends ConsumerStatefulWidget {
  const AuditScanPage({super.key, required this.auditId});

  final String auditId;

  @override
  ConsumerState<AuditScanPage> createState() => _AuditScanPageState();
}

class _AuditScanPageState extends ConsumerState<AuditScanPage> {
  final _scannerKey = GlobalKey<ScannerFrameState>();
  var _busy = false;
  var _completing = false;

  @override
  Widget build(BuildContext context) {
    final readback = ref.watch(auditReadbackProvider(widget.auditId));
    final scans = ref.watch(auditScansProvider(widget.auditId));

    final scope = readback.value?.scopeValue ?? 'this department';
    final completed = readback.value?.completed ?? false;

    return PageScaffold(
      title: 'Auditing $scope',
      subtitle: completed
          ? 'This session is already complete'
          : 'Scan each item you find. Finish when the walk is done.',
      maxWidth: 560,
      padBottom: 24,
      children: [
        if (completed)
          const Padding(
            padding: EdgeInsets.only(bottom: AppSpace.stack),
            child: InfoNote(
              icon: Icons.task_alt,
              message: 'This audit has already been completed, so new scans are refused. '
                  'Open the report to see what it found.',
              tone: InfoTone.warning,
            ),
          ),

        if (readback.hasError)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpace.stack),
            child: InlineError(
              error: readback.error!,
              onRetry: () => ref.invalidate(auditReadbackProvider(widget.auditId)),
            ),
          ),

        ScannerFrame(
          onTag: _onTag,
          caption: 'Scan the tag on each item you find. Anything left unscanned at the end '
              'is reported as missing.',
        ),
        const SizedBox(height: AppSpace.s5),

        _counter(scans.length, completed: completed),

        const SizedBox(height: AppSpace.s4),
        AppButton(
          label: 'Complete the audit',
          icon: Icons.task_alt,
          size: AppButtonSize.lg,
          expand: true,
          loading: _completing,
          onPressed: scans.isEmpty || completed || _completing ? null : _complete,
        ),
        if (scans.isEmpty && !completed)
          const Padding(
            padding: EdgeInsets.only(top: AppSpace.s2),
            child: Text(
              'Scan at least one item before completing \u2014 an audit with no scans would '
              'report the whole department as missing.',
              style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.45),
            ),
          ),

        const SizedBox(height: AppSpace.s6),
        _scannedList(scans),
      ],
    );
  }

  Widget _counter(int count, {required bool completed}) {
    return AppCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.brand50,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.qr_code_scanner, size: 22, color: AppColors.brand700),
          ),
          const SizedBox(width: AppSpace.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  count == 1 ? '1 item scanned' : '$count items scanned',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
                Text(
                  completed
                      ? 'Recorded. The report lists the final result.'
                      : 'This list lives on the phone until the audit is complete.',
                  style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _scannedList(List<ScannedAuditItem> scans) {
    if (scans.isEmpty) {
      return const EmptyState(
        icon: Icons.inventory_2_outlined,
        title: 'Nothing scanned yet',
        body: 'Each scan appears here immediately, so you can see the walk adding up.',
        compact: true,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: 'Scanned this session',
          subtitle: 'Newest first',
        ),
        for (final scan in scans.reversed) ...[
          AppCard(
            padding: const EdgeInsets.all(AppSpace.s3),
            child: Row(
              children: [
                const Icon(Icons.check_circle_outline, size: 18, color: AppColors.success600),
                const SizedBox(width: AppSpace.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        scan.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: AppColors.aauGray900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          TagIdText(tagId: scan.tagId, fontSize: 11.5),
                          const SizedBox(width: AppSpace.s2),
                          Text(
                            scan.room.trim().isEmpty ? 'No room recorded' : 'Room ${scan.room}',
                            style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray500),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Text(
                  formatRelativeTime(scan.scannedAt),
                  style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray400),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.s2),
        ],
      ],
    );
  }

  /// A scanned tag becomes an item id, then a scan row.
  ///
  /// The two-step is not wasted work: the scan endpoint takes a **uuid**, and the
  /// sticker carries a **tag id**, so the lookup is the only thing that can bridge
  /// them — and doing it here means a sticker for an item that no longer exists fails
  /// with the item endpoint's own honest 404 rather than a uuid-format 400.
  Future<void> _onTag(String tagId) async {
    if (_busy) return;
    _busy = true;
    // The camera stops while the request is in flight: a shelf full of stickers under
    // a slow connection would otherwise queue a scan per detection.
    await _scannerKey.currentState?.pause();

    try {
      final item = await ref.read(itemsApiProvider).byTagId(tagId);
      final already = ref
          .read(auditScansProvider(widget.auditId))
          .any((scan) => scan.itemId == item.id);

      await ref.read(auditActionsProvider).scan(
            auditId: widget.auditId,
            itemId: item.id,
          );
      if (!mounted) return;
      showAppToast(
        context,
        message: already
            ? '${item.tagId} scanned again \u2014 the count is unchanged.'
            : '${item.tagId} recorded.',
        tone: ToastTone.success,
        // One slot for the whole walkthrough: a stream of scans should read as one
        // line that stays current, not a column of near-identical toasts.
        replace: true,
      );
    } on ApiError catch (error) {
      if (mounted) {
        showAppToast(
          context,
          message: error.isGone
              ? 'That item is disposed, so it cannot be audited.'
              : '${error.message} ($tagId)',
          tone: ToastTone.error,
          replace: true,
        );
      }
    } on NetworkError catch (error) {
      if (mounted) {
        showAppToast(context, message: error.message, tone: ToastTone.error, replace: true);
      }
    } finally {
      _busy = false;
      if (mounted) await _scannerKey.currentState?.resume();
    }
  }

  Future<void> _complete() async {
    final count = ref.read(auditScansProvider(widget.auditId)).length;
    final confirmed = await showConfirmDialog(
      context,
      title: 'Complete this audit?',
      body: 'The session is closed and the result is computed from the $count '
          '${count == 1 ? 'item' : 'items'} you scanned: everything else in this department '
          'is reported as missing. Completion is final \u2014 this session cannot be '
          'restarted or added to.',
      confirmLabel: 'Complete',
      icon: Icons.task_alt,
    );
    if (!confirmed || !mounted) return;

    setState(() => _completing = true);
    try {
      // The camera stops for good: the server now refuses further scans, so leaving it
      // running would let a user keep scanning into a 409.
      await _scannerKey.currentState?.pause();
      final outcome = await ref.read(auditActionsProvider).complete(widget.auditId);
      if (!mounted) return;
      showAppToast(
        context,
        message: 'Audit complete \u2014 ${outcome.counts.found} found, '
            '${outcome.counts.missing} missing, '
            '${outcome.counts.locationMismatch} in the wrong place.',
        tone: ToastTone.success,
      );
      context.pushReplacement('/audit/${widget.auditId}/report');
    } on ApiError catch (error) {
      if (mounted) {
        showAppToast(context, message: error.message, tone: ToastTone.error);
        await _scannerKey.currentState?.resume();
      }
    } on NetworkError catch (error) {
      if (mounted) {
        showAppToast(context, message: error.message, tone: ToastTone.error);
        await _scannerKey.currentState?.resume();
      }
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }
}
