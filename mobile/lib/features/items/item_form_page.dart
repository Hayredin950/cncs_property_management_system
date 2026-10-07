import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/items_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/category.dart';
import '../../models/enums.dart';
import '../../models/item.dart';
import '../../models/user.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/items/new` and `/items/:id/edit` (§10.6).
///
/// One form, two modes, and the modes differ in a way that is easy to get wrong:
///
///   * **Create** lets the user choose the custodian, because registration is the
///     *only* moment an item's owner can be set without paperwork — `PUT /items/:id`
///     refuses `ownerId`, since reassignment is an approved TRANSFER.
///   * **Edit** shows building, floor, room and owner as **read-only with a note**,
///     not merely disabled: the server refuses all four for every role including
///     Admin, so a writable-looking field would be a field whose value silently
///     vanishes on save. That is also why the API module strips them before sending
///     rather than trusting each call site to remember.
///
/// Mobile gets one thing the web version cannot have: a **real photo picker**.
/// `frontend-plan.md` lists "there is no upload endpoint (gap G3)" and ships a URL
/// text field; `POST /uploads/photo` exists now, and a phone has a camera, so this
/// form takes a photo, uploads it, and keeps the URL field for pasting a link from
/// elsewhere. Both write the same `photoUrl`.
class ItemFormPage extends ConsumerStatefulWidget {
  const ItemFormPage({super.key, this.itemId});

  /// `null` in create mode.
  final String? itemId;

  @override
  ConsumerState<ItemFormPage> createState() => _ItemFormPageState();
}

class _ItemFormPageState extends ConsumerState<ItemFormPage> {
  final _name = TextEditingController();
  final _building = TextEditingController();
  final _floor = TextEditingController();
  final _room = TextEditingController();
  final _purchaseCost = TextEditingController();
  final _currentValue = TextEditingController();
  final _brand = TextEditingController();
  final _model = TextEditingController();
  final _serial = TextEditingController();
  final _photoUrl = TextEditingController();
  final _notes = TextEditingController();

  /// A display-only controller for the edit mode's read-only custodian field. It
  /// exists because a `TextEditingController` must not be constructed inside `build`
  /// — doing so leaks one per frame and drops whatever the cursor was doing.
  final _ownerDisplay = TextEditingController();

  String? _categoryId;
  String? _department;
  String? _ownerId;
  var _condition = Condition.good;
  var _submitting = false;
  var _uploading = false;
  var _seeded = false;
  Object? _error;

  /// Field-level messages, keyed by a small enum-free label. A map rather than six
  /// nullable strings because there are six fields and the set will grow.
  final _fieldErrors = <String, String?>{};

  bool get _isEdit => widget.itemId != null;

