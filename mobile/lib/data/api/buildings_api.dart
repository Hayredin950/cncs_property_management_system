import '../../core/api/api_client.dart';
import '../../models/building.dart';
import '../../models/json.dart';

/// `GET /buildings` — the college's buildings, with how many items each holds.
///
/// Property Officer only (`BUILDING_MANAGE`), which is the same role that may
/// register an item, so the form's picker has exactly the audience it needs. The
/// item's `building` column is a name for display; the write path takes this id.
class BuildingsApi {
  const BuildingsApi(this._client);

  final ApiClient _client;

  Future<List<Building>> list() async {
    // `query`, not a `?limit=` glued onto the path: the client sends query
    // parameters separately, and a path with a query string in it is a second
    // spelling the test harness and the logs have to learn.
    final json = await _client.get<Map<String, dynamic>>(
      '/buildings',
      query: {'limit': 100},
    );
    return [for (final row in asMapList(json['data'])) Building.fromJson(row)];
  }

  /// `POST /buildings` — add a building. The code is unique; a duplicate is the
  /// server's `409`, shown under the field rather than in a toast.
  Future<void> create({
    required String name,
    required String code,
    String? address,
    String? description,
  }) async {
    await _client.post<Map<String, dynamic>>(
      '/buildings',
      body: {
        'name': name,
        'code': code,
        if (address != null && address.isNotEmpty) 'address': address,
        if (description != null && description.isNotEmpty)
          'description': description,
      },
    );
  }

  /// `PUT /buildings/:id` — correct a name or code. Items point at the row by id,
  /// so a rename follows through to every item filed under it.
  Future<void> update(
    String id, {
    required String name,
    required String code,
    String? address,
    String? description,
  }) async {
    await _client.put<Map<String, dynamic>>(
      '/buildings/${Uri.encodeComponent(id)}',
      body: {
        'name': name,
        'code': code,
        'address': address ?? '',
        'description': description ?? '',
      },
    );
  }

  /// `DELETE /buildings/:id` — refused while the building holds items (the server
  /// answers `409`), because deleting it would orphan them.
  Future<void> delete(String id) =>
      _client.delete<void>('/buildings/${Uri.encodeComponent(id)}');
}
