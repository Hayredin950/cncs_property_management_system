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


/// `GET /departments/admin` — one unit as an administrator sees it: whether it
/// takes online account requests, who heads it, and how many staff it holds.
///
/// The public `/departments` list is the self-registration subset; this is the
/// whole set, including the vacant units that need a head.
class AdminDepartment {
  const AdminDepartment({
    required this.id,
    required this.name,
    required this.code,
    required this.type,
    required this.isActive,
    required this.acceptsSelfReg,
    required this.staffCount,
    this.college,
    this.headName,
    this.headEmail,
  });

  factory AdminDepartment.fromJson(Map<String, dynamic> json) {
    final head = asMap(json['head']);
    return AdminDepartment(
      id: asString(json['id']),
      name: asString(json['name']),
      code: asString(json['code']),
      type: asString(json['type']),
      isActive: asBool(json['isActive'], fallback: true),
      acceptsSelfReg: asBool(json['acceptsSelfReg']),
      staffCount: asInt(json['staffCount']),
      college: asStringOrNull(json['college']),
      headName: asStringOrNull(head['fullName']),
      headEmail: asStringOrNull(head['email']),
    );
  }

  final String id;
  final String name;
  final String code;
  final String type;
  final bool isActive;
  final bool acceptsSelfReg;
  final int staffCount;
  final String? college;
  final String? headName;
  final String? headEmail;

  bool get isDepartment => type == 'DEPARTMENT';
  bool get hasHead => headName != null;
}
