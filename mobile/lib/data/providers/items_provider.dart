import 'package:flutter_riverpod/flutter_riverpod.dart';
// `ProviderOrFamily` is not in the main barrel — it lives in `misc.dart`.
import 'package:flutter_riverpod/misc.dart';

import '../../core/files.dart';
import '../../models/history.dart';
import '../../models/enums.dart';
import '../../models/item.dart';
import 'auth_provider.dart';
import 'core_providers.dart';

/// Items: the register's list state, the two detail lookups, and the history.
///
/// The split here is the web app's split, and it is deliberate:
///
///   * **Filters are their own provider**, so a filter change is a state change
///     the list provider merely *watches*. That is the Flutter shape of the web's
///     "carries state in the URL, never local-only state" rule (§8 `FilterBar`) —
///     the filter values live somewhere a second widget can read (the filter
///     sheet's badge count, for instance) instead of being sealed inside the list
///     widget.
///   * **The detail lookups are families keyed by tag or id**, because
///     `/item/:tagId` (public, by tag) and `/items/:id` (staff, by id) are two
///     different endpoints with two different field filters — a viewer's tag page
///     can be visibly shorter than a staff member's id page for the *same* item,
///     and caching them together would hand one viewer the other's fields.

/// The register's filter set. A record, so equality is structural and
/// `ref.watch` rebuilds exactly when a value actually changes.
///
/// `scope` and `orgUnitId` are two different questions and are kept apart on
/// purpose (the web screen separates them too):
///
///   * **scope** is the *view* — the whole register, my own holdings, my
///     department, or the rest of the college (`all` / `mine` / `department` /
///     `other`). It is resolved server-side by role, so the client never derives
///     what a person may see from a capability.
///   * **orgUnitId** narrows *within* that view to one real department. It is an
///     `OrgUnit` id, because that is what `Item.orgUnitId` holds — the free-text
///     `Item.department` column is not a taxonomy.
typedef ItemQuery = ({
  int page,
  String? search,
  String? categoryId,
  String? orgUnitId,
  String? scope,
  String? sort,
  /// The building's **name**, because that is what `GET /items?building=`
  /// matches. It is not a permission-sensitive value: the building list is
  /// public taxonomy, unlike the register rows it filters.
  String? building,
});

const ItemQuery _initialItemQuery = (
  page: 1,
  search: null,
  categoryId: null,
  orgUnitId: null,
  scope: null,
  sort: null,
  building: null,
);

class ItemQueryNotifier extends Notifier<ItemQuery> {
  @override
  ItemQuery build() => _initialItemQuery;

  /// Any filter change returns to page 1. Keeping the page when the query changed
  /// is how a filter can appear to "lose" results: the user was on page 4 of the
  /// old filter, which no longer exists under the new one.
  void setSearch(String? search) => state = (
    page: 1,
    search: _clean(search),
    categoryId: state.categoryId,
    orgUnitId: state.orgUnitId,
    scope: state.scope,
    sort: state.sort,
    building: state.building,
  );

  void setCategory(String? categoryId) => state = (
    page: 1,
    search: state.search,
    categoryId: _clean(categoryId),
    orgUnitId: state.orgUnitId,
    scope: state.scope,
    sort: state.sort,
    building: state.building,
  );

  /// Picks one department (an `OrgUnit` id) inside the current scope.
  void setOrgUnit(String? orgUnitId) => state = (
    page: 1,
    search: state.search,
    categoryId: state.categoryId,
    orgUnitId: _clean(orgUnitId),
    scope: state.scope,
    sort: state.sort,
    building: state.building,
  );

  /// Picks one building (by name — the server matches `buildingRef.name`).
  void setBuilding(String? building) => state = (
    page: 1,
    search: state.search,
    categoryId: state.categoryId,
    orgUnitId: state.orgUnitId,
    scope: state.scope,
    sort: state.sort,
    building: _clean(building),
  );

  /// Switches the view. A department filter chosen under another view is cleared,
  /// because it would silently narrow the new one — the web screen disables that
  /// picker for `mine`/`department` for the same reason.
  void setScope(String? scope) {
    final next = _clean(scope);
    final locksDepartment = next == 'mine' || next == 'department';
    state = (
      page: 1,
      search: state.search,
      categoryId: state.categoryId,
      orgUnitId: locksDepartment ? null : state.orgUnitId,
      scope: next,
      sort: state.sort,
      building: state.building,
    );
  }

  void setSort(String? sort) => state = (
    page: 1,
    search: state.search,
    categoryId: state.categoryId,
    orgUnitId: state.orgUnitId,
    scope: state.scope,
    sort: _clean(sort),
    building: state.building,
  );

  void setPage(int page) => state = (
    page: page < 1 ? 1 : page,
    search: state.search,
    categoryId: state.categoryId,
    orgUnitId: state.orgUnitId,
    scope: state.scope,
    sort: state.sort,
    building: state.building,
  );

