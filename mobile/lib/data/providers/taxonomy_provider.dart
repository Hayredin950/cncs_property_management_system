import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/building.dart';
import '../../models/category.dart';
import '../../models/department.dart';
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

/// `GET /departments` — the real departments, for the register's filter.
///
/// Deliberately a **different** provider from [observedDepartmentsProvider]. That
/// one answers "which spellings appear on the items I can see", which is the right
/// question for the audit picker (completion matches the text exactly) and the
/// wrong one for a register filter: the filter travels as `orgUnitId`, and on the
/// live data the free-text column is empty, so a picker built from it offers
/// nothing at all.
final departmentsProvider = FutureProvider<List<Department>>((ref) {
  return ref.watch(departmentsApiProvider).list();
});

/// `GET /buildings` — the college's buildings, with item counts.
///
/// Readable by anyone who may use the register (`ITEM_READ`) because the same
/// list is the register's building filter; writes still need `BUILDING_MANAGE`,
/// which is the Property Officer. `POST /items` takes `buildingId`; the register
/// still shows the name.
final buildingsProvider = FutureProvider<List<Building>>((ref) {
  return ref.watch(buildingsApiProvider).list();
});

/// The three writes on `/admin/buildings`, in one place.
///
/// A rename is visible on every item filed under the building (the register reads
/// the name through the relation, not a copy), so the list is invalidated too —
/// otherwise the register would keep showing the old spelling until its next
/// natural refresh.
class BuildingActions {
  const BuildingActions(this._ref);

  final Ref _ref;

  Future<void> create({
    required String name,
    required String code,
    String? address,
    String? description,
  }) async {
    await _ref.read(buildingsApiProvider).create(
      name: name,
      code: code,
      address: address,
      description: description,
    );
    _ref.invalidate(buildingsProvider);
  }

  Future<void> update(
    String id, {
    required String name,
    required String code,
    String? address,
    String? description,
  }) async {
    await _ref.read(buildingsApiProvider).update(
      id,
      name: name,
      code: code,
      address: address,
      description: description,
    );
    _ref.invalidate(buildingsProvider);
  }

  Future<void> remove(String id) async {
    await _ref.read(buildingsApiProvider).delete(id);
    _ref.invalidate(buildingsProvider);
  }
}

final buildingActionsProvider = Provider<BuildingActions>(BuildingActions.new);

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
final approvalsProvider = AsyncNotifierProvider<ApprovalsListNotifier, List<UserSummary>>(
  ApprovalsListNotifier.new,
);

/// `GET /users/approvals?decided=true` — the requests already decided, newest
/// first.
///
/// The queue empties as the work gets done, so without this the only trace of a
/// decision is the notification that went out with it. A separate provider from
/// the queue because the two lists are fetched and refreshed independently: one
/// shrinks as the other grows.
class DecidedAccountsNotifier extends AsyncNotifier<List<UserSummary>> {
  @override
  Future<List<UserSummary>> build() => ref.watch(usersApiProvider).listDecided();
}

final decidedAccountsProvider =
    AsyncNotifierProvider<DecidedAccountsNotifier, List<UserSummary>>(
      DecidedAccountsNotifier.new,
    );

/// `GET /users/invites` — every invitation, and what became of it (T8).
class InvitesNotifier extends AsyncNotifier<List<InviteRow>> {
  @override
  Future<List<InviteRow>> build() => ref.watch(usersApiProvider).listInvites();
}

final invitesProvider = AsyncNotifierProvider<InvitesNotifier, List<InviteRow>>(
  InvitesNotifier.new,
);

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
    final result = await _ref
        .read(usersApiProvider)
        .invite(
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
    _ref.invalidate(decidedAccountsProvider);
    return user;
  }

  /// `POST /users/:id/reject` — decline the request. The row stays, as `REJECTED`.
  Future<UserSummary> reject(String id, String reason) async {
    final user = await _ref.read(usersApiProvider).reject(id, reason);
    _ref.invalidate(usersProvider);
    _ref.invalidate(approvalsProvider);
    _ref.invalidate(decidedAccountsProvider);
    return user;
  }

  /// `POST /auth/request-password-reset` — send the account holder a single-use
  /// link so **they** choose a new password.
  ///
  /// This replaces an administrator-typed reset: the API's `POST
  /// /users/:id/password` was removed by ruling C10 (no administrator ever sees
  /// or sets another person's password), and the phone kept calling it, so the
  /// menu item answered 404. The link goes to the address on the account, and
  /// the account's sessions are not touched until the link is used.
  Future<String> sendResetLink(String email) {
    return _ref.read(authApiProvider).requestPasswordReset(email);
  }

  /// `DELETE /users/:id`. The server refuses when the account owns items (that is
  /// what `itemCount` in the list is for) and answers `409` with the reason, which
  /// the caller shows verbatim.
  Future<void> remove(String id) async {
    await _ref.read(usersApiProvider).delete(id);
    _ref.invalidate(usersProvider);
  }

  /// `POST /users/:id/deactivate` — close an account that is part of the record.
  ///
  /// This is the action for an account that cannot be deleted because it owns
  /// items or decided requests: the row stays, the history stays, and the person
  /// simply cannot sign in. The reason is kept on the record, which is why it is
  /// required rather than a free-text afterthought.
  Future<String> deactivate(String id, String reason) async {
    final message = await _ref.read(usersApiProvider).deactivate(id, reason);
    _ref.invalidate(usersProvider);
    return message;
  }

  /// `POST /users/invites/:id/resend` — reissue an unaccepted invitation.
  Future<String> resendInvite(String id) async {
    final message = await _ref.read(usersApiProvider).resendInvite(id);
    _ref.invalidate(invitesProvider);
    return message;
  }

  /// `DELETE /users/invites/:id` — revoke a link that has not been accepted.
  Future<String> revokeInvite(String id) async {
    final message = await _ref.read(usersApiProvider).revokeInvite(id);
    _ref.invalidate(invitesProvider);
    _ref.invalidate(invitableUnitsProvider);
    return message;
  }
}

final userActionsProvider = Provider<UserActions>(UserActions.new);
