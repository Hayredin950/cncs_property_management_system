/// Fixtures shaped exactly like the backend's responses — the same discipline the web
/// suite follows in `frontend/src/test/fixtures.ts`.
///
/// Every one is copied from a real response body shape rather than invented, because a
/// fixture that is *close* to the API is worse than no fixture: it lets a screen pass
/// its tests while failing against the server.
library;

Map<String, Object?> userJson({
  String id = 'user-1',
  String fullName = 'Selam Bekele',
  String email = 'selam@aau.edu.et',
  String role = 'STAFF',
  bool mustChangePassword = false,
}) =>
    {
      'id': id,
      'fullName': fullName,
      'email': email,
      'role': role,
      'createdAt': '2026-09-01T08:00:00.000Z',
      'mustChangePassword': mustChangePassword,
    };

/// A **staff/admin** item: the privileged block is present, which is exactly what
/// `filterItemFields` controls and what `Item.isPrivileged` keys off.
Map<String, Object?> itemJson({
  String id = 'item-1',
  String tagId = 'CNCS-DEMO-0001',
  String name = 'Dell Latitude 5420',
  String status = 'ACTIVE',
  String condition = 'GOOD',
  String? photoUrl,
  bool privileged = true,
  List<Map<String, Object?>> accessories = const [],
}) =>
    {
      'id': id,
      'tagId': tagId,
      'name': name,
      'categoryId': 'cat-1',
      'category': {'id': 'cat-1', 'name': 'Computer equipment'},
      'department': 'Computer Science',
      'building': 'CNCS Building',
      'floor': 'Floor 3',
      'room': 'Room 312',
      'condition': condition,
      'status': status,
      'registeredAt': '2026-09-05T10:15:00.000Z',
      'photoUrl': photoUrl,
      if (privileged) ...{
        'ownerId': 'user-1',
        'owner': {'id': 'user-1', 'fullName': 'Selam Bekele', 'email': 'selam@aau.edu.et'},
        'purchaseCost': '45000',
        'currentValue': '41000',
        'brand': 'Dell',
        'model': 'Latitude 5420',
        'serialNumber': 'SN-1234',
        'notes': 'Kept in the lab cabinet.',
        'accessories': accessories,
        'parentItemId': null,
        'disposalReason': null,
        'disposedAt': null,
      },
    };

/// The **public** shape of the same item: no owner, no money, no specs, no notes, no
/// accessories — because the server omits the whole privileged block rather than
/// nulling each field.
Map<String, Object?> publicItemJson({
  String tagId = 'CNCS-DEMO-0001',
  String name = 'Dell Latitude 5420',
}) =>
    itemJson(tagId: tagId, name: name, privileged: false);

Map<String, Object?> itemsListJson({
  List<Map<String, Object?>>? items,
  int total = 1,
  int page = 1,
  int totalPages = 1,
}) =>
    {
      'data': items ?? [itemJson()],
      'pagination': {'page': page, 'limit': 20, 'total': total, 'totalPages': totalPages},
    };

Map<String, Object?> requestJson({
  String id = 'req-1',
  String type = 'TRANSFER',
  String status = 'PENDING',
  String requestedById = 'user-2',
  String itemId = 'item-1',
  String itemTagId = 'CNCS-DEMO-0001',
}) =>
    {
      'id': id,
      'type': type,
      'status': status,
      'reason': 'Reassigned to the new lab technician.',
      'createdAt': '2026-10-01T09:00:00.000Z',
      'requestedById': requestedById,
      'item': {'id': itemId, 'tagId': itemTagId, 'name': 'Dell Latitude 5420', 'status': 'ACTIVE'},
      'requestedBy': {
        'id': requestedById,
        'fullName': 'Abebe Tesfaye',
        'email': 'abebe@aau.edu.et',
      },
      'rejectionReason': null,
      'decidedAt': null,
      'newLocationBuilding': 'CNCS Building',
      'newLocationFloor': 'Floor 1',
      'newLocationRoom': 'Room 104',
      'newOwnerId': null,
      'reviewedById': null,
    };

Map<String, Object?> notificationJson({
  String id = 'notif-1',
  String? code = 'REQUEST_SUBMITTED',
  String message = 'A transfer request was filed for CNCS-DEMO-0001.',
  bool isRead = false,
  String? relatedRequestId = 'req-1',
  String createdAt = '2026-10-06T12:00:00.000Z',
}) =>
    {
      'id': id,
      'code': code,
      'message': message,
      'relatedRequestId': relatedRequestId,
      'isRead': isRead,
      'createdAt': createdAt,
    };

Map<String, Object?> auditSessionJson({
  String id = 'audit-1',
  String scopeValue = 'Computer Science',
  bool completed = false,
  int found = 0,
  int missing = 0,
  int locationMismatch = 0,
}) =>
    {
      'id': id,
      'scopeType': 'DEPARTMENT',
      'scopeValue': scopeValue,
      'runById': 'user-1',
      'startedAt': '2026-10-01T08:00:00.000Z',
      'completedAt': completed ? '2026-10-01T11:30:00.000Z' : null,
      'completed': completed,
      'counts': {'found': found, 'missing': missing, 'locationMismatch': locationMismatch},
      'runBy': {'id': 'user-1', 'fullName': 'Selam Bekele', 'email': 'selam@aau.edu.et'},
    };
