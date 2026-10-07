import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/core_providers.dart';
import '../../models/item.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../items/widgets/item_card.dart';

/// `/map` — browse the register by building.
///
/// §10.12 marks this screen **P1, "cut first"**, and allows it not to exist at all,
/// on the grounds that "F5.1's text location (present on every item view since
/// Phase 1) already satisfies the underlying need". This ships the underlying need
/// and not the picture: a building picker over the register, instead of a campus
/// illustration with tappable hotspots.
///
/// The honest reason is that there is no campus artwork in this repository to put
/// behind the hotspots, and a placeholder rectangle labelled "map" would be a screen
/// that looks like a feature and does nothing — worse than the text list it replaced.
/// What a user actually wants from `/map` is "show me what is in that building", and
/// that is exactly what this does, from the same `GET /items` data the web version
/// derives its hotspots from. If the licensed image arrives, only the top of this
/// file changes; the sheet below already takes a building and lists its items.
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

class MapPage extends ConsumerStatefulWidget {
  const MapPage({super.key});

  @override
  ConsumerState<MapPage> createState() => _MapPageState();
}

class _MapPageState extends ConsumerState<MapPage> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final buildings = ref.watch(buildingItemsProvider);

    return PageScaffold(
      title: 'Buildings',
      subtitle: 'Where the register says things are',
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
          data: (grouped) => _body(grouped),
        ),
      ],
    );
  }

  Widget _body(Map<String, List<Item>> grouped) {
    if (grouped.isEmpty) {
      return const EmptyState(
        icon: Icons.map_outlined,
        title: 'No buildings to show yet',
        body: 'Buildings appear here as soon as items are registered against them.',
      );
    }

    final names = grouped.keys.toList()..sort();
    final selected = (_selected != null && grouped.containsKey(_selected))
        ? _selected! 
        : names.first;
    final items = grouped[selected] ?? const <Item>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSelectField<String>(
          label: 'Building',
          value: selected,
          options: names,
          labelOf: (name) => '$name · ${grouped[name]?.length ?? 0} items',
          onChanged: (value) => setState(() => _selected = value),
          helper: 'Derived from the active register — disposed items are not listed here.',
        ),
        const SizedBox(height: AppSpace.s6),
        SectionHeader(
          title: selected,
          subtitle: items.length == 1 ? '1 item' : '${items.length} items',
        ),
        for (final item in items.take(12)) ...[
          ItemCard(item: item, onTap: () => context.push('/item/${item.tagId}')),
          const SizedBox(height: AppSpace.stack),
        ],
        if (items.length > 12)
          AppButton(
            label: 'See all ${items.length} in $selected',
            variant: AppButtonVariant.outline,
            expand: true,
            icon: Icons.search,
            onPressed: () => showAppSheet<void>(
              context,
              child: _BuildingSheet(name: selected, items: items),
            ),
          ),
        const SizedBox(height: AppSpace.s5),
        AppButton(
          label: 'Search the register instead',
          variant: AppButtonVariant.ghost,
          expand: true,
          icon: Icons.search,
          onPressed: () => context.go('/items'),
        ),
      ],
    );
  }
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
