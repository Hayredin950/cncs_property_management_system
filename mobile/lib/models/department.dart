import 'json.dart';

/// `GET /departments` — a real department (an `OrgUnit` of type `DEPARTMENT`).
///
/// This is **not** the free-text `Item.department` column. The item column is
/// whatever was typed when the item was registered (and the live seed leaves it
/// empty), so a picker built from it is either empty or a list of near-duplicate
/// spellings. The register filters by `orgUnitId`, which points at one of these
/// rows — the same choice the web filter makes (`frontend/src/api/departments.ts`).
class Department {
  const Department({required this.id, required this.name, required this.code});

  factory Department.fromJson(Map<String, dynamic> json) => Department(
    id: asString(json['id']),
    name: asString(json['name']),
    code: asStringOrNull(json['code']),
  );

  final String id;
  final String name;

  /// The short code the college uses (`CS`, `PHYS`). Nullable: the code column is
  /// not required on every unit, and a filter row does not need it.
  final String? code;
}
