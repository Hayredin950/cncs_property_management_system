import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/items_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/category.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/data_display.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import 'widgets/item_card.dart';

/// `/items` — the register (§10.5).
///
/// Filters live in [itemQueryProvider], not in this widget's state, which is the
/// Flutter shape of the web's "carries state in the URL, never local-only state"
/// rule. The practical payoff: the active-filter count and the collapsed filter
/// summary can read the same source as the list, instead of each widget keeping its
/// own copy of the truth.
///
/// **There is deliberately no "show disposed" toggle.** The server excludes disposed
/// items from this endpoint, so a toggle would be a control with nothing behind it.
/// Disposed inventory is reachable through Reports, and the empty state says so —
/// because the alternative is a user searching for a laptop they know exists, finding
/// nothing, and concluding the system lost it.
class ItemsBrowsePage extends ConsumerStatefulWidget {
  const ItemsBrowsePage({super.key});

  @override
  ConsumerState<ItemsBrowsePage> createState() => _ItemsBrowsePageState();
}

class _ItemsBrowsePageState extends ConsumerState<ItemsBrowsePage> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) ref.read(itemQueryProvider.notifier).setSearch(value);
    });
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(itemQueryProvider);
    final items = ref.watch(itemListProvider);
    final categories = ref.watch(categoriesProvider).value ?? const <Category>[];
    final departments = ref.watch(observedDepartmentsProvider).value ?? const <String>[];
    final activeFilters = ref.watch(activeFilterCountProvider);
    final hasFilters = activeFilters > 0 || query.search != null;

    return PageScaffold(
      title: 'Register',
      subtitle: query.search == null && activeFilters == 0
          ? 'Every item currently in service'
          : 'Filtered',
      maxWidth: 900,
      padBottom: 96,
      onRefresh: () async {
        ref.invalidate(itemListProvider);
        await ref.read(itemListProvider.future);
      },
      children: [
        AppTextField(
          label: 'Search',
          controller: _search,
          hint: 'Name, serial, room, or tag ID',
          prefixIcon: Icons.search,
          textInputAction: TextInputAction.search,
          onChanged: _onSearchChanged,
          suffix: _search.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  icon: const Icon(Icons.close, size: 19),
                  onPressed: () {
                    _search.clear();
                    ref.read(itemQueryProvider.notifier).setSearch(null);
                    setState(() {});
                  },
                ),
        ),
        const SizedBox(height: AppSpace.s3),
        Wrap(
          spacing: AppSpace.s2,
          runSpacing: AppSpace.s2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            AppFilterChip<String>(
              label: 'Category',
              icon: Icons.sell_outlined,
              value: query.categoryId,
              allLabel: 'All categories',
              options: [for (final category in categories) category.id],
              labelOf: (id) => _categoryName(categories, id),
              onChanged: (value) => ref.read(itemQueryProvider.notifier).setCategory(value),
            ),
            AppFilterChip<String>(
              label: 'Department',
              icon: Icons.apartment_outlined,
              value: query.department,
              allLabel: 'All departments',
              options: departments,
              labelOf: (value) => value,
              onChanged: (value) => ref.read(itemQueryProvider.notifier).setDepartment(value),
            ),
            if (hasFilters)
              AppButton(
                label: 'Clear',
                variant: AppButtonVariant.outline,
                size: AppButtonSize.sm,
                icon: Icons.filter_alt_off_outlined,
                onPressed: () {
                  _search.clear();
                  ref.read(itemQueryProvider.notifier).clear();
                  setState(() {});
                },
              ),
          ],
        ),
        const SizedBox(height: AppSpace.s5),

        items.when(
          loading: () => const SkeletonList(count: 5, height: 104),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(itemListProvider),
          ),
          data: (response) {
            if (response.items.isEmpty) {
              return hasFilters
                  ? EmptyState(
                      icon: Icons.search_off_outlined,
                      title: 'No items match these filters',
                      body: 'Try a different search or clear your filters. Items that have '
                          'been disposed leave the register — they are listed in Reports.',
                      actionLabel: 'Clear filters',
                      onAction: () {
                        _search.clear();
                        ref.read(itemQueryProvider.notifier).clear();
                        setState(() {});
                      },
                    )
                  : const EmptyState(
                      icon: Icons.inventory_2_outlined,
                      title: 'No items registered yet',
                      body: 'Register the first item to get started.',
                    );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(
                  title: '${response.pagination.total} '
                      '${response.pagination.total == 1 ? 'item' : 'items'}',
                  subtitle: 'Newest first.',
                ),
                for (final item in response.items) ...[
                  ItemCard(item: item, onTap: () => context.push('/items/${item.id}')),
                  const SizedBox(height: AppSpace.stack),
                ],
                PaginationBar(
                  page: response.pagination.page,
                  totalPages: response.pagination.totalPages,
                  totalLabel: 'Page ${response.pagination.page} of '
                      '${response.pagination.totalPages}',
                  onPageChanged: (page) =>
                      ref.read(itemQueryProvider.notifier).setPage(page),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  static String _categoryName(List<Category> categories, String id) {
    for (final category in categories) {
      if (category.id == id) return category.name;
    }
    return 'Category';
  }
}
