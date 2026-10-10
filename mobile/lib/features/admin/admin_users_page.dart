import 'package:flutter/material.dart';
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
/// the page. The endpoints exist now, so this screen is the full management view — and
/// the one limitation that *is* still true gets stated: **there is no demote.** An
/// account can be promoted from STAFF to ADMIN and never back, because the endpoint
/// does not exist. A "remove admin rights" control would imply a capability the API
/// does not have, so it is absent and the copy says why.
///
/// Resetting a password generates one on the device and shows it once. The server sets
/// `mustChangePassword`, so the account is forced to replace it at the next sign-in —
/// which is what makes "read it aloud to the person" an acceptable hand-off. Creating an
/// account is the same hand-off one step earlier: the administrator types an initial
/// password, and the server flags the new account `mustChangePassword` so the holder
/// replaces it at the first sign-in rather than keeping a shared secret.
class AdminUsersPage extends ConsumerStatefulWidget {
  const AdminUsersPage({super.key});

  @override
  ConsumerState<AdminUsersPage> createState() => _AdminUsersPageState();
}

class _AdminUsersPageState extends ConsumerState<AdminUsersPage> {
  final _fullName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  var _role = Role.staff;
  var _creating = false;
  Object? _formError;
  final _fieldErrors = <String, String?>{};
  String? _busyUserId;

