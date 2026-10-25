import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/format.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/enums.dart';
import '../../models/user.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../../widgets/status_badges.dart';

/// `/admin/users` (§10.11) — a form plus a table of what already exists.
///
/// The design system's guidance for this screen was written when there was no
/// list/update/delete endpoint for users (gap G2) and said to state the limitation on
/// the page. The endpoints exist now, so this screen is the full management view.
///
/// A role change is its own action, never part of the name/email form: the five
/// roles (spec 2.1) differ in what they may do, so picking one is a permission
/// change and it goes through a sheet that picks the role and a confirmation that
/// names it. The confirmation also says the account's sessions end, because the
/// server bumps its `tokenVersion` — a permission the change removed must not
/// outlive it (gap-analysis E10).
///
/// An administrator cannot change **their own** role from here, for the same reason
/// they cannot remove themselves: one mis-tap would lock them out of this screen
/// with no way back in.
///
/// Resetting a password generates one on the device and shows it once. The server sets
/// `mustChangePassword`, so the account is forced to replace it at the next sign-in —
/// which is what makes "read it aloud to the person" an acceptable hand-off.
///
/// **Creating an account is no longer that hand-off.** `POST /auth/register` — where
/// an administrator typed an initial password and picked the role on the spot — was
/// removed on 14 Oct, in the same change as the web panel, once privileged
/// invitations landed (T6). This screen now issues an invite: an email, a role, a
/// department when the role is a head's, and the two fields that record **who
/// authorized the appointment outside the system** (D3). The account cannot be
/// signed into until the invitee opens the single-use link and sets their own
/// password, so no administrator ever knows a credential — and no appointment is
/// recorded without the authority behind it.
class AdminUsersPage extends ConsumerStatefulWidget {
  const AdminUsersPage({super.key});

  @override
  ConsumerState<AdminUsersPage> createState() => _AdminUsersPageState();
}

class _AdminUsersPageState extends ConsumerState<AdminUsersPage> {
  final _email = TextEditingController();
  final _authorizedBy = TextEditingController();
  final _authorizationRef = TextEditingController();
  final _authorizationNote = TextEditingController();

  var _role = Role.departmentHead;
  String? _unitId;
  var _creating = false;
  Object? _formError;
  final _fieldErrors = <String, String?>{};
  String? _busyUserId;

  /// The invitation just issued, kept on screen with its link: with no mail
  /// transport configured the administrator is the one who has to pass it on, and
  /// a toast that fades would take the only copy with it.
  InviteResult? _issued;

