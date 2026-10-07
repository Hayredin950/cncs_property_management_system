import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/core_providers.dart';
import '../../data/providers/requests_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/enums.dart';
import '../../models/item.dart';
import '../../models/request.dart';
import '../../models/user.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../../widgets/status_badges.dart';

/// `/requests/new` (§10.7).
///
/// The type toggle **switches the visible fields**, which is the whole design: a
/// TRANSFER names a new location and/or owner (at least one required — the server
/// 400s otherwise), while a DISPOSAL names neither and only needs a reason. Showing
/// both sets at once would invite a disposal with a new room number on it, which the
/// server would reject and which no reader could interpret anyway.
///
/// The 409 case is the interesting one. `POST /requests` refuses a second PENDING
/// request for the same item (rule D5 — two pending transfers approved in sequence
/// would silently double-move an item), and the API's message names the existing
/// request. What it does **not** return is that request's id, so the banner cannot
/// link straight to it; it shows the server's sentence verbatim and offers the queue
/// instead of pretending to a link it cannot build.
class RequestFormPage extends ConsumerStatefulWidget {
  const RequestFormPage({super.key, this.itemId});

  /// Pre-selected from `/items/:id`'s "File a request" action.
  final String? itemId;

  @override
  ConsumerState<RequestFormPage> createState() => _RequestFormPageState();
}

class _RequestFormPageState extends ConsumerState<RequestFormPage> {
  final _reason = TextEditingController();
  final _building = TextEditingController();
  final _floor = TextEditingController();
  final _room = TextEditingController();

  var _type = RequestType.transfer;
  Item? _item;
  String? _newOwnerId;
  var _submitting = false;
  Object? _error;
  String? _reasonError;

  @override
  void initState() {
    super.initState();
    if (widget.itemId != null) _loadPreselected();
  }

  @override
  void dispose() {
    _reason.dispose();
    _building.dispose();
    _floor.dispose();
    _room.dispose();
    super.dispose();
  }

  Future<void> _loadPreselected() async {
    try {
      final item = await ref.read(itemsApiProvider).byId(widget.itemId!);
      if (mounted) setState(() => _item = item);
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error);
    } on NetworkError catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = ref.watch(isAdminProvider);

