import 'json.dart';

/// `GET /items/:id/history` — `frontend/src/types/history.ts`.
///
/// Rows written by one approval share an **exact** `editedAt`. `ItemEditLog` has
/// no `requestId` column, so that timestamp is the correlation key: the history UI
/// groups by it to show one decision — cascaded accessories included — as one
/// event rather than five unrelated field edits (frontend-plan.md §7).
class EditLogEntry {
  const EditLogEntry({
    required this.id,
    required this.fieldChanged,
    required this.oldValue,
    required this.newValue,
    required this.editedAt,
    required this.editedById,
    required this.editedByName,
  });

  factory EditLogEntry.fromJson(Map<String, dynamic> json) {
    final editedBy = asMap(json['editedBy']);
    return EditLogEntry(
      id: asString(json['id']),
      fieldChanged: asString(json['fieldChanged']),
      oldValue: asStringOrNull(json['oldValue']),
      newValue: asStringOrNull(json['newValue']),
      editedAt: asString(json['editedAt']),
      editedById: asString(editedBy['id']),
      editedByName: asString(editedBy['fullName']),
    );
  }

  final String id;
  final String fieldChanged;
  final String? oldValue;
  final String? newValue;
  final String editedAt;
  final String editedById;
  final String editedByName;
}

/// One event: every log row sharing an `editedAt`, which is one approval or one
/// save. Built by [ItemsHistoryResponse.groupedByEdit].
class EditEvent {
  const EditEvent({required this.editedAt, required this.editedByName, required this.entries});

  final String editedAt;
  final String editedByName;
  final List<EditLogEntry> entries;

  /// Several cascaded rows in one event are labelled "3 fields" rather than
  /// pretending it was a single change.
  String get summary => entries.length == 1 ? '1 field' : '${entries.length} fields';
}

/// `GET /items/:id/history` envelope — a bare `total`/`limit`/`offset` again.
class ItemsHistoryResponse {
  const ItemsHistoryResponse({
    required this.itemId,
    required this.itemTagId,
    required this.itemName,
    required this.entries,
    required this.total,
  });

  factory ItemsHistoryResponse.fromJson(Map<String, dynamic> json) {
    final item = asMap(json['item']);
    return ItemsHistoryResponse(
      itemId: asString(item['id']),
      itemTagId: asString(item['tagId']),
      itemName: asString(item['name']),
      entries: [for (final row in asMapList(json['entries'])) EditLogEntry.fromJson(row)],
      total: asInt(json['total']),
    );
  }

  final String itemId;
  final String itemTagId;
  final String itemName;
  final List<EditLogEntry> entries;
  final int total;

  /// Groups the flat log into events, newest first (the API already sorts by
  /// `editedAt desc`, and this preserves that order rather than re-sorting).
  List<EditEvent> get groupedByEdit {
    final events = <EditEvent>[];
    for (final entry in entries) {
      if (events.isNotEmpty && events.last.editedAt == entry.editedAt) {
        events.last.entries.add(entry);
      } else {
        events.add(
          EditEvent(
            editedAt: entry.editedAt,
            editedByName: entry.editedByName,
            entries: [entry],
          ),
        );
      }
    }
    return events;
  }
}