  @override
  void dispose() {
    _email.dispose();
    _authorizedBy.dispose();
    _authorizationRef.dispose();
    _authorizationNote.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final users = ref.watch(usersProvider);
    final approvals = ref.watch(approvalsProvider);
    final currentUserId = ref.watch(currentUserProvider)?.id;

    return PageScaffold(
      title: 'Accounts',
      subtitle: 'Who can sign in, and what they can do',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(usersProvider);
        ref.invalidate(approvalsProvider);
        await Future.wait([
          ref.read(usersProvider.future),
          ref.read(approvalsProvider.future),
        ]);
      },
      children: [
        approvals.when(
          loading: () => const SkeletonList(count: 2, height: 72),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(approvalsProvider),
          ),
          data: (pending) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SectionHeader(
                title: pending.isEmpty
                    ? 'Waiting for approval'
                    : 'Waiting for approval (${pending.length})',
                subtitle: 'Oldest requests first. Approve assigns the real role; '
                    'reject needs a reason.',
              ),
              if (pending.isEmpty)
                const AppCard(
                  child: Text(
                    'No account requests waiting.',
                    style: TextStyle(fontSize: 13.5, color: AppColors.aauGray500),
                  ),
                )
              else
                for (final account in pending) ...[
                  _PendingRow(
                    account: account,
                    isSelf: account.id == currentUserId,
                    busy: _busyUserId == account.id,
                    onApprove: () => _approve(account),
                    onReject: () => _reject(account),
                  ),
                  const SizedBox(height: AppSpace.s2),
                ],
              const SizedBox(height: AppSpace.s6),
            ],
          ),
        ),

        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Invite an account',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                ),
              ),
              const SizedBox(height: 2),
              const Text(
                'For heads, property officers, auditors and system admins — the accounts '
                'nobody can register for themselves. They set their own password from the '
                'invitation, so no password is typed here. Staff ask for an account on the '
                'public request page and a head approves them.',
                style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.4),
              ),
              const SizedBox(height: AppSpace.s4),
              AppTextField(
                label: 'Email',
                controller: _email,
                hint: 'selam.bekele@aau.edu.et',
                keyboardType: TextInputType.emailAddress,
                errorText: _fieldErrors['email'],
                enabled: !_creating,
                required: true,
              ),
              const SizedBox(height: AppSpace.stack),
              AppSelectField<Role>(
                label: 'Role',
                value: _role,
                options: Role.invitable,
                labelOf: (value) => value.label,
                enabled: !_creating,
                onChanged: (value) => setState(() {
                  _role = value ?? Role.departmentHead;
                  // A unit only means something for a head: the other roles are
                  // college-wide, and the server ignores it for them.
                  if (_role != Role.departmentHead) _unitId = null;
                }),
                helper: 'It decides what they can do, not just what they see. System Admin '
                    'runs accounts; Property Officer registers items, decides requests and '
                    'manages categories; Department Head holds and transfers items and '
                    'approves their unit\u2019s staff; Auditor runs audit sessions.',
              ),
              if (_role == Role.departmentHead) ...[
                const SizedBox(height: AppSpace.stack),
                _unitPicker(),
              ],
              const SizedBox(height: AppSpace.stack),
              AppTextField(
                label: 'Authorized by',
                controller: _authorizedBy,
                errorText: _fieldErrors['authorizedBy'],
                enabled: !_creating,
                required: true,
                helper: 'The office or person who authorized this appointment outside the '
                    'system. Nothing in the app outranks a head, an officer or an auditor, so '
                    'the decision was made elsewhere \u2014 the system records who made it.',
              ),
              const SizedBox(height: AppSpace.stack),
              AppTextField(
                label: 'Authorization reference',
                controller: _authorizationRef,
                errorText: _fieldErrors['authorizationRef'],
                enabled: !_creating,
                required: true,
                helper: 'The letter number, minute or equivalent, so the authority can be '
                    'checked later.',
              ),
              const SizedBox(height: AppSpace.stack),
              AppTextField(
                label: 'Note (optional)',
                controller: _authorizationNote,
                enabled: !_creating,
                maxLines: 2,
              ),
              if (_formError != null) ...[
                const SizedBox(height: AppSpace.stack),
                InlineError(error: _formError!),
              ],
              const SizedBox(height: AppSpace.s4),
              AppButton(
                label: 'Send invite',
                icon: Icons.person_add_alt,
                expand: true,
                loading: _creating,
                onPressed: _creating ? null : _create,
              ),
            ],
          ),
        ),

        if (_issued != null) ...[
          const SizedBox(height: AppSpace.s4),
          _issuedCard(_issued!),
        ],

        const SizedBox(height: AppSpace.s6),
        users.when(
          loading: () => const SkeletonList(count: 4, height: 84),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(usersProvider),
          ),
          data: (accounts) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SectionHeader(
                title: '${accounts.length} ${accounts.length == 1 ? 'account' : 'accounts'}',
                subtitle: 'Item counts show who is part of the record \u2014 an account that '
                    'owns items cannot be removed.',
              ),
              for (final account in accounts) ...[
                _AccountRow(
                  account: account,
                  isSelf: account.id == currentUserId,
                  busy: _busyUserId == account.id,
                  onEdit: () => _edit(account),
                  // Every account but your own can be given a different role — a
                  // change to your own is a self-lockout, so it is not offered.
                  onSetRole: account.id == currentUserId ? null : () => _changeRole(account),
                  onReset: () => _sendResetLink(account),
                  onRemove: account.id == currentUserId ? null : () => _remove(account),
                ),
                const SizedBox(height: AppSpace.s2),
              ],
              const SizedBox(height: AppSpace.s4),
              const InfoNote(
                icon: Icons.info_outline,
                message: 'A role change signs the account out of every device it is signed '
                    'in on, so the old permissions stop with it. An account that owns items '
                    'cannot be removed \u2014 transfer or dispose of its items first.',
                tone: InfoTone.neutral,
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// The department picker, shown only for a head invite. A unit is a uuid, so it
  /// has to come from the server: `GET /departments/invitable` is the list of active
  /// departments with whether each already has a working head — which is the exact
  /// case the invite is refused for, so the picker says so first.
  Widget _unitPicker() {
    final units = ref.watch(invitableUnitsProvider);
    return units.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpace.s2),
        child: LinearProgressIndicator(),
      ),
      error: (error, _) => InlineError(
        error: error,
        onRetry: () => ref.invalidate(invitableUnitsProvider),
      ),
      data: (rows) => AppSelectField<String>(
        label: 'Department',
        value: _unitId,
        options: [for (final unit in rows) unit.id],
        labelOf: (id) {
          final unit = rows.firstWhere((row) => row.id == id);
          return unit.hasActiveHead
              ? '${unit.name} \u2014 already has a head'
              : unit.name;
        },
        errorText: _fieldErrors['unitId'],
        enabled: !_creating,
        onChanged: (value) => setState(() => _unitId = value),
        helper: 'One head per department. A department that already has a working head '
            'cannot take a second.',
      ),
    );
  }

  /// The invitation the administrator has to be able to copy: the link is the only
  /// way in, and nothing was emailed while the transport is a stub.
  Widget _issuedCard(InviteResult issued) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            issued.renewed
                ? 'New link issued for ${issued.email}'
                : 'Invitation ready for ${issued.email}',
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.aauGray900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            issued.delivery == 'sent'
                ? 'The link has been emailed to them. It works once, and expires '
                    '${formatDateUtc(issued.expiresAt) ?? ''}. They set their own password '
                    'when they open it.'
                : 'No mail transport is configured, so nothing was emailed \u2014 pass this '
                    'link on yourself. It works once, and expires '
                    '${formatDateUtc(issued.expiresAt) ?? ''}.',
            style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.4),
          ),
          const SizedBox(height: AppSpace.stack),
          SelectableText(
            issued.inviteUrl,
            style: const TextStyle(fontSize: 12, color: AppColors.aauGray700),
          ),
          const SizedBox(height: AppSpace.s3),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Copy link',
                  icon: Icons.copy_all_outlined,
                  variant: AppButtonVariant.outline,
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: issued.inviteUrl));
                    if (!mounted) return;
                    showAppToast(
                      context,
                      message: 'Invitation link copied.',
                      tone: ToastTone.success,
                    );
                  },
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: AppButton(
                  label: 'Done',
                  variant: AppButtonVariant.ghost,
                  onPressed: () => setState(() => _issued = null),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _create() async {
    final email = _email.text.trim();
    final authorizedBy = _authorizedBy.text.trim();
    final authorizationRef = _authorizationRef.text.trim();
    final needsUnit = _role == Role.departmentHead;

    final errors = <String, String?>{};
    if (email.isEmpty || !email.contains('@')) errors['email'] = 'Enter a valid email address.';
    if (needsUnit && (_unitId == null || _unitId!.isEmpty)) {
      errors['unitId'] = 'Choose the department this head is appointed to.';
    }
    // D3: required by the server for every privileged role, so they are required
    // here too rather than being a refusal the administrator discovers on submit.
    if (authorizedBy.isEmpty) errors['authorizedBy'] = 'Who authorized this appointment?';
    if (authorizationRef.isEmpty) {
      errors['authorizationRef'] = 'The letter number or equivalent is required.';
    }

    setState(() {
      _fieldErrors
        ..clear()
        ..addAll(errors);
      _formError = null;
    });
    if (errors.values.any((value) => value != null)) return;

    setState(() => _creating = true);
    try {
      final issued = await ref.read(userActionsProvider).invite(
            email: email,
            role: _role.wire,
            unitId: needsUnit ? _unitId : null,
            authorizedBy: authorizedBy,
            authorizationRef: authorizationRef,
            authorizationNote: _authorizationNote.text.trim(),
          );
      if (!mounted) return;
      _email.clear();
      _authorizedBy.clear();
      _authorizationRef.clear();
      _authorizationNote.clear();
      setState(() {
        _unitId = null;
        _issued = issued;
      });
      showAppToast(
        context,
        message: issued.renewed
            ? 'New invite link sent to ${issued.email}.'
            : 'Invited ${issued.email} as ${issued.role.label}.',
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      // A refused invite is usually about the email address or the department, so
      // it goes under the field — the same rule the categories screen follows for a
      // duplicate name — with anything else as a form-level error.
      setState(() {
        if (error.isConflict) {
          _fieldErrors['email'] = error.message;
        } else {
          _formError = error;
        }
      });
    } on NetworkError catch (error) {
      setState(() => _formError = error);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _approve(UserSummary account) async {
    final role = await _pickApproveRole(account);
    if (role == null || !mounted) return;

    final confirmed = await showConfirmDialog(
      context,
      title: 'Approve ${account.fullName}?',
      body: '${account.fullName} (${account.email}) will be able to sign in as '
          '${role.label}. The request itself always asks as Staff — this is where '
          'the real role is assigned.',
      confirmLabel: 'Approve as ${role.label}',
      icon: Icons.check_circle_outline,
    );
    if (!confirmed || !mounted) return;

    await _guard(account, () async {
      await ref.read(userActionsProvider).approve(account.id, role: role.wire);
      if (mounted) {
        showAppToast(
          context,
          message: '${account.fullName} can now sign in.',
          tone: ToastTone.success,
        );
      }
    });
  }

  Future<Role?> _pickApproveRole(UserSummary account) => showAppSheet<Role>(
        context,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s4,
                AppSpace.s4,
                AppSpace.s4,
                AppSpace.s2,
              ),
              child: Text(
                'Role for ${account.fullName}',
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                ),
              ),
            ),
            for (final role in Role.selectable)
              ListTile(
                title: Text(role.label),
                subtitle: Text(_roleDescription(role)),
                trailing: role == Role.staff
                    ? const Icon(Icons.check, size: 18, color: AppColors.brand600)
                    : null,
                onTap: () => Navigator.of(context).pop(role),
              ),
            const SizedBox(height: AppSpace.s2),
          ],
        ),
      );

  Future<void> _reject(UserSummary account) async {
    final reason = await showPromptDialog(
      context,
      title: 'Reject ${account.fullName}?',
      label: 'Rejection reason',
      body: '3–500 characters. ${account.fullName} will not be able to sign in, '
          'and the same address cannot ask again into a void.',
      confirmLabel: 'Reject',
      minLength: 3,
      maxLength: 500,
    );
    if (reason == null || !mounted) return;

    await _guard(account, () async {
      await ref.read(userActionsProvider).reject(account.id, reason);
      if (mounted) {
        showAppToast(
          context,
          message: "${account.fullName}'s request was declined.",
          tone: ToastTone.info,
        );
      }
    });
  }

  Future<void> _edit(UserSummary account) async {
    final fullName = await showPromptDialog(
      context,
      title: 'Correct the name',
      label: 'Full name',
      initialValue: account.fullName,
      confirmLabel: 'Save',
    );
    if (fullName == null || !mounted) return;

    final email = await showPromptDialog(
      context,
      title: 'Correct the email',
      label: 'Email',
      initialValue: account.email,
      body: 'This is what the account signs in with.',
      confirmLabel: 'Save',
    );
    if (email == null || !mounted) return;

    await _guard(account, () async {
      await ref.read(userActionsProvider).update(account.id, fullName: fullName, email: email);
      if (mounted) showAppToast(context, message: 'Account updated.', tone: ToastTone.success);
    });
  }

  /// Pick a role, then confirm it.
  ///
  /// Two steps on purpose, and in this order: the sheet is where a role is chosen,
  /// so the confirmation that follows can name the role rather than asking "are you
  /// sure?" about an unnamed change.
  Future<void> _changeRole(UserSummary account) async {
    final role = await _pickRole(account);
    if (role == null || !mounted) return;

    final confirmed = await showConfirmDialog(
      context,
      title: 'Make this account ${role.label}?',
      body: '${account.fullName} becomes ${role.label}. '
          '${role == Role.systemAdmin ? 'That is full administrator access \u2014 every account, the approval queue, and this screen. ' : ''}'
          'The change takes effect immediately: every session the account is signed into '
          'ends, so nothing it could do a moment ago is left running under the old role.',
      confirmLabel: 'Set role to ${role.label}',
      icon: Icons.verified_user_outlined,
    );
    if (!confirmed || !mounted) return;

    await _guard(account, () async {
      await ref.read(userActionsProvider).promote(account.id, role.wire);
      if (mounted) {
        showAppToast(
          context,
          message: '${account.fullName} is now ${role.label}.',
          tone: ToastTone.success,
        );
      }
    });
  }

  /// The role picker. A sheet rather than a dialog because five labelled rows are a
  /// list, and a list is what a sheet is for.
  Future<Role?> _pickRole(UserSummary account) => showAppSheet<Role>(
        context,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s4,
                AppSpace.s4,
                AppSpace.s4,
                AppSpace.s2,
              ),
              child: Text(
                'Role for ${account.fullName}',
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                ),
              ),
            ),
            for (final role in Role.selectable)
              ListTile(
                title: Text(role.label),
                subtitle: Text(_roleDescription(role)),
                // The current role is shown but not selectable: choosing it again is
                // the 409 the server answers, and a control that can only fail is
                // worse than one that is visibly unavailable.
                enabled: role != account.role,
                trailing: role == account.role
                    ? const Icon(Icons.check, size: 18, color: AppColors.aauGray400)
                    : null,
                onTap: () => Navigator.of(context).pop(role),
              ),
            const SizedBox(height: AppSpace.s2),
          ],
        ),
      );

  Future<void> _sendResetLink(UserSummary account) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Send a reset link?',
      body: 'A single-use link goes to ${account.email}. ${account.fullName} chooses the new '
          'password themselves — nobody here sees or sets it. Nothing changes until the link '
          'is used.',
      confirmLabel: 'Send link',
      icon: Icons.forward_to_inbox_outlined,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busyUserId = account.id);
    try {
      final message = await ref.read(userActionsProvider).sendResetLink(account.email);
      if (mounted) showAppToast(context, message: message, tone: ToastTone.info);
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busyUserId = null);
    }
  }

  Future<void> _remove(UserSummary account) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Remove this account?',
      body: 'The account and its notification inbox are removed. It owns '
          '${account.itemCount} ${account.itemCount == 1 ? 'item' : 'items'}, which have to '
          'be transferred or disposed of first — an account still holding items cannot be '
          'removed.',
      confirmLabel: 'Remove account',
      destructive: true,
      icon: Icons.person_remove_outlined,
    );
    if (!confirmed || !mounted) return;

    await _guard(account, () async {
      await ref.read(userActionsProvider).remove(account.id);
      if (mounted) {
        showAppToast(context, message: '${account.fullName} removed.', tone: ToastTone.info);
      }
    });
  }

  Future<void> _guard(UserSummary account, Future<void> Function() action) async {
    setState(() => _busyUserId = account.id);
    try {
      await action();
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busyUserId = null);
    }
  }
}