    return Column(
      children: [
        Expanded(
          child: PageScaffold(
            title: 'File a request',
            subtitle: 'A transfer or a disposal, reviewed by an administrator',
            maxWidth: 640,
            padBottom: 24,
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'What are you asking for?',
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w500,
                        color: AppColors.aauGray700,
                      ),
                    ),
                    const SizedBox(height: AppSpace.s3),
                    Row(
                      children: [
                        Expanded(
                          child: _TypeCard(
                            type: RequestType.transfer,
                            selected: _type == RequestType.transfer,
                            onTap: () => setState(() => _type = RequestType.transfer),
                          ),
                        ),
                        const SizedBox(width: AppSpace.s3),
                        Expanded(
                          child: _TypeCard(
                            type: RequestType.disposal,
                            selected: _type == RequestType.disposal,
                            onTap: () => setState(() => _type = RequestType.disposal),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpace.s3),
                    Text(
                      _type == RequestType.transfer
                          ? 'Approving a transfer moves the item and reissues where it is '
                              'recorded as living.'
                          : 'Approving a disposal retires the item. It leaves the register, '
                              'its tag stops resolving for the public, and its history is kept.',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.aauGray500,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: AppSpace.stack),
              _ItemPicker(
                selected: _item,
                onChanged: (item) => setState(() => _item = item),
              ),

              const SizedBox(height: AppSpace.s6),
              AppFormSection(
                title: 'Reason',
                subtitle: 'The reviewer decides on this text alone.',
                children: [
                  AppTextArea(
                    label: 'Why is this needed?',
                    controller: _reason,
                    hint: 'The laptop is being reassigned to the new lab technician.',
                    errorText: _reasonError,
                    minLines: 4,
                    maxLength: 1000,
                    required: true,
                    onChanged: (_) => setState(() => _reasonError = null),
                  ),
                  Text(
                    'At least 10 characters. ${_reason.text.trim().length}/1000 written.',
                    style: TextStyle(
                      fontSize: 12,
                      color: _reason.text.trim().length < 10
                          ? AppColors.warning700
                          : AppColors.aauGray500,
                    ),
                  ),
                ],
              ),

              // The two branches of the toggle. A DISPOSAL gets nothing here on
              // purpose — the server rejects new-location fields for a disposal, so
              // rendering them would be showing a control whose value is discarded.
              if (_type == RequestType.transfer) ...[
                const SizedBox(height: AppSpace.s6),
                AppFormSection(
                  title: 'Where should it go?',
                  subtitle: 'Give a new location, a new custodian, or both.',
                  children: [
                    AppTextField(
                      label: 'New building',
                      controller: _building,
                      hint: 'CNCS Building',
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: AppTextField(label: 'New floor', controller: _floor),
                        ),
                        const SizedBox(width: AppSpace.s3),
                        Expanded(child: AppTextField(label: 'New room', controller: _room)),
                      ],
                    ),
                    if (isAdmin) _ownerPicker(),
                    if (!isAdmin)
                      const Text(
                        'Reassigning to another account is done by an administrator when '
                        'they approve this transfer \u2014 a staff session cannot enumerate '
                        'accounts.',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.aauGray500,
                          height: 1.5,
                        ),
                      ),
                  ],
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: AppSpace.s4),
                InlineError(error: _error!),
                if (_error is ApiError && (_error! as ApiError).isConflict) ...[
                  const SizedBox(height: AppSpace.s3),
                  AppButton(
                    label: 'See the existing request',
                    variant: AppButtonVariant.outline,
                    expand: true,
                    icon: Icons.open_in_new,
                    onPressed: () => context.push('/requests'),
                  ),
                  const SizedBox(height: AppSpace.s2),
                  const Text(
                    'This opens the request queue, where the request is waiting for review.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.aauGray500,
                      height: 1.45,
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
        Container(
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
                      label: 'Submit for review',
                      expand: true,
                      size: AppButtonSize.lg,
                      loading: _submitting,
                      onPressed: _submit,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _ownerPicker() {
    final users = ref.watch(usersProvider).value ?? const <UserSummary>[];
    final user = ref.watch(currentUserProvider);
    final options = [
      for (final account in users)
        if (account.id != user?.id) account,
    ];

    return AppSelectField<String>(
      label: 'New custodian',
      value: _newOwnerId,
      options: [for (final account in options) account.id],
      labelOf: (id) => _accountName(options, id),
      clearLabel: 'Leave unchanged',
      onChanged: (value) => setState(() => _newOwnerId = value),
      helper: options.isEmpty
          ? 'No other accounts are available to reassign to.'
          : 'Optional \u2014 leave unchanged to keep the current custodian.',
    );
  }

  Future<void> _submit() async {
    final reason = _reason.text.trim();

    if (_item == null) {
      setState(() => _error = const ApiError(400, 'Choose the item this request is about.'));
      return;
    }
    if (reason.length < 10) {
      setState(() {
        _reasonError = 'Write at least 10 characters \u2014 the reviewer sees only this.';
        _error = null;
      });
      return;
    }
    if (_type == RequestType.transfer &&
        _blank(_building.text) == null &&
        _blank(_floor.text) == null &&
        _blank(_room.text) == null &&
        _newOwnerId == null) {
      setState(() => _error = const ApiError(
            400,
            'A transfer needs a new location or a new custodian \u2014 otherwise there is '
                'nothing to approve.',
          ));
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _reasonError = null;
    });

    try {
      final response = await ref.read(requestActionsProvider).create(
            CreateRequestPayload(
              type: _type,
              itemId: _item!.id,
              reason: reason,
              newLocationBuilding: _blank(_building.text),
              newLocationFloor: _blank(_floor.text),
              newLocationRoom: _blank(_room.text),
              newOwnerId: _newOwnerId,
            ),
          );
      if (!mounted) return;
      final notified = response.notifiedReviewerCount;
      showAppToast(
        context,
        message: notified == 0
            ? 'Request filed.'
            : 'Request filed \u2014 $notified reviewer${notified == 1 ? '' : 's'} notified.',
        tone: ToastTone.success,
      );
      context.pop();
    } on ApiError catch (error) {
      setState(() => _error = error);
    } on NetworkError catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  static String? _blank(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static String _accountName(List<UserSummary> accounts, String id) {
    for (final account in accounts) {
      if (account.id == id) return account.fullName;
    }
    return 'Account';
  }
}

/// The transfer/disposal choice as two cards rather than a dropdown.
///
/// A dropdown hides the consequence until it is opened, and the difference between
/// these two is a permanently retired item. Two cards, each with a one-line
/// consequence, is how a user picks the right one on the first try.
class _TypeCard extends StatelessWidget {
  const _TypeCard({required this.type, required this.selected, required this.onTap});

  final RequestType type;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isTransfer = type == RequestType.transfer;

    return Material(
      color: selected ? AppColors.brand50 : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadius.mdAll,
        side: BorderSide(
          color: selected ? AppColors.brand600 : AppColors.aauGray300,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.mdAll,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                isTransfer ? Icons.swap_horiz_outlined : Icons.delete_outline,
                size: 22,
                color: selected ? AppColors.brand700 : AppColors.aauGray500,
              ),
              const SizedBox(height: AppSpace.s2),
              Text(
                type.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.brand900 : AppColors.aauGray800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                isTransfer ? 'Move it somewhere new' : 'Retire it from service',
                style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray500, height: 1.35),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The item the request is about: search the register, or keep the one that was
/// pre-selected from the item record.
class _ItemPicker extends ConsumerStatefulWidget {
  const _ItemPicker({required this.selected, required this.onChanged});

  final Item? selected;
  final ValueChanged<Item?> onChanged;

  @override
  ConsumerState<_ItemPicker> createState() => _ItemPickerState();
}

class _ItemPickerState extends ConsumerState<_ItemPicker> {
  final _search = TextEditingController();
  var _results = const <Item>[];
  var _loading = false;
  var _open = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _run(String query) async {
    if (query.trim().isEmpty) {
      setState(() => _results = const []);
      return;
    }
    setState(() => _loading = true);
    try {
      final response = await ref.read(itemsApiProvider).list(search: query.trim(), limit: 10);
      if (!mounted) return;
      // Disposed items are excluded by the endpoint itself, which is the correct
      // filter here: the server 409s a request against a disposed item anyway.
      setState(() => _results = response.items);
    } catch (_) {
      if (mounted) setState(() => _results = const []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.selected;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Which item?',
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w500,
              color: AppColors.aauGray700,
            ),
          ),
          const SizedBox(height: AppSpace.s3),

          if (item != null)
            Container(
              padding: const EdgeInsets.all(AppSpace.s3),
              decoration: BoxDecoration(
                color: AppColors.brand50,
                borderRadius: AppRadius.smAll,
                border: Border.all(color: AppColors.brand200),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.name,
                          style: const TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.aauGray900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            TagIdText(tagId: item.tagId, fontSize: 11.5),
                            const SizedBox(width: AppSpace.s2),
                            ConditionBadge(
                              condition: item.condition,
                              label: item.conditionLabel,
                              dense: true,
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          item.locationLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray500),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Choose a different item',
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      widget.onChanged(null);
                      setState(() => _open = true);
                    },
                  ),
                ],
              ),
            )
          else ...[
            AppTextField(
              label: '',
              hint: 'Search by name, tag ID or room',
              controller: _search,
              prefixIcon: Icons.search,
              onChanged: (value) {
                setState(() => _open = true);
                _run(value);
              },
            ),
            if (_open && _search.text.trim().isNotEmpty) ...[
              const SizedBox(height: AppSpace.s2),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(AppSpace.s3),
                  child: Center(child: InlineSpinner()),
                )
              else if (_results.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(AppSpace.s3),
                  child: Text(
                    'No item in the register matches that.',
                    style: TextStyle(fontSize: 13, color: AppColors.aauGray500),
                  ),
                )
              else
                for (final result in _results)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(result.name, style: const TextStyle(fontSize: 14)),
                    subtitle: Row(
                      children: [
                        TagIdText(tagId: result.tagId, fontSize: 11),
                        const SizedBox(width: AppSpace.s2),
                        Expanded(
                          child: Text(
                            result.locationLine,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 11.5),
                          ),
                        ),
                      ],
                    ),
                    onTap: () {
                      widget.onChanged(result);
                      setState(() => _open = false);
                      FocusScope.of(context).unfocus();
                    },
                  ),
            ],
          ],
        ],
      ),
    );
  }
}
