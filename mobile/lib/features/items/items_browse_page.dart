import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/auth_provider.dart';
import '../../data/providers/items_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/category.dart';
import '../../models/department.dart';
import '../../models/enums.dart';
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
    final role = ref.watch(currentUserProvider)?.role;
    final categories = ref.watch(categoriesProvider).value ?? const <Category>[];
    final departments = ref.watch(departmentsProvider).value ?? const <Department>[];
    final activeFilters = ref.watch(activeFilterCountProvider);
    final hasFilters = activeFilters > 0 || query.search != null;

    /// The scope is the **view**; the department filter narrows inside it.
    ///
    /// This is the web screen's filter row (§8): Scope, Sort by, Category,
    /// Department. The order matters — the scope decides what the other three are
    /// filtering, and it is the server (not the client) that resolves it against
    /// the caller's role.
    final scopeOptions = _scopeOptions(role);
    final defaultScope = role == Role.systemAdmin ? null : 'all';
    final effectiveScope = query.scope ?? defaultScope;
    final departmentLocked = effectiveScope == 'mine' || effectiveScope == 'department';

    return PageScaffold(
      // The screen is named for the view, the same word the web nav uses
      // ("Browse items"). It used to say "Register" while the tab under it said
      // "Items" and the web said "Browse items" — three names for one screen, and
      // "Register" read like the action of adding an item rather than the place
      // you look one up.
      title: _titleFor(effectiveScope),
      subtitle: hasFilters ? 'Filtered' : _subtitleFor(effectiveScope),
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
            if (scopeOptions.isNotEmpty)
              AppFilterChip<String>(
                label: defaultScope == null ? 'Scope' : _scopeLabel(defaultScope),
                icon: Icons.visibility_outlined,
                value: query.scope,
                allLabel: _scopeLabel(defaultScope ?? 'all'),
                options: [for (final option in scopeOptions) option.value],
                labelOf: _scopeLabel,
                onChanged: (value) => ref.read(itemQueryProvider.notifier).setScope(value),
              ),
            AppFilterChip<String>(
              label: 'Sort by',
              icon: Icons.swap_vert,
              value: query.sort,
              allLabel: 'Newest first',
              options: const ['name', 'cost', 'status', 'oldest'],
              labelOf: _sortLabel,
              onChanged: (value) => ref.read(itemQueryProvider.notifier).setSort(value),
            ),
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
              value: query.orgUnitId,
              allLabel: 'All departments',
              options: [for (final department in departments) department.id],
              labelOf: (id) => _departmentName(departments, id),
              // Under "My items" and "My department" the server has already
              // narrowed to that department, so a second picker would either
              // contradict the view or be a control that does nothing — the web
              // screen disables it in exactly these two cases.
              enabled: !departmentLocked,
              onChanged: (value) => ref.read(itemQueryProvider.notifier).setOrgUnit(value),
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
                  subtitle: _sortLabel(query.sort ?? ''),
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

  /// The views each role may choose, mirroring `getScopeOptions()` on the web.
  ///
  /// A Property Officer and an Auditor already read the whole campus register, so
  /// their only other view is "my items". Staff and Department Heads get four: the
  /// register, their own holdings, their department, and the rest of the college —
  /// the last one answers "what does the rest of CNCS have?" when looking for
  /// something to request.
  static List<({String value, String label})> _scopeOptions(Role? role) {
    switch (role) {
      case Role.departmentHead:
      case Role.staff:
        return const [
          (value: 'all', label: 'All departments'),
          (value: 'mine', label: 'My items'),
          (value: 'department', label: 'My department'),
          (value: 'other', label: 'Other departments'),
        ];
      case Role.propertyOfficer:
      case Role.auditor:
        return const [
          (value: 'all', label: 'All campus'),
          (value: 'mine', label: 'My items'),
        ];
      default:
        return const [];
    }
  }

  static String _scopeLabel(String value) {
    switch (value) {
      case 'mine':
        return 'My items';
      case 'department':
        return 'My department';
      case 'other':
        return 'Other departments';
      default:
        return 'All departments';
    }
  }

  static String _titleFor(String? scope) {
    switch (scope) {
      case 'mine':
        return 'My items';
      case 'department':
        return 'My department';
      case 'other':
        return 'Other departments';
      default:
        return 'Browse items';
    }
  }

  static String _subtitleFor(String? scope) {
    switch (scope) {
      case 'mine':
        return 'The items currently in your custody.';
      case 'department':
        return 'All items in your department.';
      case 'other':
        return 'Items from other departments, for transfer requests.';
      default:
        return 'Every item currently in service';
    }
  }

  static String _sortLabel(String value) {
    switch (value) {
      case 'name':
        return 'Name (A–Z)';
      case 'cost':
        return 'Value';
      case 'status':
        return 'Status';
      case 'oldest':
        return 'Oldest first';
      default:
        return 'Newest first';
    }
  }

  static String _departmentName(List<Department> departments, String id) {
    for (final department in departments) {
      if (department.id == id) return department.name;
    }
    return 'Department';
  }

  static String _categoryName(List<Category> categories, String id) {
    for (final category in categories) {
      if (category.id == id) return category.name;
    }
    return 'Category';
  }
}
