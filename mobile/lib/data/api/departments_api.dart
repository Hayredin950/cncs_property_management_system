import '../../core/api/api_client.dart';
import '../../models/department.dart';
import '../../models/json.dart';

/// `GET /departments` — the real departments (active `OrgUnit` rows of type
/// `DEPARTMENT` that accept self-registration).
///
/// The register's department filter needs **ids**, because it filters on
/// `Item.orgUnitId`. Building that picker from the items' free-text `department`
/// strings (what this app used to do) produced a list of spellings — and on the
/// live data, an empty one, because the seeded items leave that column null. A
/// filter that cannot be used is worse than no filter.
class DepartmentsApi {
  const DepartmentsApi(this._client);

  final ApiClient _client;

  Future<List<Department>> list() async {
    final json = await _client.get<List<dynamic>>('/departments');
    return [for (final row in asMapList(json)) Department.fromJson(row)];
  }

  /// `GET /departments/admin` — every unit, headless ones included.
  ///
  /// `SYSTEM_CONFIG`: the account role owns the college's shape, a Property
  /// Officer only picks from it.
  Future<List<AdminDepartment>> adminList() async {
    final json = await _client.get<List<dynamic>>('/departments/admin');
    return [for (final row in asMapList(json)) AdminDepartment.fromJson(row)];
  }

  /// `POST /departments` — add a department under the college.
  ///
  /// It is created with **no head**: a vacant head is a real state, and a
  /// request from that unit waits for a system administrator until one is
  /// appointed.
  Future<void> create({
    required String name,
    required String code,
    bool acceptsSelfReg = true,
  }) async {
    await _client.post<Map<String, dynamic>>(
      '/departments',
      body: {'name': name, 'code': code, 'acceptsSelfReg': acceptsSelfReg},
    );
  }

  /// `POST /users/org-units/:id/activate-head` — appoint a head.
  ///
  /// The server requires the person to **already** hold the Department Head
  /// role; appointing a Staff account is its 400. The picker therefore offers
  /// heads only, rather than a list the API will refuse.
  Future<void> activateHead({required String orgUnitId, required String newHeadId}) async {
    await _client.post<Map<String, dynamic>>(
      '/users/org-units/${Uri.encodeComponent(orgUnitId)}/activate-head',
      body: {'newHeadId': newHeadId},
    );
  }
}
