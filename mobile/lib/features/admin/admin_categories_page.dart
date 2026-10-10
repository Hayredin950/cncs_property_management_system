import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/core_providers.dart';
import '../../data/providers/items_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/category.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/admin/categories` (§10.11) — a form plus the list.
///
/// The one rule the design system is specific about here: **a duplicate name's `409`
/// surfaces inline under the name field, not as a toast.** "It is a field-level
/// validation failure, not a system event" — and the distinction is practical, because
/// a toast disappears while the user is still looking at the field that needs changing.
///
/// Deletion is refused by the server when items are filed under a category, which is
/// exactly what `itemCount` is for: the row shows the count, and the delete control is
/// disabled with the reason rather than left to fail.
class AdminCategoriesPage extends ConsumerStatefulWidget {
  const AdminCategoriesPage({super.key});

  @override
  ConsumerState<AdminCategoriesPage> createState() => _AdminCategoriesPageState();
}

class _AdminCategoriesPageState extends ConsumerState<AdminCategoriesPage> {
  final _name = TextEditingController();
  String? _nameError;
  var _creating = false;
  String? _busyId;
  Object? _listError;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);

    return PageScaffold(
      title: 'Categories',
      subtitle: 'How items are grouped in the register',
      maxWidth: 720,
      onRefresh: () async {
        ref.invalidate(categoriesProvider);
        await ref.read(categoriesProvider.future);
      },
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Add a category',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                ),
              ),
              const SizedBox(height: AppSpace.s4),
              AppTextField(
                label: 'Name',
                controller: _name,
                hint: 'Computer equipment',
                errorText: _nameError,
                enabled: !_creating,
                required: true,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => setState(() => _nameError = null),
                onSubmitted: (_) => _create(),
              ),
              if (_listError != null) ...[
                const SizedBox(height: AppSpace.stack),
                InlineError(error: _listError!),
              ],
              const SizedBox(height: AppSpace.s4),
              AppButton(
                label: 'Add category',
                icon: Icons.add,
                expand: true,
                loading: _creating,
                onPressed: _creating ? null : _create,
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpace.s6),
        categories.when(
          loading: () => const SkeletonList(count: 4, height: 78),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(categoriesProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return const EmptyState(
                icon: Icons.sell_outlined,
                title: 'No categories yet',
                body: 'An item cannot be registered until at least one category exists.',
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(
                  title: '${list.length} ${list.length == 1 ? 'category' : 'categories'}',
                  subtitle: 'Tap one to rename it, or use the count to jump to its items.',
                ),
                for (final category in list) ...[
                  _CategoryRow(
                    category: category,
                    busy: _busyId == category.id,
                    onRename: () => _rename(category),
                    onViewItems: () {
                      // Hands the filter to the register rather than opening a second
                      // list: the register already knows how to filter, page and empty-
                      // state a category, and a copy of it here would be a screen that
                      // can disagree with the real one.
                      ref.read(itemQueryProvider.notifier).setCategory(category.id);
                      context.go('/items');
                    },
                    onDelete: category.itemCount == 0 ? () => _delete(category) : null,
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
    if (name.isEmpty) {
      setState(() => _nameError = 'Give the category a name.');
      return;
    }

    setState(() {
      _creating = true;
      _nameError = null;
      _listError = null;
    });
    try {
      await ref.read(categoriesApiProvider).create(name);
      ref.invalidate(categoriesProvider);
      if (!mounted) return;
      _name.clear();
      showAppToast(context, message: '\u201c$name\u201d added.', tone: ToastTone.success);
    } on ApiError catch (error) {
      setState(() {
        // 409 is the duplicate-name case, and it belongs under the input.
        if (error.isConflict) {
          _nameError = error.message;
        } else {
          _listError = error;
        }
      });
    } on NetworkError catch (error) {
      setState(() => _listError = error);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _rename(Category category) async {
    final name = await showPromptDialog(
      context,
      title: 'Rename this category',
      label: 'Name',
      initialValue: category.name,
      body: category.itemCount == 0
          ? 'Nothing is filed under it yet.'
          : '${category.itemCount} '
              '${category.itemCount == 1 ? 'item is' : 'items are'} filed under it. They keep '
              'their category either way.',
      confirmLabel: 'Rename',
    );
    if (name == null || !mounted) return;

    setState(() => _busyId = category.id);
    try {
      await ref.read(categoriesApiProvider).update(category.id, name);
      ref.invalidate(categoriesProvider);
      if (mounted) showAppToast(context, message: 'Renamed.', tone: ToastTone.success);
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _delete(Category category) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete this category?',
      body: '\u201c${category.name}\u201d is removed from the picker. Nothing is filed under '
          'it, so no item changes.',
      confirmLabel: 'Delete',
      destructive: true,
      icon: Icons.delete_outline,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busyId = category.id);
    try {
      await ref.read(categoriesApiProvider).delete(category.id);
      ref.invalidate(categoriesProvider);
      if (mounted) showAppToast(context, message: 'Category deleted.', tone: ToastTone.info);
    } on ApiError catch (error) {
      // The server refuses when items are filed here — shown verbatim, because it names
      // how many.
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.category,
    required this.busy,
    required this.onRename,
    required this.onViewItems,
    required this.onDelete,
  });

  final Category category;
  final bool busy;
  final VoidCallback onRename;
  final VoidCallback onViewItems;

  /// `null` when the category is in use, which is why the button is absent rather
  /// than present-and-failing.
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s3),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category.name,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  category.itemCount == 0
                      ? 'Nothing filed here \u2014 safe to delete'
                      : '${category.itemCount} '
                          '${category.itemCount == 1 ? 'item' : 'items'} filed here',
                  style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
                ),
              ],
            ),
          ),
          if (busy)
            const Padding(
              padding: EdgeInsets.all(AppSpace.s2),
              child: InlineSpinner(size: 18),
            )
          else ...[
            if (category.itemCount > 0)
              IconButton(
                tooltip: 'View these items',
                icon: const Icon(Icons.open_in_new, size: 18),
                color: AppColors.brand700,
                onPressed: onViewItems,
              ),
            IconButton(
              tooltip: 'Rename',
              icon: const Icon(Icons.edit_outlined, size: 18),
              color: AppColors.aauGray600,
              onPressed: onRename,
            ),
            IconButton(
              tooltip: onDelete == null
                  ? 'Move its items elsewhere before deleting'
                  : 'Delete',
              icon: const Icon(Icons.delete_outline, size: 18),
              color: onDelete == null ? AppColors.aauGray300 : AppColors.danger600,
              onPressed: onDelete,
            ),
          ],
        ],
      ),
    );
  }
}