  @override
  void dispose() {
    for (final controller in [
      _name,
      _building,
      _floor,
      _room,
      _purchaseCost,
      _currentValue,
      _brand,
      _model,
      _serial,
      _photoUrl,
      _notes,
      _ownerDisplay,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Seeds the form from the item once, in edit mode.
  ///
  /// Guarded by `_seeded` rather than called in `initState` because the item arrives
  /// asynchronously; re-seeding on every rebuild would throw away whatever the user
  /// had typed the moment a provider refreshed.
  void _seed(Item item) {
    if (_seeded) return;
    _seeded = true;
    _name.text = item.name;
    _building.text = item.building;
    _floor.text = item.floor;
    _room.text = item.room;
    _purchaseCost.text = item.purchaseCost ?? '';
    _currentValue.text = item.currentValue ?? '';
    _brand.text = item.brand ?? '';
    _model.text = item.model ?? '';
    _serial.text = item.serialNumber ?? '';
    _photoUrl.text = item.photoUrl ?? '';
    _notes.text = item.notes ?? '';
    _categoryId = item.categoryId;
    _department = item.department;
    _ownerId = item.ownerId;
    _ownerDisplay.text = item.ownerName ?? 'No owner recorded';
    _condition = item.condition == Condition.unknown ? Condition.good : item.condition;
  }

  @override
  Widget build(BuildContext context) {
    final item = _isEdit ? ref.watch(itemByIdProvider(widget.itemId!)) : null;
    if (item != null && item.hasValue) _seed(item.requireValue);

    if (item != null && item.isLoading && !_seeded) {
      return const PageScaffold(
        title: 'Loading item',
        maxWidth: 640,
        children: [SkeletonDetail()],
      );
    }
    if (item != null && item.hasError) {
      return PageScaffold(
        title: 'Edit item',
        maxWidth: 640,
        children: [
          InlineError(
            error: item.error!,
            onRetry: () => ref.invalidate(itemByIdProvider(widget.itemId!)),
          ),
        ],
      );
    }

    final existing = item?.value;
    final disposed = existing?.isDisposed ?? false;
    final categories = ref.watch(categoriesProvider).value ?? const <Category>[];
    final departments = ref.watch(observedDepartmentsProvider).value ?? const <String>[];

    return Column(
      children: [
        Expanded(
          child: PageScaffold(
            title: _isEdit ? 'Edit item' : 'Register an item',
            subtitle: _isEdit ? existing?.tagId : 'A tag ID is generated when you save',
            maxWidth: 640,
            padBottom: 24,
            children: [
              if (disposed)
                const Padding(
                  padding: EdgeInsets.only(bottom: AppSpace.stack),
                  child: InfoNote(
                    icon: Icons.archive_outlined,
                    message: 'This item was disposed and can no longer be edited. Every '
                        'field is shown read-only so the record stays legible.',
                    tone: InfoTone.neutral,
                  ),
                ),

              _photoField(),
              const SizedBox(height: AppSpace.s5),

              AppFormSection(
                title: 'Identity',
                children: [
                  AppTextField(
                    label: 'Name',
                    controller: _name,
                    enabled: !disposed,
                    hint: 'Dell Latitude 5420',
                    errorText: _fieldErrors['name'],
                    required: true,
                  ),
                  AppSelectField<String>(
                    label: 'Category',
                    value: _categoryId,
                    enabled: !disposed,
                    options: [for (final category in categories) category.id],
                    labelOf: (id) => _categoryName(categories, id),
                    errorText: _fieldErrors['categoryId'],
                    required: true,
                    onChanged: (value) => setState(() => _categoryId = value),
                    helper: categories.isEmpty
                        ? 'No categories exist yet. An administrator can add them under '
                            'Administration \u2192 Categories.'
                        : null,
                  ),
                ],
              ),

              const SizedBox(height: AppSpace.s6),
              AppFormSection(
                title: 'Location',
                subtitle: _isEdit
                    ? 'Moving an item is an approved transfer, so these are read-only here.'
                    : null,
                children: [
                  AppDepartmentField(
                    value: _department,
                    options: departments,
                    enabled: !disposed,
                    errorText: _fieldErrors['department'],
                    onChanged: (value) => setState(() => _department = value),
                  ),
                  AppTextField(
                    label: 'Building',
                    controller: _building,
                    enabled: !disposed && !_isEdit,
                    required: true,
                    errorText: _fieldErrors['building'],
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: AppTextField(
                          label: 'Floor',
                          controller: _floor,
                          enabled: !disposed && !_isEdit,
                          required: true,
                          errorText: _fieldErrors['floor'],
                        ),
                      ),
                      const SizedBox(width: AppSpace.s3),
                      Expanded(
                        child: AppTextField(
                          label: 'Room',
                          controller: _room,
                          enabled: !disposed && !_isEdit,
                          required: true,
                          errorText: _fieldErrors['room'],
                        ),
                      ),
                    ],
                  ),
                  if (_isEdit)
                    const Text(
                      'Building, floor and room are set at registration and changed only '
                      'by an approved transfer request.',
                      style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.45),
                    ),
                ],
              ),

              const SizedBox(height: AppSpace.s6),
              AppFormSection(
                title: 'Ownership & value',
                children: [
                  _ownerField(disposed: disposed, existing: existing),
                  AppTextField(
                    label: 'Purchase cost (ETB)',
                    controller: _purchaseCost,
                    enabled: !disposed,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    hint: '45000',
                    required: true,
                    errorText: _fieldErrors['purchaseCost'],
                    helper: 'Recorded in Ethiopian Birr.',
                  ),
                  AppTextField(
                    label: 'Current value (ETB)',
                    controller: _currentValue,
                    enabled: !disposed,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    hint: 'Optional',
                    errorText: _fieldErrors['currentValue'],
                  ),
                ],
              ),

              const SizedBox(height: AppSpace.s6),
              AppFormSection(
                title: 'Condition & specs',
                children: [
                  AppSelectField<Condition>(
                    label: 'Condition',
                    value: _condition,
                    enabled: !disposed,
                    options: Condition.selectable,
                    labelOf: (value) => value.label,
                    required: true,
                    onChanged: (value) =>
                        setState(() => _condition = value ?? Condition.good),
                  ),
                  AppTextField(
                    label: 'Brand',
                    controller: _brand,
                    enabled: !disposed,
                    hint: 'Dell',
                  ),
                  AppTextField(
                    label: 'Model',
                    controller: _model,
                    enabled: !disposed,
                    hint: 'Latitude 5420',
                  ),
                  AppTextField(
                    label: 'Serial number',
                    controller: _serial,
                    enabled: !disposed,
                    mono: true,
                  ),
                  AppTextArea(
                    label: 'Notes',
                    controller: _notes,
                    enabled: !disposed,
                    hint: 'Anything the next person to look at this item should know.',
                    maxLength: 1000,
                  ),
                ],
              ),

              if (_error != null) ...[
                const SizedBox(height: AppSpace.s4),
                InlineError(error: _error!),
              ],
            ],
          ),
        ),
        _submitBar(disposed: disposed),
      ],
    );
  }

