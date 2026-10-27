import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/system_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/department.dart';
import '../../models/enums.dart';
import '../../models/user.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/segmented_tabs.dart';
import '../../widgets/states.dart';

/// `/admin/departments` — the college's departments, and who heads each.
///
/// A college's departments are not a fixed list: a new programme means a new
/// department, and the register has to be able to hold it. The screen is the web
/// page's, in the same order — add a department, then the list with each unit's
/// head, staff count and whether it accepts online account requests.
///
/// **Appointing a head is offered only where a unit has none**, because a
/// takeover is a different action with different consequences (the unit's held
/// items move to "returned unverified"); the server's `activate-head` is the
/// handover, and it is named as such in the sheet.
class DepartmentsPage extends ConsumerStatefulWidget {
  const DepartmentsPage({super.key});

  @override
  ConsumerState<DepartmentsPage> createState() => _DepartmentsPageState();
}

class _DepartmentsPageState extends ConsumerState<DepartmentsPage> {
  final _name = TextEditingController();
  final _code = TextEditingController();
  var _acceptsSelfReg = true;
  var _creating = false;
  String? _nameError;
  String? _codeError;
  Object? _formError;
  String? _busyUnitId;

  /// Which half of the screen is showing: the list of units, or the form that
  /// adds one. They were stacked on one page, so the form pushed the list —
  /// the reason somebody opened the screen — below the fold.
  var _section = 0;

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final departments = ref.watch(adminDepartmentsProvider);

