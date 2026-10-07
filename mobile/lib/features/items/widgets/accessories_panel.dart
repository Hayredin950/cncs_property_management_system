import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_error.dart';
import '../../../data/providers/core_providers.dart';
import '../../../data/providers/items_provider.dart';
import '../../../models/item.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_button.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/app_fields.dart';
import '../../../widgets/feedback.dart';
import '../../../widgets/media.dart';
import '../../../widgets/states.dart';
import '../../../widgets/status_badges.dart';

/// Bundled accessories (§10.6).
///
/// Two API facts shape this panel, and both are easy to get wrong:
///
///   * **`POST /items/:id/accessories` is the only writer of `parentItemId`.**
///     `POST /items` rejects the field outright with a 400 that points here, so the
///     item form cannot bundle and this panel is not a convenience — it is the
///     feature.
///   * **Unlinking is allowed even on a disposed item.** That is deliberate and
///     worth keeping visible: if a disposal cascaded to the wrong accessory, the
///     only way to fix the record is to unlink it, and a panel that disabled itself
///     on a disposed parent would lock the correction out.
class AccessoriesPanel extends ConsumerStatefulWidget {
  const AccessoriesPanel({super.key, required this.item});

  final Item item;

  @override
  ConsumerState<AccessoriesPanel> createState() => _AccessoriesPanelState();
}

class _AccessoriesPanelState extends ConsumerState<AccessoriesPanel> {
  var _busy = false;

