import 'enums.dart';
import 'json.dart';

/// `frontend/src/types/item.ts`.
///
/// The important shape here is the **optional privileged block**. SDS 3.2 /
/// SRS 3.4 field filtering is enforced server-side by
/// `backend/src/utils/filterItemFields.ts`: a public or non-owner viewer never
/// receives `purchaseCost`, `currentValue`, `brand`, `model`, `serialNumber`,
/// `notes`, owner details, or `accessories`.
///
/// So [Item] models those as nullable and [isPrivileged] is the single test the
/// UI branches on. **This client never tries to re-implement the filter or infer
/// what was withheld** (frontend-plan.md §5) — it renders exactly the keys the
/// API sent, and a public viewer's page is visibly shorter by design.
class Item {
  const Item({
    required this.id,
    required this.tagId,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    required this.department,
    required this.building,
    required this.floor,
    required this.room,
    required this.condition,
    required this.status,
    required this.registeredAt,
    required this.isPrivileged,
    this.photoUrl,
    this.ownerId,
    this.ownerName,
    this.ownerEmail,
    this.purchaseCost,
    this.currentValue,
    this.brand,
    this.model,
    this.serialNumber,
    this.notes,
    this.accessories = const [],
    this.parentItemId,
    this.disposalReason,
    this.disposedAt,
    this.lastAuditedAt,
    this.rawConditionLabel,
    this.rawStatusLabel,
  });

  factory Item.fromJson(Map<String, dynamic> json) {
    final rawCondition = asString(json['condition']);
    final rawStatus = asString(json['status']);
    final condition = Condition.fromJson(rawCondition);
    final status = ItemStatus.fromJson(rawStatus);
    final owner = asMap(json['owner']);

    return Item(
      id: asString(json['id']),
      tagId: asString(json['tagId']),
      name: asString(json['name']),
      categoryId: asString(json['categoryId']),
      categoryName: asString(asMap(json['category'])['name'], fallback: 'Uncategorised'),
      department: asString(json['department']),
      building: asString(json['building']),
      floor: asString(json['floor']),
      room: asString(json['room']),
      condition: condition,
      status: status,
      registeredAt: asString(json['registeredAt']),
      photoUrl: asStringOrNull(json['photoUrl']),
      // Presence of the key, not its value, is what marks a privileged view —
      // `filterItemFields` omits the whole block rather than nulling each field.
      isPrivileged: json.containsKey('ownerId'),
      ownerId: asStringOrNull(json['ownerId']),
      ownerName: asStringOrNull(owner['fullName']),
      ownerEmail: asStringOrNull(owner['email']),
      purchaseCost: asDecimalString(json['purchaseCost']),
      currentValue: asDecimalString(json['currentValue']),
      brand: asStringOrNull(json['brand']),
      model: asStringOrNull(json['model']),
      serialNumber: asStringOrNull(json['serialNumber']),
      notes: asStringOrNull(json['notes']),
      accessories: [
        for (final row in asMapList(json['accessories'])) Item.fromJson(row),
      ],
      parentItemId: asStringOrNull(json['parentItemId']),
      disposalReason: asStringOrNull(json['disposalReason']),
      disposedAt: asStringOrNull(json['disposedAt']),
      lastAuditedAt: asStringOrNull(json['lastAuditedAt']),
      // Kept so a future enum member still displays as the server's own string
      // instead of "Unknown" — the same "render the raw value" rule as notifications.
      rawConditionLabel: condition == Condition.unknown ? rawCondition : null,
      rawStatusLabel: status == ItemStatus.unknown ? rawStatus : null,
    );
  }

  final String id;
  final String tagId;
  final String name;
  final String categoryId;
  final String categoryName;
  final String department;
  final String building;
  final String floor;
  final String room;
  final Condition condition;
  final ItemStatus status;
  final String registeredAt;
  final String? photoUrl;