  @override
  void dispose() {
    _fullName.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final users = ref.watch(usersProvider);
    final currentUserId = ref.watch(currentUserProvider)?.id;

    return PageScaffold(
      title: 'Accounts',
      subtitle: 'Who can sign in, and what they can do',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(usersProvider);
        await ref.read(usersProvider.future);
      },
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Create an account',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                ),
              ),
              const SizedBox(height: 2),
              const Text(
                'The person can sign in straight away. There is no invitation email — pass '
                'the password on yourself.',
                style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.4),
              ),
              const SizedBox(height: AppSpace.s4),
              AppTextField(
                label: 'Full name',
                controller: _fullName,
                hint: 'Selam Bekele',
                errorText: _fieldErrors['fullName'],
                enabled: !_creating,
                required: true,
              ),
              const SizedBox(height: AppSpace.stack),
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
              AppTextField(
                label: 'Initial password',
                controller: _password,
                errorText: _fieldErrors['password'],
                enabled: !_creating,
                required: true,
                helper: 'At least 8 characters. The holder must choose their own the first '
                    'time they sign in.',
              ),
              const SizedBox(height: AppSpace.stack),
              AppSelectField<Role>(
                label: 'Role',
                value: _role,
                options: const [Role.staff, Role.admin],
                labelOf: (value) => value.label,
                enabled: !_creating,
                onChanged: (value) => setState(() => _role = value ?? Role.staff),
                helper: 'Staff manage items and file requests. Admin also review requests and '
                    'manage accounts.',
              ),
              if (_formError != null) ...[
                const SizedBox(height: AppSpace.stack),
                InlineError(error: _formError!),
              ],
              const SizedBox(height: AppSpace.s4),
              AppButton(
                label: 'Create account',
                icon: Icons.person_add_alt,
                expand: true,
                loading: _creating,
                onPressed: _creating ? null : _create,
              ),
            ],
          ),
        ),

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
                  onPromote: account.isAdmin ? null : () => _promote(account),
                  onReset: () => _resetPassword(account),
                  onRemove: account.id == currentUserId ? null : () => _remove(account),
                ),
                const SizedBox(height: AppSpace.s2),
              ],
              const SizedBox(height: AppSpace.s4),
              const InfoNote(
                icon: Icons.info_outline,
                message: 'Promotion is one-way: an account can be raised to Admin, but not '
                    'lowered again. An account that owns items cannot be removed either '
                    '\u2014 transfer or dispose of its items first.',
                tone: InfoTone.neutral,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _create() async {
    final fullName = _fullName.text.trim();
    final email = _email.text.trim();
    final password = _password.text;

    final errors = <String, String?>{};
    if (fullName.isEmpty) errors['fullName'] = 'Enter the full name.';
    if (email.isEmpty || !email.contains('@')) errors['email'] = 'Enter a valid email address.';
    if (password.length < 8) errors['password'] = 'At least 8 characters.';

    setState(() {
      _fieldErrors
        ..clear()
        ..addAll(errors);
      _formError = null;
    });
    if (errors.values.any((value) => value != null)) return;

    setState(() => _creating = true);
    try {
      final created = await ref.read(userActionsProvider).create(
            fullName: fullName,
            email: email,
            password: password,
            role: _role.wire,
          );
      if (!mounted) return;
      _fullName.clear();
      _email.clear();
      _password.clear();
      setState(() => _role = Role.staff);
      showAppToast(
        context,
        message: '${created.fullName} can now sign in.',
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      // A taken email is a field-level failure, so it goes under the field — the same
      // rule the categories screen follows for a duplicate name.
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

  Future<void> _promote(UserSummary account) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Make this account an Admin?',
      body: '${account.fullName} will be able to review and decide every transfer and '
          'disposal request, and manage accounts and categories. This cannot be undone '
          'from here \u2014 there is no demote.',
      confirmLabel: 'Promote',
      icon: Icons.verified_user_outlined,
    );
    if (!confirmed || !mounted) return;

    await _guard(account, () async {
      await ref.read(userActionsProvider).promote(account.id);
      if (mounted) {
        showAppToast(
          context,
          message: '${account.fullName} is now an Admin.',
          tone: ToastTone.success,
        );
      }
    });
  }

  Future<void> _resetPassword(UserSummary account) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Reset this password?',
      body: 'A new password is generated and shown to you once. ${account.fullName} will be '
          'forced to choose their own the next time they sign in, and every existing '
          'session for the account is signed out.',
      confirmLabel: 'Reset',
      destructive: true,
      icon: Icons.lock_reset_outlined,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busyUserId = account.id);
    try {
      final password = await ref.read(userActionsProvider).resetPassword(account.id);
      if (!mounted) return;
      await showPasswordDialog(
        context,
        name: account.fullName,
        email: account.email,
        password: password,
      );
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

class _AccountRow extends StatelessWidget {
  const _AccountRow({
    required this.account,
    required this.isSelf,
    required this.busy,
    required this.onEdit,
    required this.onPromote,
    required this.onReset,
    required this.onRemove,
  });

  final UserSummary account;
  final bool isSelf;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback? onPromote;
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
                    'promote' => onPromote?.call(),
                    'reset' => onReset(),
                    'remove' => onRemove?.call(),
                    _ => null,
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'edit', child: Text('Correct name or email')),
                    if (onPromote != null)
                      const PopupMenuItem(value: 'promote', child: Text('Make an Admin')),
                    const PopupMenuItem(value: 'reset', child: Text('Reset password')),
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

/// Shows a generated password **once**, with a copy control.
///
/// Not a toast: a 14-character password in a five-second snack bar is a password the
/// administrator will not finish copying. A dialog stays until it is dismissed, and it
/// repeats the email so the two can be passed on together.
Future<void> showPasswordDialog(
  BuildContext context, {
  required String name,
  required String email,
  required String password,
}) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: AppRadius.lgAll),
      title: const Text('New password', style: TextStyle(fontSize: 17)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Give this to $name ($email). It is shown once and cannot be retrieved again \u2014 '
            'resetting again issues a different one.',
            style: const TextStyle(fontSize: 13.5, color: AppColors.aauGray600, height: 1.5),
          ),
          const SizedBox(height: AppSpace.s4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpace.s3),
            decoration: BoxDecoration(
              color: AppColors.aauGray100,
              borderRadius: AppRadius.smAll,
              border: Border.all(color: AppColors.aauGray200),
            ),
            child: SelectableText(
              password,
              style: const TextStyle(
                fontFamily: 'GeistMono',
                fontSize: 15,
                letterSpacing: 1,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Done'),
        ),
      ],
    ),
  );
}
