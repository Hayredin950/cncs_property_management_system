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

class ApprovalsListNotifier extends AsyncNotifier<List<UserSummary>> {
  @override
  Future<List<UserSummary>> build() => ref.watch(usersApiProvider).listApprovals();
}

/// `GET /users/approvals` — the System Admin's decision queue.
final approvalsProvider =
    AsyncNotifierProvider<ApprovalsListNotifier, List<UserSummary>>(ApprovalsListNotifier.new);

/// `GET /departments/invitable` — the unit picker on the invite form (T6).
///
/// A plain `FutureProvider`: the college's departments change rarely, and every
/// consumer wants all of them.
final invitableUnitsProvider = FutureProvider<List<InvitableUnit>>((ref) {
  return ref.watch(usersApiProvider).invitableUnits();
});

/// Admin-only account mutations. Every one of these is **Admin only**, enforced
/// server-side; this class does not check the role, because a client-side role
/// check is theatre — the screen's job is simply not to *offer* the action to a
/// staff session (§9.1's "absent from the DOM, never merely disabled").
class UserActions {
  const UserActions(this._ref);

  final Ref _ref;

  /// `POST /users/invite` — the privileged invite (T6), which replaced
  /// `POST /auth/register` on 14 Oct. There is no password parameter, and that is
  /// the requirement rather than an omission: only the invitee ever sets one.
  ///
  /// A refusal the server raises (an email that already has an account, a
  /// department that already has a head, an address inviting itself) is a field or
  /// form-level failure the caller shows inline — the same rule the categories
  /// screen follows for a duplicate name.
  Future<InviteResult> invite({
    required String email,
    required String role,
    String? unitId,
    required String authorizedBy,
    required String authorizationRef,
    String? authorizationNote,
  }) async {
    final result = await _ref.read(usersApiProvider).invite(
          email: email,
          role: role,
          unitId: unitId,
          authorizedBy: authorizedBy,
          authorizationRef: authorizationRef,
          authorizationNote: authorizationNote,
        );
    _ref.invalidate(usersProvider);
    return result;
  }

  /// `PATCH /users/:id` — correct a name or email. A taken email is a `409` again.
  Future<UserSummary> update(String id, {String? fullName, String? email}) async {
    final user = await _ref.read(usersApiProvider).update(id, fullName: fullName, email: email);
    _ref.invalidate(usersProvider);
    return user;
  }

  /// `POST /users/:id/promote` — set the account's role (any of the five, spec
  /// 2.1). One operation rather than promote/demote pairs.
  Future<UserSummary> promote(String id, String role) async {
    final user = await _ref.read(usersApiProvider).promote(id, role);
    _ref.invalidate(usersProvider);
    return user;
  }

  /// `POST /users/:id/approve` — let a requested account sign in, optionally as the
  /// role the approver assigns. Both lists the queue lives on are invalidated.
  Future<UserSummary> approve(String id, {String? role}) async {
    final user = await _ref.read(usersApiProvider).approve(id, role: role);
    _ref.invalidate(usersProvider);
    _ref.invalidate(approvalsProvider);
    return user;
  }

  /// `POST /users/:id/reject` — decline the request. The row stays, as `REJECTED`.
  Future<UserSummary> reject(String id, String reason) async {
    final user = await _ref.read(usersApiProvider).reject(id, reason);
    _ref.invalidate(usersProvider);
    _ref.invalidate(approvalsProvider);
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
