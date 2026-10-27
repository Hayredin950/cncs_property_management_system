import 'json.dart';

/// `GET /buildings` — a physical building, by id.
///
/// The ids matter: `POST /items` and `PUT /items/:id` take `buildingId`, and the
/// register filters on it. The phone used to send the building's *name*, which the
/// server's schema silently dropped, so registration failed with "Building is
/// required" on a form that had a building filled in.
class Building {
  const Building({
    required this.id,
    required this.name,
    required this.code,
    required this.itemCount,
    this.address,
    this.description,
  });

  factory Building.fromJson(Map<String, dynamic> json) => Building(
    id: asString(json['id']),
    name: asString(json['name']),
    code: asString(json['code']),
    itemCount: asInt(json['itemCount']),
    address: asStringOrNull(json['address']),
    description: asStringOrNull(json['description']),
  );

  final String id;
  final String name;
  final String code;
  final int itemCount;

  /// Optional on the wire: the schema requires a name and a code, and the
  /// screen's form treats these two as notes rather than fields it blocks on.
  final String? address;
  final String? description;
}
