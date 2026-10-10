import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/audits_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/audit/new` (§10.8).
///
/// Two controls, and both are deliberately narrower than they could be:
///
///   * **Scope type is a pre-selected, non-interactive "Department".** `POST /audits`
///     accepts any non-empty `scopeType`, but `POST /audits/:id/complete` 400s for
///     anything except `DEPARTMENT`. Offering "Building" or "All" would be offering a
///     session that can never be completed, so the control states the truth — it looks
///     locked because it *is* locked, rather than looking editable and being ignored.
///   * **The department picker is locked to departments actually observed on active
///     items.** Completion matches `Item.department` exactly and case-sensitively, so
///     free text here does not start a wider audit — it starts an unmatched one. This
///     is the opposite mode from the item form's department field, which must accept a
///     new value; §8 calls the two modes out by name for exactly this reason.
///
/// There is no `GET /departments` endpoint (gap G9), so the list is derived from the
/// register. If it cannot be fetched or comes back empty, "Start" is **disabled with
/// an explanation** rather than left enabled to fail later.
class AuditNewPage extends ConsumerStatefulWidget {
  const AuditNewPage({super.key});

  @override
  ConsumerState<AuditNewPage> createState() => _AuditNewPageState();
}

class _AuditNewPageState extends ConsumerState<AuditNewPage> {
  String? _department;
  var _starting = false;

  @override
  Widget build(BuildContext context) {
    final departments = ref.watch(observedDepartmentsProvider);
    final options = departments.value ?? const <String>[];

    return PageScaffold(
      title: 'Start an audit',
      subtitle: 'Reconcile one department against the register, item by item',
      maxWidth: 560,
      onRefresh: () async {
        ref.invalidate(observedDepartmentsProvider);
        await ref.read(observedDepartmentsProvider.future);
      },
      children: [
        const InfoNote(
          icon: Icons.info_outline,
          message: 'An audit walks a department and records every item it finds. When you '
              'finish, what was scanned is compared with the register \u2014 items that were '
              'never scanned come back as missing.',
        ),
        const SizedBox(height: AppSpace.stack),

        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppSelectField<String>(
                label: 'Scope',
                value: 'DEPARTMENT',
                options: const ['DEPARTMENT'],
                labelOf: (_) => 'Department',
                enabled: false,
                onChanged: (_) {},
                helper: 'Only a department scope can be completed.',
              ),
              const SizedBox(height: AppSpace.stack),

              if (departments.isLoading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: AppSpace.s5),
                  child: Center(child: InlineSpinner()),
                )
              else if (departments.hasError)
                InlineError(
                  error: departments.error!,
                  onRetry: () => ref.invalidate(observedDepartmentsProvider),
                )
              else
                AppSelectField<String>(
                  label: 'Department',
                  value: _department,
                  options: options,
                  labelOf: (value) => value,
                  required: true,
                  onChanged: (value) => setState(() => _department = value),
                  helper: 'Choose the exact department below \u2014 the audit matches it '
                      'exactly, character for character.',
                ),

              if (!departments.isLoading && !departments.hasError && options.isEmpty) ...[
                const SizedBox(height: AppSpace.s3),
                const InfoNote(
                  icon: Icons.warning_amber_outlined,
                  message: 'No departments are in use yet, so there is nothing to audit. '
                      'Register an item first \u2014 the department list is built from the '
                      'items themselves.',
                  tone: InfoTone.warning,
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: AppSpace.s5),
        AppButton(
          label: 'Start the walkthrough',
          icon: Icons.play_circle_outline,
          size: AppButtonSize.lg,
          expand: true,
          loading: _starting,
          onPressed: _department == null || _starting ? null : _start,
        ),
        const SizedBox(height: AppSpace.s2),
        const Text(
          'You can leave and come back: the session stays open until you complete it, and '
          'scans are stored as they happen.',
          style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.5),
        ),
      ],
    );
  }

  Future<void> _start() async {
    final department = _department;
    if (department == null) return;

    setState(() => _starting = true);
    try {
      final session = await ref.read(auditActionsProvider).create(department: department);
      if (!mounted) return;
      // `pushReplacement` because backing out of a scan walkthrough should return to
      // the dashboard, not to the form that created the session that is now running.
      context.pushReplacement('/audit/${session.id}/scan');
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }
}