    return PageScaffold(
      title: 'Departments',
      subtitle: 'The college\u2019s departments, who heads each, and who may ask for an account',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(adminDepartmentsProvider);
        await ref.read(adminDepartmentsProvider.future);
      },
      children: [
        SegmentedTabs(
          labels: const ['Existing departments', 'Add a department'],
          index: _section,
          onChanged: (index) => setState(() => _section = index),
        ),
        if (_section == 1)
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Add a department',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'It is created with no head. A request from a unit without one waits for a '
                  'system administrator until a head is appointed.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: AppColors.aauGray500,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: AppSpace.s4),
                AppTextField(
                  label: 'Name',
                  controller: _name,
                  hint: 'Environmental Engineering',
                  errorText: _nameError,
                  enabled: !_creating,
                  required: true,
                ),
                const SizedBox(height: AppSpace.stack),
                AppTextField(
                  label: 'Code',
                  controller: _code,
                  hint: 'ENVE',
                  errorText: _codeError,
                  helper: 'Short and unique \u2014 the letters people see on a tag.',
                  enabled: !_creating,
                  uppercase: true,
                  required: true,
                ),
                const SizedBox(height: AppSpace.s2),
                // The card paints its own background, and a ListTile paints
                // its ink on the nearest Material — without this layer the
                // checkbox's splash is hidden behind the card.
                Material(
                  type: MaterialType.transparency,
                  child: CheckboxListTile(
                    value: _acceptsSelfReg,
                    onChanged: _creating
                        ? null
                        : (value) =>
                              setState(() => _acceptsSelfReg = value ?? true),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: const Text(
                      'Staff of this department may request an account online',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.aauGray700,
                      ),
                    ),
                  ),
                ),
                if (_formError != null) ...[
                  const SizedBox(height: AppSpace.s2),
                  InlineError(error: _formError!),
                ],
                const SizedBox(height: AppSpace.s3),
                AppButton(
                  label: 'Add a department',
                  icon: Icons.add_business_outlined,
                  expand: true,
                  loading: _creating,
                  onPressed: _creating ? null : _create,
                ),
              ],
            ),
          ),

        if (_section == 0)
          departments.when(
            loading: () => const SkeletonList(count: 4, height: 84),
            error: (error, _) => InlineError(
              error: error,
              onRetry: () => ref.invalidate(adminDepartmentsProvider),
            ),
            data: (units) {
              final departments = units
                  .where((unit) => unit.isDepartment)
                  .toList();
              if (departments.isEmpty) {
                return const AppCard(
                  child: Text(
                    'No departments yet. Add the college\u2019s first one to start registering '
                    'assets against it.',
                    style: TextStyle(
                      fontSize: 13.5,
                      color: AppColors.aauGray500,
                      height: 1.5,
                    ),
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SectionHeader(
                    title:
                        '${departments.length} '
                        '${departments.length == 1 ? 'department' : 'departments'}',
                    subtitle:
                        'Headless units still accept items; the approval queue falls back '
                        'to a system administrator until someone is appointed.',
                  ),
                  for (final department in departments) ...[
                    _DepartmentCard(
                      department: department,
                      busy: _busyUnitId == department.id,
                      onAppoint: () => _appoint(department),
                    ),
                    const SizedBox(height: AppSpace.s2),
                  ],
                ],
              );
            },
          ),
      ],
    );
  }

  Future<void> _create() async {
    final name = _name.text.trim();
    final code = _code.text.trim();

    final errors = <String, String?>{};
    if (name.length < 2) errors['name'] = 'The department needs a name.';
    if (code.length < 2) {
      errors['code'] = 'The department needs a code.';
    } else if (!RegExp(r'^[A-Za-z0-9-]+$').hasMatch(code)) {
      errors['code'] = 'The code is letters, digits and dashes only.';
    }

    setState(() {
      _nameError = errors['name'];
      _codeError = errors['code'];
      _formError = null;
    });
    if (errors.values.any((value) => value != null)) return;

    setState(() => _creating = true);
    try {
      await ref
          .read(adminDepartmentActionsProvider)
          .create(name: name, code: code, acceptsSelfReg: _acceptsSelfReg);
      if (!mounted) return;
      _name.clear();
      _code.clear();
      setState(() {
        _acceptsSelfReg = true;
        // Back to the list, where the new row is: the next question is "is it
        // there?", and an emptied form does not answer it.
        _section = 0;
      });
      showAppToast(
        context,
        message: '$name has been added. It has no head yet.',
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      // A duplicate name or code is a field problem, and the server's sentence
      // names which one: it goes under the fields rather than in a toast that
      // disappears while the user is still editing them.
      setState(() {
        if (error.status == 409) {
          _codeError = error.message;
        } else {
          _formError = error;
        }
      });
    } on NetworkError catch (error) {
      setState(() => _formError = error);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  /// One picker of people, then a confirmation that says what the handover does.
  Future<void> _appoint(AdminDepartment department) async {
    final accounts = ref.read(usersProvider).value ?? const <UserSummary>[];
    // The server refuses anyone who is not already a Department Head
    // (`activate-head` answers 400), so the picker offers exactly that set
    // rather than a list that can only fail.
    final candidates = [
      for (final account in accounts)
        if (account.role == Role.departmentHead &&
            account.accountStatus == AccountStatus.active)
          account,
    ];

    if (candidates.isEmpty) {
      showAppToast(
        context,
        message:
            'No Department Head account is available to appoint. Invite one first, then '
            'appoint them here.',
        tone: ToastTone.info,
      );
      return;
    }

    final chosen = await showAppSheet<UserSummary>(
      context,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.s4,
              AppSpace.s4,
              AppSpace.s4,
              AppSpace.s2,
            ),
            child: Text(
              'Head of ${department.name}',
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w600,
                color: AppColors.aauGray900,
              ),
            ),
          ),
          for (final account in candidates)
            ListTile(
              title: Text(account.fullName),
              subtitle: Text(account.email),
              onTap: () => Navigator.of(context).pop(account),
            ),
          const SizedBox(height: AppSpace.s2),
        ],
      ),
    );
    if (chosen == null || !mounted) return;

    final confirmed = await showConfirmDialog(
      context,
      title: 'Appoint ${chosen.fullName}?',
      body:
          '${chosen.fullName} becomes the head of ${department.name}. The unit\u2019s held '
          'items move to "returned unverified" and the new head verifies them one by one. '
          'Items a previous head held personally stay with them \u2014 a role change never '
          'moves personal custody.',
      confirmLabel: 'Appoint',
      icon: Icons.how_to_reg_outlined,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busyUnitId = department.id);
    try {
      await ref
          .read(adminDepartmentActionsProvider)
          .activateHead(orgUnitId: department.id, newHeadId: chosen.id);
      if (mounted) {
        showAppToast(
          context,
          message: '${chosen.fullName} is now the head of ${department.name}.',
          tone: ToastTone.success,
        );
      }
    } on ApiError catch (error) {
      if (mounted) {
        showAppToast(context, message: error.message, tone: ToastTone.error);
      }
    } on NetworkError catch (error) {
      if (mounted) {
        showAppToast(context, message: error.message, tone: ToastTone.error);
      }
    } finally {
      if (mounted) setState(() => _busyUnitId = null);
    }
  }
}

class _DepartmentCard extends StatelessWidget {
  const _DepartmentCard({
    required this.department,
    required this.busy,
    required this.onAppoint,
  });

  final AdminDepartment department;
  final bool busy;
  final VoidCallback onAppoint;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            department.name,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.aauGray900,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.s2),
                        Text(
                          department.code,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: AppColors.aauGray500,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      department.headName == null
                          ? 'No head appointed'
                          : 'Head: ${department.headName}',
                      style: TextStyle(
                        fontSize: 12.5,
                        color: department.headName == null
                            ? AppColors.warning700
                            : AppColors.aauGray600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${department.staffCount} staff \u00b7 '
                      '${department.acceptsSelfReg ? 'accepts online account requests' : 'does not accept online account requests'}',
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.aauGray400,
                      ),
                    ),
                  ],
                ),
              ),
              if (busy)
                const Padding(
                  padding: EdgeInsets.all(AppSpace.s2),
                  child: InlineSpinner(size: 18),
                ),
            ],
          ),
          if (!department.hasHead && !busy) ...[
            const SizedBox(height: AppSpace.s3),
            AppButton(
              label: 'Appoint a head',
              icon: Icons.how_to_reg_outlined,
              variant: AppButtonVariant.outline,
              size: AppButtonSize.sm,
              expand: true,
              onPressed: onAppoint,
            ),
          ],
        ],
      ),
    );
  }
}
