import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/core_providers.dart';
import '../../data/providers/items_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/category.dart';
import '../../models/item.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../items/widgets/item_card.dart';

/// `/` — the landing page (Shell A).
///
/// "Find an item, fast, with zero training" is the whole brief (§10.1), so the page
/// is one action, one search box, two filters, and a short list of what is in the
/// register. Everything else the app can do lives behind the staff login.
///
/// **The landing page has its own filter state, separate from the register's.**
/// That looks like duplication and is not: `/items` keeps its filters so a user can
/// come back to a narrowed list, while `/` always opens as a fresh "what is here?"
/// question. Sharing one filter set would mean landing on the home page already
/// filtered by whatever was left over from last time, which is the opposite of
/// "find an item, fast".
typedef LandingQuery = ({String? search, String? categoryId, String? department});

class _LandingQueryNotifier extends Notifier<LandingQuery> {
  @override
  LandingQuery build() => (search: null, categoryId: null, department: null);

  void setSearch(String? value) => state = (
        search: _clean(value),
        categoryId: state.categoryId,
        department: state.department,
      );

  void setCategory(String? value) =>
      state = (search: state.search, categoryId: _clean(value), department: state.department);

  void setDepartment(String? value) =>
      state = (search: state.search, categoryId: state.categoryId, department: _clean(value));

  void clear() => state = (search: null, categoryId: null, department: null);

  static String? _clean(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}

final _landingQueryProvider =
    NotifierProvider<_LandingQueryNotifier, LandingQuery>(_LandingQueryNotifier.new);

/// Eight results, not a page of twenty: the landing page is a look, not a browse.
/// "View all" hands the same filters to the register, which is where paging lives.
final _landingItemsProvider = FutureProvider<ItemsListResponse>((ref) {
  final query = ref.watch(_landingQueryProvider);
  return ref.watch(itemsApiProvider).list(
        limit: 8,
        search: query.search,
        categoryId: query.categoryId,
        department: query.department,
      );
});

class LandingPage extends ConsumerStatefulWidget {
  const LandingPage({super.key});