/// One line per role, in the same words the create form's helper uses. A picker
/// that only shows five names invites the reader to guess what changed.
String _roleDescription(Role role) => switch (role) {
      Role.systemAdmin => 'Runs accounts: invites, roles, resets, removals.',
      Role.propertyOfficer => 'Registers items, decides requests, manages categories.',
      Role.departmentHead => 'Holds items for a department and decides requests.',
      Role.staff => 'Holds items and files transfer requests.',
      Role.auditor => 'Runs audit sessions and reads reports.',
      _ => 'Unrecognised role.',
    };

class _PendingRow extends StatelessWidget {
  const _PendingRow({
    required this.account,
    required this.isSelf,
    required this.busy,
    required this.onApprove,
    required this.onReject,
  });

  final UserSummary account;
  final bool isSelf;
  final bool busy;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              InitialsAvatar(
                initial: account.fullName.isEmpty ? '?' : account.fullName.substring(0, 1),
                id: account.id,
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            account.fullName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.aauGray900,
                            ),
                          ),
                        ),
                        if (isSelf) ...[
                          const SizedBox(width: AppSpace.s2),
                          const Text(
                            '(you)',
                            style: TextStyle(fontSize: 12, color: AppColors.aauGray500),
                          ),
                        ],
                      ],
                    ),
                    Text(
                      account.email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Requested ${formatDateUtc(account.createdAt) ?? ''}',
                      style: const TextStyle(fontSize: 12, color: AppColors.aauGray400),
                    ),
                  ],
                ),
              ),
              if (busy)
                const Padding(
                  padding: EdgeInsets.all(AppSpace.s2),
                  child: InlineSpinner(size: 18),
                ),
            ],
          ),
          if (isSelf)
            const Padding(
              padding: EdgeInsets.only(top: AppSpace.s2),
              child: Text(
                'You cannot approve your own account',
                style: TextStyle(fontSize: 11.5, color: AppColors.aauGray500),
              ),
            )
          else if (!busy) ...[
            const SizedBox(height: AppSpace.s3),
            Row(
              children: [
                Expanded(
                  child: AppButton(
                    label: 'Approve',
                    icon: Icons.check,
                    size: AppButtonSize.sm,
                    expand: true,
                    onPressed: onApprove,
                  ),
                ),
                const SizedBox(width: AppSpace.s2),
                Expanded(
                  child: AppButton(
                    label: 'Reject',
                    icon: Icons.close,
                    variant: AppButtonVariant.outline,
                    size: AppButtonSize.sm,
                    expand: true,
                    onPressed: onReject,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _AccountRow extends StatelessWidget {
  const _AccountRow({
    required this.account,
    required this.isSelf,
    required this.busy,
    required this.onEdit,
    required this.onSetRole,
    required this.onReset,
    required this.onRemove,
  });

  final UserSummary account;
  final bool isSelf;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback? onSetRole;
  final VoidCallback onReset;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              InitialsAvatar(initial: account.fullName.isEmpty ? '?' : account.fullName.substring(0, 1), id: account.id),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            account.fullName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.aauGray900,
                            ),
                          ),
                        ),
                        if (isSelf) ...[
                          const SizedBox(width: AppSpace.s2),
                          const Text(
                            '(you)',
                            style: TextStyle(fontSize: 12, color: AppColors.aauGray500),
                          ),
                        ],
                      ],
                    ),
                    Text(
                      account.email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray600),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        RoleBadge(role: account.role, dense: true),
                        const SizedBox(width: AppSpace.s2),
                        Text(
                          account.itemCount == 1 ? '1 item' : '${account.itemCount} items',
                          style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
                        ),
                        const SizedBox(width: AppSpace.s2),
                        Text(
                          'joined ${formatDateUtc(account.createdAt) ?? ''}',
                          style: const TextStyle(fontSize: 12, color: AppColors.aauGray400),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (busy)
                const Padding(
                  padding: EdgeInsets.all(AppSpace.s2),
                  child: InlineSpinner(size: 18),
                )
              else
                PopupMenuButton<String>(
                  tooltip: 'Account actions',
                  icon: const Icon(Icons.more_vert, size: 20, color: AppColors.aauGray500),
                  onSelected: (value) => switch (value) {
                    'edit' => onEdit(),
                    'role' => onSetRole?.call(),
                    'reset' => onReset(),
                    'remove' => onRemove?.call(),
                    _ => null,
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'edit', child: Text('Correct name or email')),
                    if (onSetRole != null)
                      const PopupMenuItem(value: 'role', child: Text('Change role')),
                    const PopupMenuItem(value: 'reset', child: Text('Send reset link')),
                    if (onRemove != null)
                      const PopupMenuItem(
                        value: 'remove',
                        child: Text('Remove account', style: TextStyle(color: AppColors.danger700)),
                      ),
                  ],
                ),
            ],
          ),
          if (isSelf)
            const Padding(
              padding: EdgeInsets.only(top: AppSpace.s2),
              child: Text(
                'You cannot remove your own account \u2014 another administrator has to.',
                style: TextStyle(fontSize: 11.5, color: AppColors.aauGray500),
              ),
            ),
        ],
      ),
    );
  }
}

/// There is deliberately no "generated password" dialog here any more.
///
/// This screen used to reset an account by generating a password, showing it to
/// the administrator once, and calling `POST /users/:id/password`. That route was
/// removed (ruling C10: no administrator ever sees or sets another person's
/// password), so the menu item had become a 404 in the hand. It now sends a
/// single-use reset link instead ([UserActions.sendResetLink]) and the account
/// holder chooses the password themselves.
