import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../data/providers/audits_provider.dart';
import '../../data/providers/core_providers.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/audit.dart';
import '../../models/category.dart';
import '../../models/enums.dart';
import '../../models/report.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/reports` (§10.9) — three exports, each with its own filter form.
///
/// Two rules from the spec shape the whole screen:
///
///   * **Every date range says it is UTC, next to the control.** The server parses a
///     bare `YYYY-MM-DD` as UTC and `dateTo` covers the whole UTC day, so a device in
///     Addis (UTC+3) whose user picked "today" locally would otherwise file a report
///     that appears to be missing the most recent three hours of data. The hint is
///     the difference between a correct report and a bug report.
///   * **Downloads go through the authenticated byte helper.** These endpoints sit
///     behind `authenticate`; a plain URL handoff would send no token and save a 401
///     body with a `.csv` extension — a file that opens in a spreadsheet as garbage.
///
/// The downloaded file lands in the app's documents folder and is offered through the
/// OS share sheet, which on a phone is the real "save as" (see `core/files.dart` for
/// why shared `/Downloads` is deliberately not used).
class ReportsPage extends ConsumerStatefulWidget {
  const ReportsPage({super.key});

  @override
  ConsumerState<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends ConsumerState<ReportsPage> {
  // Inventory
  String? _inventoryCategory;
  String? _inventoryDepartment;
  String? _inventoryStatus;
  String? _inventoryFrom;
  String? _inventoryTo;

  // Disposals
  String? _disposalsDepartment;
  String? _disposalsFrom;
  String? _disposalsTo;

  // Audit
  String? _auditId;

  ReportFormat _format = ReportFormat.csv;
  String? _busy; // which report is downloading

  @override
  Widget build(BuildContext context) {
    final departments = ref.watch(observedDepartmentsProvider).value ?? const <String>[];
    final categories = ref.watch(categoriesProvider).value ?? const <Category>[];
    final audits = ref.watch(auditListProvider).value?.audits ?? const <AuditSessionSummary>[];

    return PageScaffold(
      title: 'Reports',
      subtitle: 'Exports run against the stored record, not what is on screen',
      maxWidth: 720,
      children: [
        const InfoNote(
          icon: Icons.public_outlined,
          message: 'Every date range below is in UTC. A day ends at midnight UTC, not your '
              'local midnight \u2014 so a report for "today" can look a few hours short or long '
              'if you are reading it in East Africa Time.',
        ),
        const SizedBox(height: AppSpace.s5),

        _ReportCard(
          title: 'Inventory',
          subtitle: 'Every item in the register, with its location, condition and value.',
          icon: Icons.inventory_2_outlined,
          busy: _busy == 'inventory',
          format: _format,
          onFormatChanged: (format) => setState(() => _format = format),
          onDownload: () => _downloadInventory(),
          children: [
            AppFilterChip<String>(
              label: 'Department',
              value: _inventoryDepartment,
              allLabel: 'All departments',
              options: departments,
              labelOf: (value) => value,
              onChanged: (value) => setState(() => _inventoryDepartment = value),
            ),
            AppFilterChip<String>(
              label: 'Category',
              value: _inventoryCategory,
              allLabel: 'All categories',
              options: [for (final category in categories) category.id],
              labelOf: (id) => _categoryName(categories, id),
              onChanged: (value) => setState(() => _inventoryCategory = value),
            ),
            AppFilterChip<ItemStatus>(
              label: 'Status',
              value: _statusFromWire(_inventoryStatus),
              allLabel: 'In service and disposed',
              options: const [ItemStatus.active, ItemStatus.disposed],
              labelOf: (value) => value.label,
              onChanged: (value) =>
                  setState(() => _inventoryStatus = value?.wire),
            ),
            _dateRange(
              from: _inventoryFrom,
              to: _inventoryTo,
              onFrom: (value) => setState(() => _inventoryFrom = value),
              onTo: (value) => setState(() => _inventoryTo = value),
              label: 'Registered between',
            ),
          ],
        ),

        const SizedBox(height: AppSpace.stack),
        _ReportCard(
          title: 'Disposals',
          subtitle: 'What left service, when, and why.',
          icon: Icons.archive_outlined,
          busy: _busy == 'disposals',
          format: _format,
          onFormatChanged: (format) => setState(() => _format = format),
          onDownload: () => _downloadDisposals(),
          children: [
            AppFilterChip<String>(
              label: 'Department',
              value: _disposalsDepartment,
              allLabel: 'All departments',
              options: departments,
              labelOf: (value) => value,
              onChanged: (value) => setState(() => _disposalsDepartment = value),
            ),
            _dateRange(
              from: _disposalsFrom,
              to: _disposalsTo,
              onFrom: (value) => setState(() => _disposalsFrom = value),
              onTo: (value) => setState(() => _disposalsTo = value),
              label: 'Disposed between',
            ),
          ],
        ),

        const SizedBox(height: AppSpace.stack),
        _ReportCard(
          title: 'Audit',
          subtitle: 'One session\u2019s result, exactly as it was recorded.',
          icon: Icons.fact_check_outlined,
          busy: _busy == 'audit',
          format: _format,
          onFormatChanged: (format) => setState(() => _format = format),
          onDownload: _auditId == null ? null : () => _downloadAudit(),
          children: [
            if (audits.isEmpty)
              const Text(
                'No audit sessions exist yet. Run one from the More sheet, then export its '
                'result here.',
                style: TextStyle(fontSize: 13, color: AppColors.aauGray500, height: 1.5),
              )
            else
              AppSelectField<String>(
                label: 'Audit session',
                value: _auditId,
                options: [for (final audit in audits) audit.id],
                labelOf: (id) => _auditLabel(audits, id),
                onChanged: (value) => setState(() => _auditId = value),
                helper: 'Newest first. In-progress sessions export what has been scanned so '
                    'far.',
              ),
          ],
        ),

        const SizedBox(height: AppSpace.s5),
        const Text(
          'A download is offered through the system share sheet, so you can send it on or '
          'open it in a spreadsheet app straight away.',
          style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.55),
        ),
      ],
    );
  }

