import 'enums.dart';
import 'json.dart';

/// `frontend/src/types/request.ts`. The list and detail endpoints have
/// deliberately different item shapes, so they are two classes here rather than
/// one widened envelope.

class RequestItemSummary {
  const RequestItemSummary({
    required this.id,
    required this.tagId,
    required this.name,
    required this.status,
  });

  factory RequestItemSummary.fromJson(Map<String, dynamic> json) => RequestItemSummary(
        id: asString(json['id']),
        tagId: asString(json['tagId']),
        name: asString(json['name']),
        status: ItemStatus.fromJson(json['status']),
      );

  final String id;
  final String tagId;
  final String name;
  final ItemStatus status;

  bool get isDisposed => status == ItemStatus.disposed;
}

class RequestUserSummary {
  const RequestUserSummary({
    required this.id,
    required this.fullName,
    required this.email,
  });

  factory RequestUserSummary.fromJson(Map<String, dynamic> json) => RequestUserSummary(
        id: asString(json['id']),
        fullName: asString(json['fullName']),
        email: asString(json['email']),
      );

  final String id;
  final String fullName;
  final String email;
}

/// One row of `GET /requests` (`REQUEST_LIST_SELECT`).
class RequestSummary {
  const RequestSummary({
    required this.id,
    required this.type,
    required this.status,
    required this.reason,
    required this.createdAt,
    required this.requestedById,
    required this.item,
    required this.requestedBy,
    required this.rejectionReason,
    required this.decidedAt,
    required this.newLocationBuilding,
    required this.newLocationFloor,
    required this.newLocationRoom,
    required this.newOwnerId,
    required this.reviewedById,
  });

  factory RequestSummary.fromJson(Map<String, dynamic> json) => RequestSummary(
        id: asString(json['id']),
        type: RequestType.fromJson(json['type']),
        status: RequestStatus.fromJson(json['status']),
        reason: asString(json['reason']),
        createdAt: asString(json['createdAt']),
        requestedById: asString(json['requestedById']),
        item: RequestItemSummary.fromJson(asMap(json['item'])),
        requestedBy: RequestUserSummary.fromJson(asMap(json['requestedBy'])),
        // Nullable columns are genuinely nullable, never absent — Prisma returns
        // the key with `null`, which is why these are `String?` and not defaulted.
        rejectionReason: asStringOrNull(json['rejectionReason']),
        decidedAt: asStringOrNull(json['decidedAt']),
        newLocationBuilding: asStringOrNull(json['newLocationBuilding']),
        newLocationFloor: asStringOrNull(json['newLocationFloor']),
        newLocationRoom: asStringOrNull(json['newLocationRoom']),
        newOwnerId: asStringOrNull(json['newOwnerId']),
        reviewedById: asStringOrNull(json['reviewedById']),
      );

  final String id;
  final RequestType type;
  final RequestStatus status;
  final String reason;
  final String createdAt;
  final String requestedById;
  final RequestItemSummary item;
  final RequestUserSummary requestedBy;
  final String? rejectionReason;
  final String? decidedAt;
  final String? newLocationBuilding;
  final String? newLocationFloor;
  final String? newLocationRoom;
  final String? newOwnerId;
  final String? reviewedById;

  bool get isPending => status == RequestStatus.pending;

  /// `"Building A · Floor 2 · Room 101"` for a TRANSFER, or `null` when the
  /// request names no new location at all.
  String? get newLocationLine {
    final parts = [newLocationBuilding, newLocationFloor, newLocationRoom]
        .whereType<String>()
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList();
    return parts.isEmpty ? null : parts.join(' · ');
  }
}

/// The detail endpoint's richer item row (`REQUEST_DETAIL_SELECT`).
class RequestDetailItem extends RequestItemSummary {
  const RequestDetailItem({
    required super.id,
    required super.tagId,
    required super.name,
    required super.status,
    required this.department,
    required this.building,
    required this.floor,
    required this.room,
    required this.parentItemId,
  });

  factory RequestDetailItem.fromJson(Map<String, dynamic> json) => RequestDetailItem(
        id: asString(json['id']),
        tagId: asString(json['tagId']),
        name: asString(json['name']),
        status: ItemStatus.fromJson(json['status']),
        department: asString(json['department']),
        building: asString(json['building']),
        floor: asString(json['floor']),
        room: asString(json['room']),
        parentItemId: asStringOrNull(json['parentItemId']),
      );

