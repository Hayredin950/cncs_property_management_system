import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/items_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/building.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/segmented_tabs.dart';
import '../../widgets/states.dart';

/// `/admin/buildings` — the college's buildings, and who may add one.
///
/// The endpoint has existed all along (`GET/POST/PUT/DELETE /buildings`,
/// `BUILDING_MANAGE`) and the phone could only ever pick from it. That meant a
/// campus with a new building had to wait for the web screen, and a building
/// whose name was typed two ways split its items between two filter results.
/// This is the web page's Flutter form, in the same order: add, then the list
/// with each building's item count.
///
/// Delete is refused while the building holds items — the server answers `409`,
/// and the row says so *before* the tap rather than after it: removing a
/// building that items point at would orphan them.
class AdminBuildingsPage extends ConsumerStatefulWidget {
  const AdminBuildingsPage({super.key});

  @override
  ConsumerState<AdminBuildingsPage> createState() => _AdminBuildingsPageState();
}

class _AdminBuildingsPageState extends ConsumerState<AdminBuildingsPage> {
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _address = TextEditingController();
  final _description = TextEditingController();

  /// Which half of the screen is showing: the register of buildings, or the
  /// form that adds one. They used to be stacked on one long page, so the form
  /// pushed the list the officer came for off the first screen.
  var _section = 0;
  final _search = TextEditingController();