  /// True once the privileged block is present — i.e. this viewer is the owner
  /// or Staff/Admin.
  final bool isPrivileged;

  final String? ownerId;
  final String? ownerName;
  final String? ownerEmail;

  /// Decimal-as-string, formatted at display time by `formatCurrencyEtb`.
  final String? purchaseCost;
  final String? currentValue;

  final String? brand;
  final String? model;
  final String? serialNumber;
  final String? notes;

  /// Full nested rows — only ever present alongside the rest of the block.
  final List<Item> accessories;

  final String? parentItemId;
  final String? disposalReason;
  final String? disposedAt;
  final String? lastAuditedAt;

  /// Non-null only when the server sent an enum member this build doesn't know.
  final String? rawConditionLabel;
  final String? rawStatusLabel;

  bool get isDisposed => status == ItemStatus.disposed;

  String get conditionLabel => rawConditionLabel ?? condition.label;
  String get statusLabel => rawStatusLabel ?? status.label;

  /// `"Computer Science · CNCS Building · Floor 3 · Room 312"` — the one-line
  /// location string the item cards and the public page both use. Empty parts
  /// are dropped rather than rendered as stray separators.
  String get locationLine {
    final parts = [department, building, floor, room]
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList();
    return parts.join(' · ');
  }
}

/// `GET /items` envelope.
class ItemsListResponse {
  const ItemsListResponse({required this.items, required this.pagination});

  factory ItemsListResponse.fromJson(Map<String, dynamic> json) =>
      ItemsListResponse(
        items: [for (final row in asMapList(json['data'])) Item.fromJson(row)],
        pagination: ItemsPagination.fromJson(asMap(json['pagination'])),
      );

  final List<Item> items;
  final ItemsPagination pagination;
}

class ItemsPagination {
  const ItemsPagination({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  factory ItemsPagination.fromJson(Map<String, dynamic> json) => ItemsPagination(
        page: asInt(json['page'], fallback: 1),
        limit: asInt(json['limit'], fallback: 20),
        total: asInt(json['total']),
        totalPages: asInt(json['totalPages'], fallback: 1),
      );

  final int page;
  final int limit;
  final int total;
  final int totalPages;
}

/// Body of `POST /items` — mirrors the backend's `createItemSchema`.
///
/// `parentItemId` is deliberately absent: the API rejects it with a 400 pointing
/// at the accessories endpoint, and bundling has exactly one writer
/// (`POST /items/:id/accessories`).
class CreateItemPayload {
  const CreateItemPayload({
    required this.name,
    required this.categoryId,
    required this.department,
    required this.building,
    required this.floor,
    required this.room,
    required this.ownerId,
    required this.purchaseCost,
    required this.condition,
    this.currentValue,
    this.brand,
    this.model,
    this.serialNumber,
    this.photoUrl,
    this.notes,
  });

  final String name;
  final String categoryId;
  final String department;
  final String building;
  final String floor;
  final String room;
  final String ownerId;
  final num purchaseCost;
  final Condition condition;
  final num? currentValue;
  final String? brand;
  final String? model;
  final String? serialNumber;
  final String? photoUrl;
  final String? notes;

  Map<String, dynamic> toJson() => {
        'name': name,
        'categoryId': categoryId,
        'department': department,
        'building': building,
        'floor': floor,
        'room': room,
        'ownerId': ownerId,
        'purchaseCost': purchaseCost,
        'condition': condition.wire,
        if (currentValue != null) 'currentValue': currentValue,
        if (brand != null && brand!.isNotEmpty) 'brand': brand,
        if (model != null && model!.isNotEmpty) 'model': model,
        if (serialNumber != null && serialNumber!.isNotEmpty) 'serialNumber': serialNumber,
        if (photoUrl != null && photoUrl!.isNotEmpty) 'photoUrl': photoUrl,
        if (notes != null && notes!.isNotEmpty) 'notes': notes,
      };
}
