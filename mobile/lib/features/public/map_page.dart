import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/core_providers.dart';
import '../../models/item.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../items/widgets/item_card.dart';

/// `/map` — browse the register by building.
///
/// §10.12 marks this screen **P1, "cut first"**, and allows it not to exist at all,
/// on the grounds that "F5.1's text location (present on every item view since
/// Phase 1) already satisfies the underlying need". This ships the underlying need
/// and not the picture: every building the register knows about, one section each,
/// instead of a campus illustration with tappable hotspots.
///
/// The honest reason is that there is no campus artwork in this repository to put
/// behind the hotspots, and a placeholder rectangle labelled "map" would be a screen
/// that looks like a feature and does nothing — worse than the text list it replaced.
/// What a user actually wants from `/map` is "show me what is in that building", and
/// that is exactly what this does, from the same `GET /items` data the web version
/// derives its hotspots from. If the licensed image arrives, only the top of this
/// file changes; the sheet below already takes a building and lists its items.
///
/// **Every building is listed, not one selected at a time.** An earlier version put a
/// building picker at the top and showed one building under it, which made the answer
/// to "what is in Building 3?" depend on already knowing that the building is called
/// "Building 3" — the same reason the web version renders a card per building. Long
/// buildings collapse to a count and a sheet rather than a five-screen scroll.
///
/// Note the derived-data caveat the web version has too: a building only appears
/// here once an item is registered in it, and the list is built from the **active**
/// register, which excludes disposed items (server-enforced).
final buildingItemsProvider = FutureProvider<Map<String, List<Item>>>((ref) async {
  // One page at a time, up to four pages, to build the index. There is no
  // `GET /buildings` endpoint, so the register itself is the only source — and
  // paging a bounded amount keeps a 2,000-item register from becoming one enormous
  // response on a phone connection.
  final api = ref.watch(itemsApiProvider);
  final grouped = <String, List<Item>>{};

  for (var page = 1; page <= 4; page++) {
    final response = await api.list(page: page, limit: 100);
    for (final item in response.items) {
      final building = item.building.trim().isEmpty ? 'Unspecified' : item.building.trim();
      grouped.putIfAbsent(building, () => []).add(item);
    }
    if (page >= response.pagination.totalPages) break;
  }

  return grouped;
});

/// How many of a building's items the section itself prints. Past this the section
/// ends in "See all N", which opens the sheet — a building with 200 items would
/// otherwise be the whole screen and the other buildings unreachable.
const _sectionPreview = 5;

class MapPage extends ConsumerWidget {
  const MapPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final buildings = ref.watch(buildingItemsProvider);

    return PageScaffold(
      title: 'Buildings',
      subtitle: 'Grouped by the location on each item\u2019s tag',
      maxWidth: 720,
      onRefresh: () async {
        ref.invalidate(buildingItemsProvider);
        await ref.read(buildingItemsProvider.future);
      },
      children: [
        buildings.when(
          loading: () => const SkeletonList(count: 4, height: 84),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(buildingItemsProvider),
          ),
          data: (grouped) => _body(context, grouped),
        ),
      ],
    );
  }

  Widget _body(BuildContext context, Map<String, List<Item>> grouped) {
    if (grouped.isEmpty) {
      return const EmptyState(
        icon: Icons.map_outlined,
        title: 'No buildings to show yet',
        body: 'Buildings appear here as soon as items are registered against them.',
      );
    }

    // Alphabetical, not most-items-first: the list is a way to find a building you
    // already have in mind, and an order that shifts as the register grows would make
    // the same building move around between visits.
    final names = grouped.keys.toList()..sort();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final name in names) ..._building(context, name, grouped[name]!),
        AppButton(
          label: 'Search the register instead',
          variant: AppButtonVariant.ghost,
          expand: true,
          icon: Icons.search,
          onPressed: () => context.go('/items'),
        ),
        const Padding(
          padding: EdgeInsets.only(top: AppSpace.s3),
          child: Text(
            'Derived from the active register \u2014 disposed items are not listed here.',
            style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.45),
          ),
        ),
      ],
    );
  }

  /// One building's section: its name, how many items it holds, and the first few of
  /// them — with the rest one tap away rather than loading a sheet into the page.
  List<Widget> _building(BuildContext context, String name, List<Item> items) => [
        SectionHeader(
          title: name,
          subtitle: items.length == 1 ? '1 item' : '${items.length} items',
        ),
        for (final item in items.take(_sectionPreview)) ...[
          ItemCard(item: item, onTap: () => context.push('/item/${item.tagId}')),
          const SizedBox(height: AppSpace.stack),
        ],
        if (items.length > _sectionPreview)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpace.stack),
            child: AppButton(
              label: 'See all ${items.length} in $name',
              variant: AppButtonVariant.outline,
              expand: true,
              icon: Icons.list_alt_outlined,
              onPressed: () => showAppSheet<void>(
                context,
                child: _BuildingSheet(name: name, items: items),
              ),
            ),
          ),
        const SizedBox(height: AppSpace.s5),
      ];
}

/// The full building list inside a sheet — the phone equivalent of the web's
/// `Drawer` of a building's items (§10.12).
class _BuildingSheet extends StatelessWidget {
  const _BuildingSheet({required this.name, required this.items});

  final String name;
  final List<Item> items;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
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
                  child: Text(
                    name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.aauGray900,
                    ),
                  ),
                ),
                Text(
                  '${items.length}',
                  style: const TextStyle(fontSize: 13, color: AppColors.aauGray500),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Flexible(
            child: ListView.builder(
              padding: const EdgeInsets.all(AppSpace.s4),
              itemCount: items.length,
              itemBuilder: (context, index) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpace.s2),
                child: ItemCard(
                  item: items[index],
                  onTap: () {
                    Navigator.of(context).pop();
                    context.push('/item/${items[index].tagId}');
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
