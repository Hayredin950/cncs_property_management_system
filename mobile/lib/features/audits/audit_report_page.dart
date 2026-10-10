import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../data/providers/audits_provider.dart';
import '../../data/providers/core_providers.dart';
import '../../models/audit.dart';
import '../../models/enums.dart';
import '../../models/report.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badge.dart';
import '../../widgets/data_display.dart';
import '../../widgets/feedback.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../../widgets/status_badges.dart';

/// `/audit/:id/report` (§10.8) — the audit's result.
///
/// Gap G1 is closed here, and this screen is the reason it mattered: the report reads
/// `GET /audits/:id`, so it survives a reload, a shared link, and a cold start rather
/// than living only in the navigation state that created it. The per-item breakdown
/// exists *only* on this endpoint — the completion response returns counts and bare
/// item-id lists — which is exactly why the screen reads the session back instead of
/// rendering whatever the previous screen happened to be holding.
///
/// The three counts are coloured per §3.2, and they are deliberately **three different
/// hues rather than one severity ramp**: "found but in the wrong place" is a different
/// kind of problem from "not found", not a worse or better version of it.
class AuditReportPage extends ConsumerStatefulWidget {
  const AuditReportPage({super.key, required this.auditId});

  final String auditId;

  @override
  ConsumerState<AuditReportPage> createState() => _AuditReportPageState();
}

class _AuditReportPageState extends ConsumerState<AuditReportPage> {
  ReportFormat _format = ReportFormat.csv;
  var _busy = false;

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(auditReadbackProvider(widget.auditId));

    return session.when(
      loading: () => const PageScaffold(
        title: 'Loading report',
        maxWidth: 720,
        children: [SkeletonDetail()],
      ),
      error: (error, _) => PageScaffold(
        title: 'Audit report',
        maxWidth: 720,
        children: [
          InlineError(
            error: error,
            onRetry: () => ref.invalidate(auditReadbackProvider(widget.auditId)),
          ),
        ],
      ),
      data: (data) => _body(data),
    );
  }

  Widget _body(AuditSessionReadback data) {
    final counts = data.counts;
    final grouped = data.rowsByResult;

    return PageScaffold(
      title: data.scopeValue ?? data.scopeType,
      subtitle: data.completed
          ? 'Completed ${formatDateTimeUtc(data.completedAt) ?? ''}'
          : 'In progress \u2014 started ${formatDateUtc(data.startedAt) ?? ''}',
      maxWidth: 720,
      onRefresh: () async {
        ref.invalidate(auditReadbackProvider(widget.auditId));
        await ref.read(auditReadbackProvider(widget.auditId).future);
      },
      children: [
        if (!data.completed)
          const Padding(
            padding: EdgeInsets.only(bottom: AppSpace.stack),
            child: InfoNote(
              icon: Icons.hourglass_empty,
              message: 'This session has not been completed, so these counts are provisional '
                  '\u2014 nothing is classified as missing until completion recomputes the '
                  'department against the scans.',
              tone: InfoTone.warning,
            ),
          ),

        Row(
          children: [
            Expanded(
              child: StatCard(
                value: '${counts.found}',
                label: 'Found',
                icon: Icons.inventory_2_outlined,
                tone: BadgeTone.success,
              ),
            ),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: StatCard(
                value: '${counts.missing}',
                label: 'Missing',
                icon: Icons.production_quantity_limits_outlined,
                tone: BadgeTone.danger,
              ),
            ),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: StatCard(
                value: '${counts.locationMismatch}',
                label: 'Wrong location',
                icon: Icons.wrong_location_outlined,
                tone: BadgeTone.warning,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s3),
        Text(
          '${counts.total} '
          '${counts.total == 1 ? 'item' : 'items'} accounted for in this scope.',
          style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
        ),

        const SizedBox(height: AppSpace.s6),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Export this report',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                      ),
                    ),
                  ),
                  AppButton(
                    label: _format.label,
                    variant: AppButtonVariant.outline,
                    size: AppButtonSize.sm,
                    icon: Icons.swap_horiz,
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                              _format = _format == ReportFormat.csv
                                  ? ReportFormat.pdf
                                  : ReportFormat.csv;
                            }),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.s3),
              AppButton(
                label: 'Download ${_format.label}',
                icon: Icons.download_outlined,
                expand: true,
                loading: _busy,
                onPressed: _busy ? null : _download,
              ),
              const SizedBox(height: AppSpace.s2),
              const Text(
                'The export includes every row, not just what fits on this screen, and it '
                'is fetched with your session rather than opened as a link.',
                style: TextStyle(fontSize: 12, color: AppColors.aauGray500, height: 1.45),
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpace.s6),
        if (data.rows.isEmpty)
          const EmptyState(
            icon: Icons.fact_check_outlined,
            title: 'No results recorded',
            body: 'This session has no stored scan rows yet.',
            compact: true,
          )
        else
          // Fixed order: found, then missing, then wrong location. The report reads
          // the same way every time, which is what makes two reports comparable.
          for (final result in const [
            AuditItemResult.found,
            AuditItemResult.missing,
            AuditItemResult.locationMismatch,
          ])
            if ((grouped[result] ?? const []).isNotEmpty) ...[
              SectionHeader(
                title: result.label,
                subtitle: '${grouped[result]!.length} '
                    '${grouped[result]!.length == 1 ? 'item' : 'items'}',
              ),
              for (final row in grouped[result]!) ...[
                AppCard(
                  padding: const EdgeInsets.all(AppSpace.s3),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              row.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: AppColors.aauGray900,
                              ),
                            ),
                            const SizedBox(height: 2),
                            TagIdText(tagId: row.tagId, fontSize: 11.5),
                            const SizedBox(height: 2),
                            Text(
                              row.locationLine.isEmpty
                                  ? 'No location recorded'
                                  : row.locationLine,
                              maxLines: 2,
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: AppColors.aauGray500,
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpace.s2),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          AuditResultBadge(result: row.result, dense: true),
                          if (row.scannedAt != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              formatRelativeTime(row.scannedAt),
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.aauGray400,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.s2),
              ],
              const SizedBox(height: AppSpace.s3),
            ],
      ],
    );
  }

  Future<void> _download() async {
    setState(() => _busy = true);
    try {
      final report = await ref
          .read(reportsApiProvider)
          .audit(widget.auditId, _format);
      final saved = await saveBytes(
        bytes: report.bytes,
        filename: report.filename,
        mimeType: report.mimeType,
      );
      if (!mounted) return;
      showAppToast(
        context,
        message: 'Saved ${saved.filename}.',
        tone: ToastTone.success,
        actionLabel: 'Share',
        onAction: () => shareFile(saved, subject: 'Audit report'),
      );
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } catch (error) {
      if (mounted) {
        showAppToast(
          context,
          message: 'The file could not be written to this device.',
          tone: ToastTone.error,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