  void clear() => state = _initialItemQuery;

  static String? _clean(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}

final itemQueryProvider = NotifierProvider<ItemQueryNotifier, ItemQuery>(ItemQueryNotifier.new);

/// How many filters are active — the "Filters · 2" count on the collapsed filter
/// trigger (§8). `search` is excluded because it has its own visible control, and
/// `scope` because it names the view rather than narrowing it.
final activeFilterCountProvider = Provider<int>((ref) {
  final query = ref.watch(itemQueryProvider);
  return (query.categoryId == null ? 0 : 1) +
      (query.orgUnitId == null ? 0 : 1) +
      (query.building == null ? 0 : 1) +
      (query.sort == null ? 0 : 1);
});

class ItemListNotifier extends AsyncNotifier<ItemsListResponse> {
  @override
  Future<ItemsListResponse> build() {
    final query = ref.watch(itemQueryProvider);
    final role = ref.watch(currentUserProvider)?.role;

    /// "No scope chosen" means **the whole register**, not the server's narrow
    /// role default.
    ///
    /// Asking `GET /items` with no `scope` answers with the caller's own holdings
    /// (that is the server's safe default), which left a staff member's Items tab
    /// showing ten rows of their own things while the same screen on the web
    /// showed the register. The web sends `scope=all` as its default view, and so
    /// does this screen; `mine` is an option you pick, not the place you start.
    ///
    /// A System Admin has no scope options (the register is not theirs to browse
    /// as a person), so the request stays unscoped and the server's rule stands.
    final scope = query.scope ?? (role == Role.systemAdmin ? null : 'all');

    return ref
        .watch(itemsApiProvider)
        .list(
          page: query.page,
          search: query.search,
          categoryId: query.categoryId,
          orgUnitId: query.orgUnitId,
          scope: scope,
          sort: query.sort,
          building: query.building,
        );
  }
}

final itemListProvider = AsyncNotifierProvider<ItemListNotifier, ItemsListResponse>(
  ItemListNotifier.new,
);

/// The newest registrations in the register — the dashboard's "recently
/// registered" list.
///
/// It asks `GET /items` (sorted newest first) rather than `GET /items/recent`: a
/// dashboard wants three rows and `/recent` answers with a lean array of
/// `{id, name, tagId, registeredAt}`, while the card renders condition, location
/// and category. Reading an array into a record is the crash a Staff account
/// met on a physical phone; asking the list for three rows returns the same
/// shape as everywhere else.
final recentItemsProvider = FutureProvider<ItemsListResponse>((ref) {
  final role = ref.watch(currentUserProvider)?.role;

  /**
   * A staff member's tile asks for the college's recent registrations, not
   * their own three: the register is the college's, and the server's scope
   * rules decide what each role may see. Asking for `all` is the same word
   * the register screen uses, so the two cannot disagree about what the
   * staff member may read.
   */
  final scope = role == Role.staff ? 'all' : null;
  return ref.watch(itemsApiProvider).recent(limit: 3, scope: scope);
});

/// What the signed-in person holds — the dashboard's "my holdings".
final myHoldingsProvider = FutureProvider<ItemsListResponse>((ref) {
  return ref.watch(itemsApiProvider).heldByMe();
});

/// `GET /items/:tagId` — the QR destination.
///
/// This provider deliberately **surfaces** a `404`/`410` as an `AsyncError`
/// carrying the [ApiError] rather than resolving to a nullable: the two outcomes
/// are fully designed pages (§10.2), not a "no result" the caller might render as
/// a blank card, and a nullable return is exactly what lets that mistake happen.
final itemByTagProvider = FutureProvider.family<Item, String>((ref, tagId) {
  return ref.watch(itemsApiProvider).byTagId(tagId);
});

/// `GET /items/:id` — the staff detail view.
final itemByIdProvider = FutureProvider.family<Item, String>((ref, itemId) {
  return ref.watch(itemsApiProvider).byId(itemId);
});

/// `GET /items/:id/history` — Staff/Admin only (the owner cannot read it, per SRS
/// 3.4), which is why only the staff detail screen asks for it.
final itemHistoryProvider = FutureProvider.family<ItemsHistoryResponse, String>((ref, itemId) {
  return ref.watch(itemsApiProvider).history(itemId);
});

/// One item's accessories list. Derived from the item itself rather than a
/// separate request — the API returns full accessory rows inline, and a second
/// fetch would be able to disagree with the card above it.
final itemAccessoriesProvider = Provider.family<List<Item>, Item>((ref, item) => item.accessories);

/// Everything a mutation to one item could have changed.
///
/// One list rather than six call sites, because the failure mode this prevents is
/// subtle: a save changes an item *and* its edit log, and a screen that refreshes
/// only the card it was looking at leaves the next screen stale.
List<ProviderOrFamily> _itemDependents({String? itemId, String? tagId}) => [
  itemListProvider,
  if (itemId != null) itemByIdProvider(itemId),
  if (itemId != null) itemHistoryProvider(itemId),
  if (tagId != null) itemByTagProvider(tagId),
];

/// For a provider that just mutated an item.
extension ItemInvalidation on Ref {
  void invalidateItemData({String? itemId, String? tagId}) {
    for (final provider in _itemDependents(itemId: itemId, tagId: tagId)) {
      invalidate(provider);
    }
  }
}

/// For a widget that just mutated one — same behaviour, because `Ref` and
/// `WidgetRef` are separate sealed classes in Riverpod 3 with no common
/// `invalidate` to lean on.
extension ItemInvalidationOnWidgetRef on WidgetRef {
  void invalidateItemData({String? itemId, String? tagId}) {
    for (final provider in _itemDependents(itemId: itemId, tagId: tagId)) {
      invalidate(provider);
    }
  }
}

/// Every item mutation, with its own invalidation already applied.
///
/// Mutations live in a class rather than in each screen because a screen that
/// forgets one `invalidate` produces the worst kind of bug: a page that shows the
/// truth to whoever just changed it and a lie to everyone who navigates there next.
class ItemActions {
  const ItemActions(this._ref);

