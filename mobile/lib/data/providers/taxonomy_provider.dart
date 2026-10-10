import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/category.dart';
import '../../models/user.dart';
import 'core_providers.dart';

/// The three small taxonomies every form needs: categories, departments, accounts.

/// `GET /categories`. A plain `FutureProvider` — the list is short, changes
/// rarely, and every consumer wants all of it.
final categoriesProvider = FutureProvider<List<Category>>((ref) {
  return ref.watch(categoriesApiProvider).list();
});

/// The departments **actually observed** on active items.
///
/// This exists because there is no `GET /departments` endpoint (gap G9) —
/// `department` is a free-text column, so "the list of departments" is a question
/// only the data can answer. Two modes consume it, and the distinction matters
/// (§8 `DepartmentPicker`):
///
///   * the item form treats it as a *suggestion* and still accepts a new value,
///     because registration must be able to invent a department;
///   * the audit's scope picker treats it as *locked*, because completion matches
///     `Item.department` exactly and case-sensitively — a typo there starts an
///     audit that can never be completed.
final observedDepartmentsProvider = FutureProvider<List<String>>((ref) {
  return ref.watch(categoriesApiProvider).observedDepartments();
});

class UserListNotifier extends AsyncNotifier<List<UserSummary>> {
  @override
  Future<List<UserSummary>> build() => ref.watch(usersApiProvider).list();
}

final usersProvider = AsyncNotifierProvider<UserListNotifier, List<UserSummary>>(
  UserListNotifier.new,
);

/// Admin-only account mutations. Every one of these is **Admin only**, enforced
/// server-side; this class does not check the role, because a client-side role
/// check is theatre — the screen's job is simply not to *offer* the action to a
/// staff session (§9.1's "absent from the DOM, never merely disabled").
class UserActions {
  const UserActions(this._ref);

  final Ref _ref;

  /// `POST /auth/register`. A duplicate email answers `409`, which the caller shows
  /// inline under the email field rather than as a toast: it is a field-level
  /// validation failure, not a system event.
  Future<AuthUser> create({
    required String fullName,
    required String email,
    required String password,
    required String role,
  }) async {
    final user = await _ref.read(authApiProvider).register(
          fullName: fullName,
          email: email,
          password: password,
          role: role,
        );
    _ref.invalidate(usersProvider);
    return user;
  }

  /// `PATCH /users/:id` — correct a name or email. A taken email is a `409` again.
  Future<UserSummary> update(String id, {String? fullName, String? email}) async {
    final user = await _ref.read(usersApiProvider).update(id, fullName: fullName, email: email);
    _ref.invalidate(usersProvider);
    return user;
  }

  /// `POST /users/:id/promote` — STAFF → ADMIN. There is deliberately **no demote**:
  /// the endpoint does not exist, so this screen states that limitation rather than
  /// shipping a control that implies it.
  Future<UserSummary> promote(String id) async {
    final user = await _ref.read(usersApiProvider).promote(id);
    _ref.invalidate(usersProvider);
    return user;
  }

  /// `POST /users/:id/reset-password`. Returns the new password once, for the admin
  /// to pass on out of band; the server sets `mustChangePassword` on the account so
  /// the next sign-in forces a change.
  ///
  /// The password is generated **here**, never on the server: the API takes the
  /// password the admin chose, and a server that invented one would have to return
  /// it — which is a secret crossing the wire for no reason.
  Future<String> resetPassword(String id) async {
    final password = _generatePassword();
    await _ref.read(usersApiProvider).resetPassword(id, password);
    _ref.invalidate(usersProvider);
    return password;
  }

  /// `DELETE /users/:id`. The server refuses when the account owns items (that is
  /// what `itemCount` in the list is for) and answers `409` with the reason, which
  /// the caller shows verbatim.
  Future<void> remove(String id) async {
    await _ref.read(usersApiProvider).delete(id);
    _ref.invalidate(usersProvider);
  }

  static String _generatePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    // `Random` is fine here and `Random.secure()` is not needed: this is a
    // hand-off password an admin reads aloud, not a secret the app must protect
    // from itself — the server's own strength check is the gate that matters.
    final random = math.Random.secure();
    return [
      for (var i = 0; i < 14; i++) alphabet[random.nextInt(alphabet.length)],
    ].join();
  }
}

final userActionsProvider = Provider<UserActions>(UserActions.new);