  @override
  ConsumerState<LandingPage> createState() => _LandingPageState();
}

class _LandingPageState extends ConsumerState<LandingPage> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  /// 300ms, the same debounce the web's `SearchBar` uses (§8). Shorter and every
  /// keystroke becomes a request on a slow campus connection; longer and typing
  /// feels like the app has stopped listening.
  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) ref.read(_landingQueryProvider.notifier).setSearch(value);
    });
  }

  void _viewAll() {
    final query = ref.read(_landingQueryProvider);
    final notifier = ref.read(itemQueryProvider.notifier);
    notifier.clear();
    if (query.search != null) notifier.setSearch(query.search);
    if (query.categoryId != null) notifier.setCategory(query.categoryId);
    if (query.department != null) notifier.setDepartment(query.department);
    context.go('/items');
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(_landingQueryProvider);
    final items = ref.watch(_landingItemsProvider);
    final categoryList = ref.watch(categoriesProvider).value ?? const <Category>[];
    final departmentList = ref.watch(observedDepartmentsProvider).value ?? const <String>[];
    final hasFilters = query.search != null || query.categoryId != null || query.department != null;

    void clearFilters() {
      _search.clear();
      ref.read(_landingQueryProvider.notifier).clear();
      setState(() {});
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.gutter,
        AppSpace.s6,
        AppSpace.gutter,
        AppSpace.s10,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Find a campus asset',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: AppColors.aauGray900,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: AppSpace.s2),
              const Text(
                'Scan the sticker on an item, or search the register by name, tag ID, '
                'department or category.',
                style: TextStyle(fontSize: 14, color: AppColors.aauGray600, height: 1.5),
              ),
              const SizedBox(height: AppSpace.s5),

              // The flagship action, accent-filled and 56 tall: the one thing a
              // visitor with a phone in their hand is most likely to need.
              AppButton(
                label: 'Scan a tag',
                icon: Icons.qr_code_scanner,
                variant: AppButtonVariant.primary,
                size: AppButtonSize.lg,
                expand: true,
                onPressed: () => context.push('/scan'),
              ),

              const SizedBox(height: AppSpace.s4),
              const _OrDivider(),
              const SizedBox(height: AppSpace.s4),

              AppTextField(
                label: 'Search the register',
                controller: _search,
                focusNode: _searchFocus,
                hint: 'Name, serial, or CNCS-DEMO-0001',
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
                          ref.read(_landingQueryProvider.notifier).setSearch(null);
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
                    label: 'Department',
                    icon: Icons.apartment_outlined,
                    value: query.department,
                    allLabel: 'All departments',
                    options: departmentList,
                    labelOf: (value) => value,
                    onChanged: (value) =>
                        ref.read(_landingQueryProvider.notifier).setDepartment(value),
                  ),
                  AppFilterChip<String>(
                    label: 'Category',
                    icon: Icons.sell_outlined,
                    value: query.categoryId,
                    allLabel: 'All categories',
                    options: [for (final category in categoryList) category.id],
                    labelOf: (id) => _categoryName(categoryList, id),
                    onChanged: (value) =>
                        ref.read(_landingQueryProvider.notifier).setCategory(value),
                  ),
                  if (hasFilters)
                    AppButton(
                      label: 'Clear',
                      variant: AppButtonVariant.outline,
                      size: AppButtonSize.sm,
                      icon: Icons.filter_alt_off_outlined,
                      onPressed: clearFilters,
                    ),
                ],
              ),

              const SizedBox(height: AppSpace.s8),
              items.when(
                loading: () => const Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionHeader(title: 'Recently added'),
                    SkeletonList(count: 3, height: 100),
                  ],
                ),
                error: (error, _) => Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SectionHeader(title: 'Recently added'),
                    InlineError(
                      error: error,
                      onRetry: () => ref.invalidate(_landingItemsProvider),
                    ),
                  ],
                ),
                data: (response) => _results(
                  response,
                  hasFilters: hasFilters,
                  onClear: clearFilters,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _results(
    ItemsListResponse response, {
    required bool hasFilters,
    required VoidCallback onClear,
  }) {
    // §10.1: an empty result under filters and an empty *register* are different
    // states with different copy — "no items match these filters" (fixable) versus
    // "no items registered yet" (only seen against a fresh database).
    if (response.items.isEmpty) {
      return hasFilters
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionHeader(title: 'Search results'),
                EmptyState(
                  icon: Icons.search_off_outlined,
                  title: 'No items match these filters',
                  body: 'Try a different search, or clear your filters.',
                  actionLabel: 'Clear filters',
                  onAction: onClear,
                ),
              ],
            )
          : const EmptyState(
              icon: Icons.inventory_2_outlined,
              title: 'No items registered yet',
              body: 'Once the property office registers equipment, it will appear here '
                  'and every printed tag will resolve to its own page.',
            );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: hasFilters ? 'Search results' : 'Recently added',
          subtitle: '${response.pagination.total} in the register',
          actionLabel: hasFilters || response.pagination.total > response.items.length
              ? 'View all'
              : null,
          onAction: hasFilters || response.pagination.total > response.items.length
              ? _viewAll
              : null,
        ),
        for (final item in response.items) ...[
          ItemCard(item: item, onTap: () => context.push('/item/${item.tagId}')),
          const SizedBox(height: AppSpace.stack),
        ],
        if (response.pagination.total > response.items.length)
          const Text(
            'The register shows a page at a time. Use View all to search and filter the '
            'whole thing.',
            style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.5),
          ),
        const SizedBox(height: AppSpace.s4),
        AppButton(
          label: 'Browse by building',
          variant: AppButtonVariant.outline,
          icon: Icons.map_outlined,
          expand: true,
          onPressed: () => context.push('/map'),
        ),
      ],
    );
  }
}

/// A category id to a name. A loop rather than `firstWhere` with an `orElse` that
/// would have to invent a `Category` to return — the fallback here is a string, and
/// a filter chip showing "Category" for an id the list no longer contains is more
/// honest than showing the first row's name.
String _categoryName(List<Category> categories, String id) {
  for (final category in categories) {
    if (category.id == id) return category.name;
  }
  return 'Category';
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) => const Row(
        children: [
          Expanded(child: Divider()),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpace.s3),
            child: Text(
              '— or —',
              style: TextStyle(fontSize: 12.5, color: AppColors.aauGray400),
            ),
          ),
          Expanded(child: Divider()),
        ],
      );
}