  Widget _photoField() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Photo',
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w500,
              color: AppColors.aauGray700,
            ),
          ),
          const SizedBox(height: AppSpace.s3),
          PhotoFrame(
            url: _photoUrl.text.trim().isEmpty ? null : _photoUrl.text.trim(),
            categoryName: null,
            radius: AppRadius.md,
          ),
          const SizedBox(height: AppSpace.s3),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Camera',
                  icon: Icons.photo_camera_outlined,
                  variant: AppButtonVariant.outline,
                  expand: true,
                  loading: _uploading,
                  onPressed: _uploading ? null : () => _pick(ImageSource.camera),
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: AppButton(
                  label: 'Library',
                  icon: Icons.photo_library_outlined,
                  variant: AppButtonVariant.outline,
                  expand: true,
                  onPressed: _uploading ? null : () => _pick(ImageSource.gallery),
                ),
              ),
            ],
          ),
          if (_photoUrl.text.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpace.s3),
            Row(
              children: [
                const Icon(Icons.link, size: 15, color: AppColors.aauGray400),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _photoUrl.text.trim(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray500),
                  ),
                ),
                TextButton(
                  onPressed: _uploading
                      ? null
                      : () {
                          setState(() => _photoUrl.clear());
                        },
                  child: const Text('Remove'),
                ),
              ],
            ),
          ] else ...[
            const SizedBox(height: AppSpace.s3),
            AppTextField(
              label: 'Or paste a photo URL',
              controller: _photoUrl,
              hint: 'https://…',
              onChanged: (_) => setState(() {}),
              helper: 'A link works as well as an upload — both write the same field.',
            ),
          ],
        ],
      ),
    );
  }

  /// A photo is uploaded **immediately**, before the form is saved.
  ///
  /// That is a deliberate trade: it means an abandoned form can leave an orphaned
  /// image in storage, which `DELETE /uploads/photo` exists to clean up — but the
  /// alternative (upload on submit) turns a save into a multi-second operation the
  /// user cannot see the progress of, and a failed upload at that point would lose
  /// the whole form. An orphan is much cheaper than that.
  Future<void> _pick(ImageSource source) async {
    setState(() => _uploading = true);
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        // Downscaled on the device: a 12MP photo is a slow upload on campus Wi-Fi and
        // nothing in this app renders larger than a card.
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 82,
      );
      if (picked == null) return;

      final bytes = await picked.readAsBytes();
      final url = await ref.read(itemActionsProvider).uploadPhoto(
            bytes: bytes,
            filename: picked.name,
            mimeType: picked.mimeType ?? _guessMime(picked.name),
          );
      if (!mounted) return;
      setState(() => _photoUrl.text = url);
      showAppToast(context, message: 'Photo uploaded.', tone: ToastTone.success);
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } catch (error) {
      if (mounted) {
        showAppToast(
          context,
          message: 'The photo could not be read from your device.',
          tone: ToastTone.error,
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  static String _guessMime(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  /// The custodian control (F2.1) — the one place an item's owner is decided.
  ///
  /// `GET /users` is **Admin-only**, so a Staff registrar cannot enumerate accounts;
  /// the request is not sent at all rather than sent-and-403'd. A Staff member sees
  /// exactly one option (themselves) **with a hint that explains why**, because a
  /// one-option picker with no explanation reads as a broken control rather than a
  /// deliberate restriction.
  Widget _ownerField({required bool disposed, required Item? existing}) {
    final user = ref.watch(currentUserProvider);
    final isAdmin = ref.watch(isAdminProvider);
    final users = isAdmin ? (ref.watch(usersProvider).value ?? const <UserSummary>[]) : const <UserSummary>[];

    if (_isEdit) {
      return AppTextField(
        label: 'Owner (custodian)',
        controller: _ownerDisplay,
        enabled: false,
        helper: 'Reassignment happens through an approved transfer request.',
      );
    }

    final options = <UserSummary>[
      if (user != null && !users.any((account) => account.id == user.id))
        UserSummary(
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          itemCount: 0,
        ),
      ...users,
    ];

    // A `<select>` whose value is not among its options renders blank, so the
    // signed-in account is always an option and is the *default* before the list
    // arrives. Computed, never assigned during `build`.
    final selected = _ownerId ?? user?.id;

    return AppSelectField<String>(
      label: 'Owner (custodian)',
      value: selected,
      enabled: !disposed,
      options: [for (final account in options) account.id],
      labelOf: (id) => _accountName(options, id, user?.id),
      required: true,
      errorText: _fieldErrors['ownerId'],
      onChanged: (value) => setState(() => _ownerId = value),
      helper: isAdmin
          ? 'Who will hold this item. Changing it later goes through an approved transfer.'
          : 'Ownership is limited to your own account here \u2014 reassigning to someone '
              'else goes through an approved transfer request.',
    );
  }

  Widget _submitBar({required bool disposed}) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.aauGrayLine)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s4),
          child: Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Cancel',
                  variant: AppButtonVariant.outline,
                  expand: true,
                  onPressed: _submitting ? null : () => context.pop(),
                ),
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                flex: 2,
                child: AppButton(
                  label: _isEdit ? 'Save changes' : 'Register item',
                  expand: true,
                  size: AppButtonSize.lg,
                  loading: _submitting,
                  onPressed: disposed ? null : _submit,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    // Client-side validation mirrors the server's own required fields, so the only
    // way to see the API's validation error is a genuine edge case rather than a
    // form that should have caught it first.
    final errors = <String, String?>{};
    if (_name.text.trim().isEmpty) errors['name'] = 'Give the item a name.';
    if (_categoryId == null) errors['categoryId'] = 'Choose a category.';
    if (_department == null || _department!.trim().isEmpty) {
      errors['department'] = 'Choose or type a department.';
    }
    if (_building.text.trim().isEmpty) errors['building'] = 'Required.';
    if (_floor.text.trim().isEmpty) errors['floor'] = 'Required.';
    if (_room.text.trim().isEmpty) errors['room'] = 'Required.';

    final purchase = num.tryParse(_purchaseCost.text.trim());
    if (purchase == null) {
      errors['purchaseCost'] = 'Enter the cost as a number, e.g. 45000.';
    } else if (purchase < 0) {
      errors['purchaseCost'] = 'A cost cannot be negative.';
    }

    final current = _currentValue.text.trim().isEmpty
        ? null
        : num.tryParse(_currentValue.text.trim());
    if (_currentValue.text.trim().isNotEmpty && current == null) {
      errors['currentValue'] = 'Enter a number, or leave this empty.';
    }
    final ownerId = _ownerId ?? ref.read(currentUserProvider)?.id;
    if (!_isEdit && (ownerId == null || ownerId.isEmpty)) {
      errors['ownerId'] = 'Choose the custodian.';
    }

    setState(() {
      _fieldErrors
        ..clear()
        ..addAll(errors);
      _error = null;
    });
    if (errors.values.any((value) => value != null)) {
      showAppToast(
        context,
        message: 'Check the highlighted fields.',
        tone: ToastTone.error,
        replace: true,
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final actions = ref.read(itemActionsProvider);

      if (_isEdit) {
        // The four transfer-only fields are deliberately absent, and the API module
        // would strip them anyway — sending them would be a 400 for every role.
        await actions.update(widget.itemId!, {
          'name': _name.text.trim(),
          'categoryId': _categoryId,
          'department': _department!.trim(),
          'purchaseCost': purchase,
          'currentValue': current,
          'condition': _condition.wire,
          'brand': _blankToNull(_brand.text),
          'model': _blankToNull(_model.text),
          'serialNumber': _blankToNull(_serial.text),
          'photoUrl': _blankToNull(_photoUrl.text),
          'notes': _blankToNull(_notes.text),
        });
        if (!mounted) return;
        showAppToast(context, message: 'Changes saved.', tone: ToastTone.success);
        context.pop();
      } else {
        final created = await actions.create(
          CreateItemPayload(
            name: _name.text.trim(),
            categoryId: _categoryId!,
            department: _department!.trim(),
            building: _building.text.trim(),
            floor: _floor.text.trim(),
            room: _room.text.trim(),
            ownerId: ownerId!,
            purchaseCost: purchase!,
            condition: _condition,
            currentValue: current,
            brand: _blankToNull(_brand.text),
            model: _blankToNull(_model.text),
            serialNumber: _blankToNull(_serial.text),
            photoUrl: _blankToNull(_photoUrl.text),
            notes: _blankToNull(_notes.text),
          ),
        );
        if (!mounted) return;
        showAppToast(
          context,
          message: 'Registered as ${created.tagId}. Print its tag from the item record.',
          tone: ToastTone.success,
        );
        // Lands on the by-tag page, the same address the printed sticker will open —
        // so the person registering can check the tag they are about to stick on.
        context.go('/item/${created.tagId}');
      }
    } on ApiError catch (error) {
      // A field-level `details` payload goes under its input; anything else is a
      // banner, because a form that only toasts a validation failure has told the
      // user something is wrong without saying where.
      setState(() {
        _error = error;
        if (error.isConflict) _fieldErrors['name'] = error.message;
      });
    } on NetworkError catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  static String? _blankToNull(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static String _categoryName(List<Category> categories, String id) {
    for (final category in categories) {
      if (category.id == id) return category.name;
    }
    return 'Category';
  }

  static String _accountName(List<UserSummary> accounts, String id, String? currentUserId) {
    for (final account in accounts) {
      if (account.id == id) {
        return account.id == currentUserId ? '${account.fullName} (you)' : account.fullName;
      }
    }
    return 'Account';
  }
}

/// The department control, in §8's **free-entry** mode.
///
/// There is no `GET /departments` endpoint (gap G9) — `department` is a free-text
/// column — so registration must be able to invent a value. The control suggests the
/// departments already observed on active items and accepts anything typed, which is
/// the opposite of the audit's scope picker, where an exact match is required and free
/// text would start an audit that can never complete.
class AppDepartmentField extends StatefulWidget {
  const AppDepartmentField({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
    this.enabled = true,
    this.errorText,
  });

  final String? value;
  final List<String> options;
  final ValueChanged<String?> onChanged;
  final bool enabled;
  final String? errorText;

  @override
  State<AppDepartmentField> createState() => _AppDepartmentFieldState();
}

class _AppDepartmentFieldState extends State<AppDepartmentField> {
  late final _controller = TextEditingController(text: widget.value ?? '');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Suggestions, filtered to what is not already typed. Tapping one fills the
    // field: a phone keyboard is the wrong place to retype "Computer Science", and
    // the audit's exact-match rule makes a typo here expensive later.
    final typed = _controller.text.trim().toLowerCase();
    final suggestions = [
      for (final option in widget.options)
        if (typed.isEmpty || option.toLowerCase().contains(typed)) option,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppTextField(
          label: 'Department',
          controller: _controller,
          enabled: widget.enabled,
          hint: 'Computer Science',
          errorText: widget.errorText,
          required: true,
          onChanged: (value) {
            widget.onChanged(value);
            setState(() {});
          },
          helper: widget.options.isEmpty
              ? 'There is no department list to choose from \u2014 type the name the property '
                  'office uses.'
              : 'Type a new department, or tap one that is already in use.',
        ),
        if (widget.enabled && suggestions.isNotEmpty) ...[
          const SizedBox(height: AppSpace.s2),
          Wrap(
            spacing: AppSpace.s2,
            runSpacing: AppSpace.s2,
            children: [
              for (final option in suggestions.take(6))
                ActionChip(
                  label: Text(option, style: const TextStyle(fontSize: 12.5)),
                  backgroundColor: AppColors.aauGray100,
                  side: const BorderSide(color: AppColors.aauGray200),
                  onPressed: () {
                    _controller.text = option;
                    widget.onChanged(option);
                    setState(() {});
                  },
                ),
            ],
          ),
        ],
      ],
    );
  }
}