  final String department;
  final String building;
  final String floor;
  final String room;
  final String? parentItemId;

  String get locationLine {
    final parts = [department, building, floor, room]
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty);
    return parts.join(' · ');
  }
}

/// `GET /requests/:id`.
class RequestDetail {
  const RequestDetail({
    required this.summary,
    required this.item,
    required this.reviewedBy,
  });

  factory RequestDetail.fromJson(Map<String, dynamic> json) => RequestDetail(
        summary: RequestSummary.fromJson(json),
        item: RequestDetailItem.fromJson(asMap(json['item'])),
        reviewedBy: json['reviewedBy'] == null
            ? null
            : RequestUserSummary.fromJson(asMap(json['reviewedBy'])),
      );

  final RequestSummary summary;
  final RequestDetailItem item;
  final RequestUserSummary? reviewedBy;
}

/// `GET /requests` — a bare `total`/`limit`/`offset` envelope, deliberately not
/// the `pagination` object `GET /items` returns (a real inconsistency in the
/// built API, so each response is modelled on its own).
class RequestsListResponse {
  const RequestsListResponse({
    required this.requests,
    required this.total,
    required this.limit,
    required this.offset,
  });

  factory RequestsListResponse.fromJson(Map<String, dynamic> json) => RequestsListResponse(
        requests: [for (final row in asMapList(json['requests'])) RequestSummary.fromJson(row)],
        total: asInt(json['total']),
        limit: asInt(json['limit'], fallback: 20),
        offset: asInt(json['offset']),
      );

  final List<RequestSummary> requests;
  final int total;
  final int limit;
  final int offset;
}

/// Body of `POST /requests`. A TRANSFER names a location and/or owner; a
/// DISPOSAL names neither (the server 400s otherwise).
class CreateRequestPayload {
  const CreateRequestPayload({
    required this.type,
    required this.itemId,
    required this.reason,
    this.newLocationBuilding,
    this.newLocationFloor,
    this.newLocationRoom,
    this.newOwnerId,
  });

  final RequestType type;
  final String itemId;
  final String reason;
  final String? newLocationBuilding;
  final String? newLocationFloor;
  final String? newLocationRoom;
  final String? newOwnerId;

  Map<String, dynamic> toJson() => {
        'type': type.wire,
        'itemId': itemId,
        'reason': reason,
        if (newLocationBuilding != null && newLocationBuilding!.isNotEmpty)
          'newLocationBuilding': newLocationBuilding,
        if (newLocationFloor != null && newLocationFloor!.isNotEmpty)
          'newLocationFloor': newLocationFloor,
        if (newLocationRoom != null && newLocationRoom!.isNotEmpty)
          'newLocationRoom': newLocationRoom,
        if (newOwnerId != null && newOwnerId!.isNotEmpty) 'newOwnerId': newOwnerId,
      };
}

/// `POST /requests/:id/approve|reject` — carries the applied item changes and
/// cascade info so the UI can state what actually happened. `itemChanges` is
/// server-shaped; the UI shows a count, never a re-interpretation of the diff.
class DecideRequestResponse {
  const DecideRequestResponse({
    required this.status,
    required this.itemTagId,
    required this.itemName,
    required this.notificationMessage,
    required this.cascadedItemIds,
    required this.editLogRowCount,
    required this.itemChanges,
  });

  factory DecideRequestResponse.fromJson(Map<String, dynamic> json) {
    final request = asMap(json['request']);
    final item = asMap(request['item']);
    final notification = asMap(json['notification']);
    final cascaded = json['cascadedItemIds'];

    return DecideRequestResponse(
      status: RequestStatus.fromJson(request['status']),
      itemTagId: asString(item['tagId']),
      itemName: asString(item['name']),
      notificationMessage: asString(notification['message']),
      cascadedItemIds: [
        if (cascaded is List)
          for (final id in cascaded)
            if (id != null) '$id',
      ],
      editLogRowCount: asInt(json['editLogRowCount']),
      itemChanges: asMap(json['itemChanges']),
    );
  }

  final RequestStatus status;
  final String itemTagId;
  final String itemName;
  final String notificationMessage;
  final List<String> cascadedItemIds;
  final int editLogRowCount;
  final Map<String, dynamic> itemChanges;
}
