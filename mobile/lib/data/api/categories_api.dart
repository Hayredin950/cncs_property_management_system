import '../../core/api/api_client.dart';
import '../../models/category.dart';
import '../../models/json.dart';

/// `frontend/src/api/categories.ts`.
class CategoriesApi {
  const CategoriesApi(this._client);

  final ApiClient _client;

  /// `GET /categories` — public; carries `itemCount`, which the admin screen
  /// shows and the delete endpoint checks before refusing.
  Future<List<Category>> list() async {
    final json = await _client.get<List<dynamic>>('/categories');
    return [
      for (final row in json)
        if (row is Map) Category.fromJson(Map<String, dynamic>.from(row)),
    ];
  }

  /// `POST /categories` — Admin only; a duplicate name answers 409.
  Future<Category> create(String name) async {
    final json = await _client.post<Map<String, dynamic>>(
      '/categories',
      body: {'name': name},
    );
    return Category.fromJson(json);
  }

  /// `PUT /categories/:id` — Admin only; rename. A duplicate name answers 409.
  Future<Category> update(String id, String name) async {
    final json = await _client.put<Map<String, dynamic>>(
      '/categories/${Uri.encodeComponent(id)}',
      body: {'name': name},
    );
    return Category.fromJson(json);
  }

  /// `DELETE /categories/:id` — Admin only, and refused while items still
  /// reference it (409). Removing a populated category would mean destroying or
  /// orphaning its items, which F7.2 forbids.
  Future<void> delete(String id) =>
      _client.delete<void>('/categories/${Uri.encodeComponent(id)}');

  /// Departments actually in use, derived client-side from `GET /items`.
  ///
  /// The audit's scope value is matched against `Item.department` **exactly and
  /// case-sensitively**, so a free-text or hardcoded list would let a typo start
  /// an audit that can never complete (gap G9). The web app's locked picker does
  /// the same thing: list the departments observed on real rows, and disable
  /// "Start" when that list is empty rather than guessing.
  Future<List<String>> observedDepartments({int sampleSize = 100}) async {
    final json = await _client.get<Map<String, dynamic>>(
      '/items',
      query: {'page': 1, 'limit': sampleSize},
    );
    final rows = asMapList(json['data']);
    final seen = <String>{};
    for (final row in rows) {
      final department = asString(row['department']).trim();
      if (department.isNotEmpty) seen.add(department);
    }
    final sorted = seen.toList()..sort();
    return sorted;
  }
}