  Widget _dateRange({
    required String? from,
    required String? to,
    required ValueChanged<String?> onFrom,
    required ValueChanged<String?> onTo,
    required String label,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: AppSpace.s2),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.aauGray700,
            ),
          ),
        ),
        const SizedBox(height: AppSpace.stackTight),
        Row(
          children: [
            Expanded(
              child: AppDateField(
                label: 'From (UTC)',
                value: from,
                onChanged: onFrom,
                hint: 'No lower bound',
                clearLabel: 'Clear',
              ),
            ),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: AppDateField(
                label: 'To (UTC)',
                value: to,
                onChanged: onTo,
                hint: 'No upper bound',
                clearLabel: 'Clear',
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _downloadInventory() async {
    final query = InventoryReportQuery(
      department: _inventoryDepartment,
      categoryId: _inventoryCategory,
      status: _statusFromWire(_inventoryStatus),
      dateFrom: _inventoryFrom,
      dateTo: _inventoryTo,
    );
    await _run(
      key: 'inventory',
      label: 'Inventory report',
      fetch: (format) => ref.read(reportsApiProvider).inventory(query, format),
    );
  }

  Future<void> _downloadDisposals() async {
    final query = DisposalsReportQuery(
      department: _disposalsDepartment,
      dateFrom: _disposalsFrom,
      dateTo: _disposalsTo,
    );
    await _run(
      key: 'disposals',
      label: 'Disposals report',
      fetch: (format) => ref.read(reportsApiProvider).disposals(query, format),
    );
  }

  Future<void> _downloadAudit() async {
    final auditId = _auditId;
    if (auditId == null) return;
    await _run(
      key: 'audit',
      label: 'Audit report',
      fetch: (format) => ref.read(reportsApiProvider).audit(auditId, format),
    );
  }

  /// One download path for all three reports: fetch bytes, save, then offer the two
  /// things a user actually wants — send it on, or open it now.
  Future<void> _run({
    required String key,
    required String label,
    required Future<ReportFile> Function(ReportFormat format) fetch,
  }) async {
    setState(() => _busy = key);
    try {
      final report = await fetch(_format);
      final saved = await saveBytes(
        bytes: report.bytes,
        filename: report.filename,
        mimeType: report.mimeType,
      );
      if (!mounted) return;

      // A zero-byte file is the signature of an export that matched nothing. Saying
      // so beats handing over an empty spreadsheet and letting the user wonder.
      if (saved.file.lengthSync() == 0) {
        showAppToast(
          context,
          message: 'Nothing matched those filters \u2014 the file is empty.',
          tone: ToastTone.info,
        );
        return;
      }

      showAppToast(
        context,
        message: '$label saved as ${saved.filename}.',
        tone: ToastTone.success,
        actionLabel: 'Share',
        onAction: () => shareFile(saved, subject: label),
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
      if (mounted) setState(() => _busy = null);
    }
  }

  static ItemStatus? _statusFromWire(String? wire) {
    if (wire == null) return null;
    final status = ItemStatus.fromJson(wire);
    return status == ItemStatus.unknown ? null : status;
  }

  static String _categoryName(List<Category> categories, String id) {
    for (final category in categories) {
      if (category.id == id) return category.name;
    }
    return 'Category';
  }

  static String _auditLabel(List<AuditSessionSummary> audits, String id) {
    for (final audit in audits) {
      if (audit.id == id) {
        final scope = audit.scopeValue ?? audit.scopeType;
        final when = formatDateUtc(audit.startedAt) ?? '';
        return '$scope \u00b7 $when${audit.completed ? '' : ' \u00b7 in progress'}';
      }
    }
    return 'Audit session';
  }
}

/// One export: a heading, its filters, and a single download button.
///
/// "a single 'Download CSV' button" in the spec, extended to a format choice —
/// both formats are supported by every endpoint and `?format=` anything else is a 400
/// rather than a silent JSON fallback, so offering the pair is honest where offering
/// one and silently producing the other would not be.
class _ReportCard extends StatelessWidget {
  const _ReportCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.children,
    required this.format,
    required this.onFormatChanged,
    required this.busy,
    required this.onDownload,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final List<Widget> children;
  final ReportFormat format;
  final ValueChanged<ReportFormat> onFormatChanged;
  final bool busy;
  final VoidCallback? onDownload;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: const BoxDecoration(
                  color: AppColors.brand50,
                  borderRadius: AppRadius.smAll,
                ),
                child: Icon(icon, size: 19, color: AppColors.brand700),
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.aauGray500,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s4),
          Wrap(spacing: AppSpace.s2, runSpacing: AppSpace.s2, children: children),
          const SizedBox(height: AppSpace.s4),
          Row(
            children: [
              _FormatToggle(
                format: format,
                onChanged: onFormatChanged,
                enabled: !busy,
              ),
              const Spacer(),
              AppButton(
                label: 'Download',
                icon: Icons.download_outlined,
                loading: busy,
                onPressed: busy ? null : onDownload,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FormatToggle extends StatelessWidget {
  const _FormatToggle({required this.format, required this.onChanged, required this.enabled});

  final ReportFormat format;
  final ValueChanged<ReportFormat> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.aauGray100,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: AppColors.aauGray200),
      ),
      padding: const EdgeInsets.all(2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final option in ReportFormat.values)
            InkWell(
              onTap: enabled ? () => onChanged(option) : null,
              borderRadius: const BorderRadius.all(Radius.circular(999)),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: 6),
                decoration: BoxDecoration(
                  color: option == format ? Colors.white : Colors.transparent,
                  borderRadius: const BorderRadius.all(Radius.circular(999)),
                  border: Border.all(
                    color: option == format ? AppColors.aauGray300 : Colors.transparent,
                  ),
                ),
                child: Text(
                  option.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: option == format ? FontWeight.w700 : FontWeight.w500,
                    color: option == format ? AppColors.aauGray900 : AppColors.aauGray500,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
