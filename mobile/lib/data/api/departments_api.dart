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
}
