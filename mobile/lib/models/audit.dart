import 'enums.dart';
import 'item.dart';
import 'json.dart';

/// `frontend/src/types/audit.ts`.
///
/// Gap G1 is closed in both directions: `GET /audits` lists sessions and
/// `GET /audits/:id` reads one back with its stored rows. Two facts drive the
/// screens:
///
///   * `GET /audits` carries **counts only** — the per-item breakdown (tag, name,
///     room, result) exists solely on `GET /audits/:id`, which is also what the
///     report and the CSV read.
///   * A client can never supply a result. `POST /audits/:id/scan` always stores
///     `FOUND`; the final classification is computed at completion by re-running
///     the scope filter and comparing it with the stored scans.

class AuditUserSummary {
  const AuditUserSummary({required this.id, required this.fullName, required this.email});

  factory AuditUserSummary.fromJson(Map<String, dynamic> json) => AuditUserSummary(
        id: asString(json['id']),
        fullName: asString(json['fullName']),
        email: asString(json['email']),
      );

  final String id;
  final String fullName;
  final String email;
}

/// `POST /audits` 201 response.
///
/// `scopeType` stays a plain string because the API accepts any non-empty value —
/// only `DEPARTMENT` can actually be *completed* (completion 400s otherwise),
/// which is why the new-audit screen offers department scope alone.
class AuditSession {
  const AuditSession({
    required this.id,
    required this.scopeType,
    required this.scopeValue,
    required this.runById,
    required this.startedAt,
    required this.completedAt,
    required this.runBy,
  });

  factory AuditSession.fromJson(Map<String, dynamic> json) => AuditSession(
        id: asString(json['id']),
        scopeType: asString(json['scopeType']),
        scopeValue: asStringOrNull(json['scopeValue']),
        runById: asString(json['runById']),
        startedAt: asString(json['startedAt']),
        completedAt: asStringOrNull(json['completedAt']),
        runBy: AuditUserSummary.fromJson(asMap(json['runBy'])),
      );

  final String id;
  final String scopeType;
  final String? scopeValue;
  final String runById;
  final String startedAt;
  final String? completedAt;
  final AuditUserSummary runBy;
}

/// The three counts every audit response carries.
class AuditCounts {
  const AuditCounts({required this.found, required this.missing, required this.locationMismatch});

  factory AuditCounts.fromJson(Map<String, dynamic> json) => AuditCounts(
        found: asInt(json['found']),
        missing: asInt(json['missing']),
        locationMismatch: asInt(json['locationMismatch']),
      );

  static const AuditCounts empty = AuditCounts(found: 0, missing: 0, locationMismatch: 0);

  final int found;
  final int missing;
  final int locationMismatch;

  int get total => found + missing + locationMismatch;
}

/// `POST /audits/:id/scan` 201 — the persisted row plus its item.
class AuditScanRow {
  const AuditScanRow({
    required this.id,
    required this.auditSessionId,
    required this.itemId,
    required this.result,
    required this.scannedAt,
    required this.item,
  });

  factory AuditScanRow.fromJson(Map<String, dynamic> json) => AuditScanRow(
        id: asString(json['id']),
        auditSessionId: asString(json['auditSessionId']),
        itemId: asString(json['itemId']),
        result: AuditItemResult.fromJson(json['result']),
        scannedAt: asStringOrNull(json['scannedAt']),
        item: Item.fromJson(asMap(json['item'])),
      );

  final String id;
  final String auditSessionId;
  final String itemId;
  final AuditItemResult result;
  final String? scannedAt;
  final Item item;
}

/// One stored result row, as `GET /audits/:id` includes it — the only source of
/// the breakdown's item detail.
class AuditResultRow {
  const AuditResultRow({
    required this.itemId,
    required this.result,
    required this.scannedAt,
    required this.tagId,
    required this.name,
    required this.department,
    required this.building,
    required this.floor,
    required this.room,
  });

  factory AuditResultRow.fromJson(Map<String, dynamic> json) {
    final item = asMap(json['item']);
    return AuditResultRow(
      itemId: asString(json['itemId']),
      result: AuditItemResult.fromJson(json['result']),
      scannedAt: asStringOrNull(json['scannedAt']),
      tagId: asString(item['tagId']),
      name: asString(item['name']),
      department: asString(item['department']),
      building: asString(item['building']),
      floor: asString(item['floor']),
      room: asString(item['room']),
    );
  }

  final String itemId;
  final AuditItemResult result;
  final String? scannedAt;
  final String tagId;
  final String name;
  final String department;
  final String building;
  final String floor;
  final String room;

  String get locationLine {
    final parts = [department, building, floor, room]
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty);
    return parts.join(' · ');
  }
}