  var _creating = false;
  String? _nameError;
  String? _codeError;
  Object? _formError;
  String? _busyId;

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    _address.dispose();
    _description.dispose();
    _search.dispose();
    super.dispose();
  }

  /// Every building whose name, code or address contains [query].
  ///
  /// The search is local: the list is the college's buildings, which is tens of
  /// rows, not pages of them, and a round trip per keystroke would make the
  /// field feel broken on a phone.
  List<Building> _matching(List<Building> rows) {
    final query = _search.text.trim().toLowerCase();
    if (query.isEmpty) return rows;
    return rows
        .where(
          (building) =>
              building.name.toLowerCase().contains(query) ||
              building.code.toLowerCase().contains(query) ||
              (building.address ?? '').toLowerCase().contains(query),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final buildings = ref.watch(buildingsProvider);

    return PageScaffold(
      title: 'Buildings',
      subtitle: 'Where the college\u2019s items live \u2014 the names the register filters by',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(buildingsProvider);
        await ref.read(buildingsProvider.future);
      },
      children: [
        SegmentedTabs(
          labels: const ['Buildings', 'Add a building'],
          index: _section,
          onChanged: (index) => setState(() => _section = index),
        ),
        if (_section == 1)
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Add a building',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Registering an item picks from this list, which is why the names are kept '
                  'here rather than typed on each form.',
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
                  hint: 'Lecture Hall 2',
                  errorText: _nameError,
                  enabled: !_creating,
                  required: true,
                ),
                const SizedBox(height: AppSpace.stack),
                AppTextField(
                  label: 'Code',
                  controller: _code,
                  hint: 'LH2',
                  errorText: _codeError,
                  helper: 'Short and unique \u2014 the letters people see on a tag.',
                  enabled: !_creating,
                  uppercase: true,
                  required: true,
                ),
                const SizedBox(height: AppSpace.stack),
                AppTextField(
                  label: 'Address (optional)',
                  controller: _address,
                  hint: 'North campus, beside the library',
                  enabled: !_creating,
                ),
                const SizedBox(height: AppSpace.stack),
                AppTextField(
                  label: 'Description (optional)',
                  controller: _description,
                  maxLines: 2,
                  enabled: !_creating,
                ),
                if (_formError != null) ...[
                  const SizedBox(height: AppSpace.stack),
                  InlineError(error: _formError!),
                ],
                const SizedBox(height: AppSpace.s4),
                AppButton(
                  label: 'Add a building',
                  icon: Icons.add_home_work_outlined,
                  expand: true,
                  loading: _creating,
                  onPressed: _creating ? null : _create,
                ),
              ],
            ),
          ),
        if (_section == 0) ...[
          AppTextField(
            label: 'Search buildings',
            controller: _search,
            hint: 'Name, code or address',
            prefixIcon: Icons.search,
            onChanged: (_) => setState(() {}),
          ),
          buildings.when(
            loading: () => const SkeletonList(count: 3, height: 84),
            error: (error, _) => InlineError(
              error: error,
              onRetry: () => ref.invalidate(buildingsProvider),
            ),
            data: (rows) {
              if (rows.isEmpty) {
                return const AppCard(
                  child: Text(
                    'No buildings yet. Add the first one so items have somewhere to live.',
                    style: TextStyle(
                      fontSize: 13.5,
                      color: AppColors.aauGray500,
                      height: 1.5,
                    ),
                  ),
                );
              }
              final matches = _matching(rows);
              if (matches.isEmpty) {
                return AppCard(
                  padding: const EdgeInsets.all(AppSpace.s4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'No building matches \u201c${_search.text.trim()}\u201d.',
                        style: const TextStyle(
                          fontSize: 13.5,
                          color: AppColors.aauGray600,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: AppSpace.s2),
                      TextButton(
                        onPressed: () {
                          _search.clear();
                          setState(() {});
                        },
                        child: const Text('Clear the search'),
                      ),
                    ],
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SectionHeader(
                    title: matches.length == rows.length
                        ? '${rows.length} ${rows.length == 1 ? 'building' : 'buildings'}'
                        : '${matches.length} of ${rows.length} buildings',
                    subtitle:
                        'Tap an item count to see what is registered there.',
                  ),
                  for (final building in matches) ...[
                    _BuildingCard(
                      building: building,
                      busy: _busyId == building.id,
                      // Set the filter on the register's own state and then go
                      // there: the screen reads `itemQueryProvider`, so this lands
                      // on a filtered list rather than a query string it ignores.
                      onOpenItems: () {
                        ref
                            .read(itemQueryProvider.notifier)
                            .setBuilding(building.name);
                        context.push('/items');
                      },
                      onEdit: () => _edit(building),
                      // Offered only where the server would allow it. The control
                      // carries the reason on it instead of failing on the tap.
                      onDelete: building.itemCount > 0
                          ? null
                          : () => _delete(building),
                    ),
                    const SizedBox(height: AppSpace.s2),
                  ],
                  const SizedBox(height: AppSpace.s4),
                  const InfoNote(
                    icon: Icons.info_outline,
                    message:
                        'A building that holds items cannot be removed. Move the items to '
                        'another building first \u2014 deleting it would leave them with no location.',
                    tone: InfoTone.neutral,
                  ),
                ],
              );
            },
          ),
        ],
      ],
    );
  }

  Future<void> _create() async {
    final name = _name.text.trim();
    final code = _code.text.trim();

    final errors = <String, String?>{};
    if (name.length < 2) errors['name'] = 'The building needs a name.';
    if (code.length < 2) {
      errors['code'] = 'The building needs a code.';
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
          .read(buildingActionsProvider)
          .create(
            name: name,
            code: code,
            address: _address.text.trim(),
            description: _description.text.trim(),
          );
      if (!mounted) return;
      _name.clear();
      _code.clear();
      _address.clear();
      _description.clear();
      // Back to the list, where the new row is: the officer's next question is
      // "is it there?", and leaving them on an emptied form does not answer it.
      setState(() => _section = 0);
      showAppToast(
        context,
        message: '$name has been added.',
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      // A duplicate code is a field problem: the server names it, and the message
      // goes under the field rather than in a toast that fades while the
      // administrator is still typing.
      setState(() {
        if (error.isConflict) {
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

  /// The name and the code are what the filter and the tag read, so they are the
  /// two fields worth correcting. Address and description are notes and are not
  /// re-asked on every edit; they keep whatever the row already holds.
  Future<void> _edit(Building building) async {
    final name = await showPromptDialog(
      context,
      title: 'Correct the name',
      label: 'Building name',
      initialValue: building.name,
      body:
          'Items filed here show the new name immediately \u2014 they point at the '
          'building, not at a copy of the word.',
      confirmLabel: 'Next',
    );
    if (name == null || !mounted) return;

    final code = await showPromptDialog(
      context,
      title: 'Correct the code',
      label: 'Code',
      initialValue: building.code,
      body:
          'Short and unique. A code another building already uses is refused.',
      confirmLabel: 'Save',
    );
    if (code == null || !mounted) return;

    await _guard(building, () async {
      await ref
          .read(buildingActionsProvider)
          .update(
            building.id,
            name: name,
            code: code.toUpperCase(),
            address: building.address,
            description: building.description,
          );
      if (mounted) {
        showAppToast(
          context,
          message: 'Building updated.',
          tone: ToastTone.success,
        );
      }
    });
  }

  Future<void> _delete(Building building) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Remove ${building.name}?',
      body:
          'The building is removed from the picker and the filter. It holds no items, so '
          'nothing is orphaned.',
      confirmLabel: 'Remove building',
      destructive: true,
      icon: Icons.delete_outline,
    );
    if (!confirmed || !mounted) return;

    await _guard(building, () async {
      await ref.read(buildingActionsProvider).remove(building.id);
      if (mounted) {
        showAppToast(
          context,
          message: '${building.name} removed.',
          tone: ToastTone.info,
        );
      }
    });
  }

  Future<void> _guard(Building building, Future<void> Function() action) async {
    setState(() => _busyId = building.id);
    try {
      await action();
    } on ApiError catch (error) {
      if (mounted) {
        showAppToast(context, message: error.message, tone: ToastTone.error);
      }
    } on NetworkError catch (error) {
      if (mounted) {
        showAppToast(context, message: error.message, tone: ToastTone.error);
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }
}

class _BuildingCard extends StatelessWidget {
  const _BuildingCard({
    required this.building,
    required this.busy,
    required this.onOpenItems,
    required this.onEdit,
    required this.onDelete,
  });

  final Building building;
  final bool busy;
  final VoidCallback onOpenItems;
  final VoidCallback onEdit;
  final VoidCallback? onDelete;

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
                            building.name,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.aauGray900,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.s2),
                        Text(
                          building.code,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: AppColors.aauGray500,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    if (building.address != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          building.address!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.aauGray500,
                          ),
                        ),
                      ),
                    const SizedBox(height: 4),
                    InkWell(
                      onTap: onOpenItems,
                      child: Text(
                        building.itemCount == 1
                            ? '1 item \u00b7 view in the register'
                            : '${building.itemCount} items \u00b7 view in the register',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: AppColors.brand700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (busy)
                const Padding(
                  padding: EdgeInsets.all(AppSpace.s2),
                  child: InlineSpinner(size: 18),
                )
              else
                PopupMenuButton<String>(
                  tooltip: 'Building actions',
                  icon: const Icon(
                    Icons.more_vert,
                    size: 20,
                    color: AppColors.aauGray500,
                  ),
                  onSelected: (value) => switch (value) {
                    'edit' => onEdit(),
                    'delete' => onDelete?.call(),
                    _ => null,
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: 'edit',
                      child: Text('Correct name or code'),
                    ),
                    if (onDelete != null)
                      const PopupMenuItem(
                        value: 'delete',
                        child: Text(
                          'Remove building',
                          style: TextStyle(color: AppColors.danger700),
                        ),
                      ),
                  ],
                ),
            ],
          ),
          if (onDelete == null)
            const Padding(
              padding: EdgeInsets.only(top: AppSpace.s2),
              child: Text(
                'Holds items, so it cannot be removed.',
                style: TextStyle(fontSize: 11.5, color: AppColors.aauGray500),
              ),
            ),
        ],
      ),
    );
  }
}