  @override
  Widget build(BuildContext context) {
    final accessories = widget.item.accessories;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.link_outlined, size: 17, color: AppColors.aauGray400),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  accessories.isEmpty ? 'Accessories' : 'Accessories (${accessories.length})',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s3),

          if (accessories.isEmpty)
            const Text(
              'Nothing is bundled with this item. Chargers, cases, remotes and cables '
              'are usually registered as their own items and linked here.',
              style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.5),
            )
          else
            for (final accessory in accessories) ...[
              _AccessoryRow(
                accessory: accessory,
                busy: _busy,
                onOpen: () {
                  // Navigating straight to the accessory is what makes the list
                  // useful rather than decorative: "which charger was it?" is a
                  // question the row cannot answer on its own.
                  ref.invalidate(itemByIdProvider(accessory.id));
                },
                onUnlink: () => _unlink(accessory),
              ),
              const SizedBox(height: AppSpace.s2),
            ],

          const SizedBox(height: AppSpace.s3),
          AppButton(
            label: 'Link accessories',
            icon: Icons.add_link,
            variant: AppButtonVariant.outline,
            expand: true,
            loading: _busy,
            onPressed: _busy ? null : _openPicker,
          ),
          const Padding(
            padding: EdgeInsets.only(top: AppSpace.s3),
            child: Text(
              'A disposal or transfer of this item cascades to everything linked here, '
              'which is exactly why the linkage is recorded rather than described in a note.',
              style: TextStyle(fontSize: 12, color: AppColors.aauGray500, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _unlink(Item accessory) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Unlink this accessory?',
      body: '${accessory.name} (${accessory.tagId}) will stay in the register, but it will '
          'no longer move with this item. Its existing tag is unchanged.',
      confirmLabel: 'Unlink',
      destructive: true,
      icon: Icons.link_off,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busy = true);
    try {
      await ref.read(itemActionsProvider).unlinkAccessory(widget.item.id, accessory.id);
      if (!mounted) return;
      showAppToast(
        context,
        message: '${accessory.tagId} unlinked.',
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openPicker() async {
    final selected = await showAppSheet<List<String>>(
      context,
      child: _AccessoryPicker(
        parent: widget.item,
        alreadyLinked: {for (final accessory in widget.item.accessories) accessory.id},
      ),
    );
    if (selected == null || selected.isEmpty || !mounted) return;

    setState(() => _busy = true);
    try {
      await ref.read(itemActionsProvider).linkAccessories(widget.item.id, selected);
      if (!mounted) return;
      showAppToast(
        context,
        message: selected.length == 1
            ? '1 accessory linked.'
            : '${selected.length} accessories linked.',
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _AccessoryRow extends StatelessWidget {
  const _AccessoryRow({
    required this.accessory,
    required this.busy,
    required this.onOpen,
    required this.onUnlink,
  });

  final Item accessory;
  final bool busy;
  final VoidCallback onOpen;
  final VoidCallback onUnlink;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.s3),
      decoration: BoxDecoration(
        color: AppColors.aauGray50,
        borderRadius: AppRadius.smAll,
        border: Border.all(color: AppColors.aauGray200),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  accessory.name,
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
                    TagIdText(tagId: accessory.tagId, fontSize: 11.5),
                    const SizedBox(width: AppSpace.s2),
                    ConditionBadge(
                      condition: accessory.condition,
                      label: accessory.conditionLabel,
                      dense: true,
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: busy ? null : onUnlink,
            tooltip: 'Unlink ${accessory.name}',
            icon: const Icon(Icons.link_off, size: 18),
            color: AppColors.danger600,
          ),
        ],
      ),
    );
  }
}

/// The picker sheet: search the register, tick what belongs with the parent.
///
/// The parent itself and anything already linked are excluded, not shown-disabled:
/// a disabled row a user cannot act on is a row that wastes the swipe that found it.
class _AccessoryPicker extends ConsumerStatefulWidget {
  const _AccessoryPicker({required this.parent, required this.alreadyLinked});

  final Item parent;
  final Set<String> alreadyLinked;

  @override
  ConsumerState<_AccessoryPicker> createState() => _AccessoryPickerState();
}

class _AccessoryPickerState extends ConsumerState<_AccessoryPicker> {
  final _search = TextEditingController();
  final _selected = <String>{};
  var _query = '';
  var _results = const <Item>[];
  var _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ref.read(itemsApiProvider).list(search: _query, limit: 20);
      if (!mounted) return;
      setState(() {
        _results = [
          for (final item in response.items)
            if (item.id != widget.parent.id && !widget.alreadyLinked.contains(item.id)) item,
        ];
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: AppSpace.s2),
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: const BoxDecoration(
                color: AppColors.aauGray300,
                borderRadius: BorderRadius.all(Radius.circular(999)),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s3, AppSpace.s4, AppSpace.s2),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Link accessories',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.aauGray900,
                        ),
                      ),
                      Text(
                        'to ${widget.parent.name}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, size: 20),
                  tooltip: 'Close',
                  color: AppColors.aauGray500,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s4),
            child: AppTextField(
              label: '',
              hint: 'Search the register',
              controller: _search,
              prefixIcon: Icons.search,
              onChanged: (value) => _query = value.trim(),
              onSubmitted: (_) => _load(),
            ),
          ),
          const SizedBox(height: AppSpace.s3),
          const Divider(height: 1),
          Flexible(
            child: _loading
                ? const Padding(
                    padding: EdgeInsets.all(AppSpace.s4),
                    child: SkeletonList(count: 3, height: 74),
                  )
                : _error != null
                    ? Padding(
                        padding: const EdgeInsets.all(AppSpace.s4),
                        child: InlineError(error: _error!, onRetry: _load),
                      )
                    : _results.isEmpty
                        ? const EmptyState(
                            icon: Icons.inventory_2_outlined,
                            title: 'Nothing to link',
                            body: 'No other active item matches that search.',
                            compact: true,
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(AppSpace.s4),
                            itemCount: _results.length,
                            itemBuilder: (context, index) {
                              final item = _results[index];
                              final checked = _selected.contains(item.id);
                              return Padding(
                                padding: const EdgeInsets.only(bottom: AppSpace.s2),
                                child: InkWell(
                                  onTap: () => setState(() {
                                    if (checked) {
                                      _selected.remove(item.id);
                                    } else {
                                      _selected.add(item.id);
                                    }
                                  }),
                                  borderRadius: AppRadius.smAll,
                                  child: Container(
                                    padding: const EdgeInsets.all(AppSpace.s2),
                                    decoration: BoxDecoration(
                                      color: checked ? AppColors.brand50 : Colors.transparent,
                                      borderRadius: AppRadius.smAll,
                                      border: Border.all(
                                        color: checked
                                            ? AppColors.brand200
                                            : AppColors.aauGray200,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          checked
                                              ? Icons.check_circle
                                              : Icons.radio_button_unchecked,
                                          size: 20,
                                          color: checked
                                              ? AppColors.brand600
                                              : AppColors.aauGray300,
                                        ),
                                        const SizedBox(width: AppSpace.s3),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                item.name,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontSize: 14,
                                                  color: AppColors.aauGray900,
                                                ),
                                              ),
                                              Row(
                                                children: [
                                                  TagIdText(tagId: item.tagId, fontSize: 11),
                                                  const SizedBox(width: AppSpace.s2),
                                                  Expanded(
                                                    child: Text(
                                                      item.locationLine,
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                      style: const TextStyle(
                                                        fontSize: 11.5,
                                                        color: AppColors.aauGray500,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(AppSpace.s4),
            child: AppButton(
              label: _selected.isEmpty
                  ? 'Link selected'
                  : 'Link ${_selected.length} ${_selected.length == 1 ? 'item' : 'items'}',
              expand: true,
              icon: Icons.add_link,
              onPressed: _selected.isEmpty
                  ? null
                  : () => Navigator.of(context).pop(_selected.toList()),
            ),
          ),
        ],
      ),
    );
  }
}