  final Ref _ref;

  /// `POST /items`. The Tag ID is generated server-side — this client never sends
  /// one, because two phones registering offline at once must not be able to
  /// collide on a sticker that is already printed.
  Future<Item> create(CreateItemPayload payload) async {
    final item = await _ref.read(itemsApiProvider).create(payload);
    _ref.invalidate(itemListProvider);
    return item;
  }

  /// `PUT /items/:id`. [payload] is a partial field map; the API module strips
  /// immutable keys (`tagId`, `status`, `categoryId`…) that the server ignores or
  /// rejects anyway.
  Future<Item> update(String id, Map<String, dynamic> payload) async {
    final item = await _ref.read(itemsApiProvider).update(id, payload);
    _ref.invalidateItemData(itemId: id);
    return item;
  }

  /// `POST /items/:id/accessories` — the only way to bundle, because `POST /items`
  /// rejects `parentItemId` outright.
  Future<void> linkAccessories(String parentId, List<String> accessoryItemIds) async {
    await _ref.read(itemsApiProvider).linkAccessories(parentId, accessoryItemIds);
    _ref.invalidateItemData(itemId: parentId);
  }

  /// `DELETE /items/:id/accessories/:accessoryId` — allowed even when the parent is
  /// disposed, so a bad bundle can still be corrected.
  Future<void> unlinkAccessory(String parentId, String accessoryId) async {
    await _ref.read(itemsApiProvider).unlinkAccessory(parentId, accessoryId);
    _ref.invalidateItemData(itemId: parentId);
  }

  /// `POST /items/:id/tag/regenerate` — new sticker design, same Tag ID, so every
  /// already-printed QR code keeps working (F3.5).
  Future<String> regenerateTag(String itemId) async {
    final tagId = await _ref.read(itemsApiProvider).regenerateTag(itemId);
    _ref.invalidateItemData(itemId: itemId, tagId: tagId);
    return tagId;
  }

  /// `GET /items/:id/tag` — the printable PNG, saved like any other download.
  Future<SavedFile> downloadTag({required String itemId, required String tagId}) async {
    final bytes = await _ref.read(itemsApiProvider).tagPng(itemId);
    return saveBytes(bytes: bytes, filename: '$tagId.png', mimeType: 'image/png');
  }

  /// `POST /uploads/photo`, then the returned URL is what `photoUrl` is set to.
  Future<String> uploadPhoto({
    required List<int> bytes,
    required String filename,
    required String mimeType,
  }) {
    return _ref
        .read(uploadsApiProvider)
        .uploadPhoto(bytes: bytes, filename: filename, mimeType: mimeType);
  }

  /// `DELETE /uploads/photo` — best-effort cleanup when a photo was uploaded for a
  /// form and then replaced or removed before the form was saved.
  Future<bool> deletePhoto(String url) => _ref.read(uploadsApiProvider).deletePhoto(url);

  /// `POST /items/:id/claim` — claim a PENDING_CLAIM item.
  Future<Item> claim(String id) async {
    final item = await _ref.read(itemsApiProvider).claim(id);
    _ref.invalidateItemData(itemId: id);
    return item;
  }

  /// `POST /items/:id/refuse-claim` — refuse a PENDING_CLAIM item, reverting to
  /// the college pool. A code from the fixed set plus optional free text.
  Future<Item> refuseClaim(String id, {required String reason, String? otherReason}) async {
    final item = await _ref
        .read(itemsApiProvider)
        .refuseClaim(id, reason: reason, otherReason: otherReason);
    _ref.invalidateItemData(itemId: id);
    return item;
  }
}

final itemActionsProvider = Provider<ItemActions>(ItemActions.new);
