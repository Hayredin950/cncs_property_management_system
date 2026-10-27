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

  /// `GET /items` — the register, scoped and filtered server-side.
  ///
  /// Every parameter here is one the route understands: `scope` picks a view
  /// (`all` / `mine` / `department` / `other`), `orgUnitId` filters on the item's
  /// real department (an `OrgUnit` id, not the free-text `department` column),
  /// and `sort` is the same vocabulary the web's "Sort by" uses. Field filtering
  /// happens server-side; this module never re-implements it.
  Future<ItemsListResponse> list({
    int page = 1,
    int limit = 20,
    String? search,
    String? categoryId,
    String? orgUnitId,
    String? scope,
    String? sort,
    String? building,
  }) async {
    final json = await _client.get<Map<String, dynamic>>(
      '/items',
      query: {
        'page': page,
        'limit': limit,
        'search': search,
        'categoryId': categoryId,
        'orgUnitId': orgUnitId,
        'scope': scope,
        'sort': sort,
        'building': building,
      },
    );
    return ItemsListResponse.fromJson(json);
  }

  /// The newest registrations in the register, as full item rows.
  ///
  /// This deliberately asks `GET /items` rather than `GET /items/recent`: the
  /// dashboard renders the same `ItemCard` as the register, and `/recent` answers
  /// with a lean row (id, name, tag, date) that has no condition, location or
  /// category. Feeding that into `Item.fromJson` is what produced the type error
  /// a Staff account saw on a physical phone — the endpoint is an array, and the
  /// card needs a record.
  Future<ItemsListResponse> recent({int limit = 5, String? scope}) =>
      list(limit: limit, scope: scope);

  /// What the signed-in person holds — the dashboard's "My holdings".
  ///
  /// `?scope=mine` is the same narrowing the register screen uses, and it
  /// includes the states an item can be in while it is in someone's hands
  /// (`ACTIVE`, `PENDING_CLAIM`, `LOANED`), so an item waiting for a confirmation
  /// appears here rather than only in the register.
  Future<ItemsListResponse> heldByMe({int limit = 3}) => list(limit: limit, scope: 'mine');

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

  /// `POST /items/:id/void` — voids an item (Property Officer).
  ///
  /// The old method here was `DELETE /items/:id`, copied from a version of the
  /// spec where an item could be destroyed. **The server has never had that
  /// route**: an item is voided (a status change, `VOIDED`, with a reason and
  /// an audit trail), never deleted — the whole point of the `CustodyEvent`
  /// log is that the history survives. The call would have answered 404, and
  /// because nothing in the app called it, nothing noticed.
  ///
  /// The API contract check (`scripts/check-api-contract.mjs`) is what found
  /// it: it compares every client call with every server route.
  Future<Map<String, dynamic>> voidItem(String id, String reason) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(id)}/void',
      body: {'reason': reason},
    );
    return json;
  }

  /// `POST /items/:id/claim` — claim a PENDING_CLAIM item. Returns the updated item.
  Future<Item> claim(String id) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(id)}/claim',
      body: {},
    );
    return Item.fromJson(json);
  }

  /// `POST /items/:id/refuse-claim` — refuse a PENDING_CLAIM item, reverting to
  /// the college pool.
  ///
  /// The server takes [reason] from a fixed set (`NEVER_RECEIVED`, `WRONG_ITEM`,
  /// `CONDITION_MISMATCH`, `OTHER`) plus optional [otherReason] free text. A
  /// sentence in `reason` is a 400 — see workflow-completeness-spec §6.
  Future<Item> refuseClaim(String id, {required String reason, String? otherReason}) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/items/${Uri.encodeComponent(id)}/refuse-claim',
      body: {
        'reason': reason,
        if (otherReason != null && otherReason.isNotEmpty) 'otherReason': otherReason,
      },
    );
    return Item.fromJson(json);
  }
}
