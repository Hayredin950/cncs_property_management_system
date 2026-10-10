import 'json.dart';

/// `GET /categories` — `frontend/src/types/category.ts`.
class Category {
  const Category({required this.id, required this.name, required this.itemCount});

  factory Category.fromJson(Map<String, dynamic> json) => Category(
        id: asString(json['id']),
        name: asString(json['name']),
        itemCount: asInt(json['itemCount']),
      );

  final String id;
  final String name;

  /// How many items are filed here. Always present; the admin screen shows it and
  /// links through to the filtered register, and it is what the delete endpoint
  /// checks before refusing.
  final int itemCount;
}
