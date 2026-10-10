import '../../core/api/api_client.dart';
import '../../models/history.dart';
import '../../models/item.dart';
import '../../models/json.dart';

/// Response of both accessory endpoints — counts for the toast, ids for
/// invalidation.
class AccessoriesOutcome {
  const AccessoriesOutcome({
    required this.itemId,
    required this.tagId,
    required this.name,
    required this.linkedItemIds,
    required this.alreadyLinkedItemIds,
    required this.editLogRowCount,
  });

  factory AccessoriesOutcome.fromJson(Map<String, dynamic> json) {
    final item = asMap(json['item']);
    return AccessoriesOutcome(
      itemId: asString(item['id']),
      tagId: asString(item['tagId']),
      name: asString(item['name']),
      linkedItemIds: _stringList(json['linkedItemIds']),
      alreadyLinkedItemIds: _stringList(json['alreadyLinkedItemIds']),
      editLogRowCount: asInt(json['editLogRowCount']),
    );
  }

  static List<String> _stringList(Object? value) => [
        if (value is List)
          for (final entry in value)
            if (entry != null) '$entry',
      ];

  final String itemId;
  final String tagId;
  final String name;
  final List<String> linkedItemIds;
  final List<String> alreadyLinkedItemIds;
  final int editLogRowCount;
}

/// `frontend/src/api/items.ts`.
class ItemsApi {
  const ItemsApi(this._client);

  final ApiClient _client;

  /// `GET /items` — public, richer when signed in. Field filtering happens
  /// server-side; this module never re-implements it.
  Future<ItemsListResponse> list({
    int page = 1,
    int limit = 20,
    String? search,
    String? categoryId,
    String? department,
  }) async {
    final json = await _client.get<Map<String, dynamic>>(
      '/items',
      query: {
        'page': page,
        'limit': limit,
        'search': search,
        'categoryId': categoryId,
        'department': department,
      },
    );
    return ItemsListResponse.fromJson(json);
  }

  /// `GET /items/:tagId` — the QR destination. `404` for an unknown tag, `410`
  /// for a disposed item seen by the public. Both surface as [ApiError] for the
  /// screen to branch on.
  Future<Item> byTagId(String tagId) async {
    final json = await _client.get<Map<String, dynamic>>('/items/${Uri.encodeComponent(tagId)}');
    return Item.fromJson(json);
  }

  /// `GET /items/:id` — the same endpoint keyed by the item's uuid. The backend
  /// accepts either and picks by shape, which is what lets the staff routes
  /// resolve an item from the id in their own path.
  Future<Item> byId(String id) async {
    final json = await _client.get<Map<String, dynamic>>('/items/${Uri.encodeComponent(id)}');
    return Item.fromJson(json);
  }

  /// `POST /items` — Staff/Admin. The tag ID is generated server-side.
  Future<Item> create(CreateItemPayload payload) async {
    final json = await _client.post<Map<String, dynamic>>('/items', body: payload.toJson());
    return Item.fromJson(json);
  }

  /// `PUT /items/:id` — partial update; a disposed item answers 409.
  ///
  /// The four transfer-only fields are stripped here rather than trusted to every
  /// caller to remember: `PUT` refuses `building`, `floor`, `room` and `ownerId`
  /// **for every role, Admin included**, because only an approved TRANSFER may
  /// change where an item is. Sending them would be a 400, so the client simply
  /// cannot express that request (backend-handoff.md).
  Future<Item> update(String id, Map<String, dynamic> payload) async {
    final body = Map<String, dynamic>.from(payload)
      ..remove('building')
      ..remove('floor')
      ..remove('room')
      ..remove('ownerId');
    final json = await _client.put<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(id)}',
      body: body,
    );
    return Item.fromJson(json);
  }

  /// `GET /items/:id/history` — Staff/Admin; disposed items included on purpose.
  Future<ItemsHistoryResponse> history(
    String id, {
    int limit = 50,
    int offset = 0,
    String? field,
  }) async {
    final json = await _client.get<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(id)}/history',
      query: {'limit': limit, 'offset': offset, 'field': field},
    );
    return ItemsHistoryResponse.fromJson(json);
  }

  /// `POST /items/:id/accessories` — the ONLY way to bundle. Accepts one id or
  /// many; the server dedupes.
  Future<AccessoriesOutcome> linkAccessories(String parentId, List<String> accessoryItemIds) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(parentId)}/accessories',
      body: {'accessoryItemIds': accessoryItemIds},
    );
    return AccessoriesOutcome.fromJson(json);
  }

  /// `DELETE /items/:id/accessories/:accessoryId` — allowed even when disposed
  /// (fixing a bad bundle).
  Future<AccessoriesOutcome> unlinkAccessory(String parentId, String accessoryId) async {
    final json = await _client.delete<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(parentId)}/accessories/${Uri.encodeComponent(accessoryId)}',
    );
    return AccessoriesOutcome.fromJson(json);
  }

  /// `POST /items/:id/tag/regenerate` — reissues the sticker's design; the Tag ID
  /// (and therefore every printed sticker's link) is unchanged (F3.5).
  Future<String> regenerateTag(String itemId) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(itemId)}/tag/regenerate',
    );
    return asString(json['tagId']);
  }

  /// `GET /items/:id/tag` — the printable QR PNG, behind `authenticate`, so it
  /// must travel with the auth header. Returns the raw bytes.
  Future<List<int>> tagPng(String itemId) =>
      _client.getBytes('/items/${Uri.encodeComponent(itemId)}/tag');

  /// `DELETE /items/:id` — **Admin only**, and a deliberate departure from F7.2:
  /// it really destroys the row and its dependents. Nothing in this app routes to
  /// it by default; the confirmation names what goes and points at the disposal
  /// workflow as the alternative.
  Future<Map<String, dynamic>> delete(String id) =>
      _client.delete<Map<String, dynamic>>('/items/${Uri.encodeComponent(id)}');
}