/// One row of `GET /audits`. `completed` is explicit rather than implied by the
/// timestamp's presence, so no caller has to know that convention.
class AuditSessionSummary {
  const AuditSessionSummary({
    required this.id,
    required this.scopeType,
    required this.scopeValue,
    required this.runById,
    required this.startedAt,
    required this.completedAt,
    required this.completed,
    required this.counts,
    required this.runBy,
  });

  factory AuditSessionSummary.fromJson(Map<String, dynamic> json) => AuditSessionSummary(
        id: asString(json['id']),
        scopeType: asString(json['scopeType']),
        scopeValue: asStringOrNull(json['scopeValue']),
        runById: asString(json['runById']),
        startedAt: asString(json['startedAt']),
        completedAt: asStringOrNull(json['completedAt']),
        completed: asBool(json['completed']),
        counts: AuditCounts.fromJson(asMap(json['counts'])),
        runBy: AuditUserSummary.fromJson(asMap(json['runBy'])),
      );

  final String id;
  final String scopeType;
  final String? scopeValue;
  final String runById;
  final String startedAt;
  final String? completedAt;
  final bool completed;
  final AuditCounts counts;
  final AuditUserSummary runBy;
}

class AuditListResponse {
  const AuditListResponse({
    required this.audits,
    required this.total,
    required this.limit,
    required this.offset,
  });

  factory AuditListResponse.fromJson(Map<String, dynamic> json) => AuditListResponse(
        audits: [
          for (final row in asMapList(json['audits'])) AuditSessionSummary.fromJson(row),
        ],
        total: asInt(json['total']),
        limit: asInt(json['limit'], fallback: 20),
        offset: asInt(json['offset']),
      );

  final List<AuditSessionSummary> audits;
  final int total;
  final int limit;
  final int offset;
}

/// `GET /audits/:id` — the read-back that lets a report survive a reload instead
/// of living only in navigation state.
class AuditSessionReadback {
  const AuditSessionReadback({
    required this.id,
    required this.scopeType,
    required this.scopeValue,
    required this.startedAt,
    required this.completedAt,
    required this.completed,
    required this.counts,
    required this.rows,
  });

  factory AuditSessionReadback.fromJson(Map<String, dynamic> json) => AuditSessionReadback(
        id: asString(json['id']),
        scopeType: asString(json['scopeType']),
        scopeValue: asStringOrNull(json['scopeValue']),
        startedAt: asString(json['startedAt']),
        completedAt: asStringOrNull(json['completedAt']),
        completed: asBool(json['completed']),
        counts: AuditCounts.fromJson(asMap(json['counts'])),
        rows: [for (final row in asMapList(json['rows'])) AuditResultRow.fromJson(row)],
      );

  final String id;
  final String scopeType;
  final String? scopeValue;
  final String startedAt;
  final String? completedAt;
  final bool completed;
  final AuditCounts counts;
  final List<AuditResultRow> rows;

  /// The rows grouped by result, in the design system's fixed order
  /// (`found`, then `missing`, then `wrong location`) so the report reads the
  /// same way every time.
  Map<AuditItemResult, List<AuditResultRow>> get rowsByResult {
    final grouped = <AuditItemResult, List<AuditResultRow>>{};
    for (final row in rows) {
      grouped.putIfAbsent(row.result, () => []).add(row);
    }
    return grouped;
  }
}

/// `POST /audits/:id/complete` — the summary, plus the item-id lists (which carry
/// no detail, which is exactly why the breakdown comes from `GET /audits/:id`).
class AuditCompletionResponse {
  const AuditCompletionResponse({
    required this.auditSessionId,
    required this.completedAt,
    required this.counts,
  });

  factory AuditCompletionResponse.fromJson(Map<String, dynamic> json) => AuditCompletionResponse(
        auditSessionId: asString(json['auditSessionId']),
        completedAt: asString(json['completedAt']),
        counts: AuditCounts.fromJson(asMap(json['counts'])),
      );

  final String auditSessionId;
  final String completedAt;
  final AuditCounts counts;
}

/// What the scan walkthrough keeps **on this device** for the running session.
///
/// The server stores scan rows but exposes no scan listing, so this local list is
/// the only view of "what have I scanned so far" — the web app persists its
/// equivalent to `sessionStorage` so a phone reload mid-walkthrough doesn't lose
/// the count.
class ScannedAuditItem {
  const ScannedAuditItem({
    required this.itemId,
    required this.tagId,
    required this.name,
    required this.room,
    required this.scannedAt,
  });

  factory ScannedAuditItem.fromJson(Map<String, dynamic> json) => ScannedAuditItem(
        itemId: asString(json['itemId']),
        tagId: asString(json['tagId']),
        name: asString(json['name']),
        room: asString(json['room']),
        scannedAt: asString(json['scannedAt']),
      );

  final String itemId;
  final String tagId;
  final String name;
  final String room;
  final String scannedAt;

  Map<String, dynamic> toJson() => {
        'itemId': itemId,
        'tagId': tagId,
        'name': name,
        'room': room,
        'scannedAt': scannedAt,
      };
}
