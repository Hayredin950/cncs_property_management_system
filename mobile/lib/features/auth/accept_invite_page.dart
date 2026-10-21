import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/auth_provider.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/states.dart';

/// `/accept-invite?token=…` — the invited person sets their own password.
///
/// An invitation is the only way a privileged account comes into being, and the
/// **invitee** chooses the password: no administrator ever sees it, writes it
/// down, or sets it. That is the whole point of the rule, and this screen is
/// where it is kept.
///
/// The token is single-use and expires, so the three states are real and all
/// three are designed: no token (the link was opened without one), a token the
/// server refuses (expired, used, or never issued), and the form.
class AcceptInvitePage extends ConsumerStatefulWidget {
  const AcceptInvitePage({super.key, this.token, this.onAccepted});

  /// The token from the invitation link.
  final String? token;

  /// Called once the account is activated and signed in.
  ///
  /// The navigation belongs to the router, not to the screen: a screen that
  /// navigates on its own cannot be mounted without a router, which is exactly
  /// what makes it hard to test. The router passes the navigation in.
  final VoidCallback? onAccepted;

  @override
  ConsumerState<AcceptInvitePage> createState() => _AcceptInvitePageState();
}

class _AcceptInvitePageState extends ConsumerState<AcceptInvitePage> {
  final _fullName = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  var _submitting = false;
  Object? _error;
  final _fieldErrors = <String, String?>{};

  @override
  void dispose() {
    _fullName.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final token = widget.token?.trim() ?? '';
    final fullName = _fullName.text.trim();
    final password = _password.text;

    final errors = <String, String?>{};
    if (token.isEmpty) errors['token'] = 'This link is missing its invitation token.';
    if (password.length < 8) errors['password'] = 'At least 8 characters.';
    if (password != _confirm.text) errors['confirm'] = 'The two passwords do not match.';

    setState(() {
      _fieldErrors
        ..clear()
        ..addAll(errors);
      _error = null;
    });
    if (errors.values.any((value) => value != null)) return;

    setState(() => _submitting = true);
    try {
      await ref.read(authProvider.notifier).acceptInvite(
            token: token,
            password: password,
            fullName: fullName.isEmpty ? null : fullName,
          );
      if (!mounted) return;
      // The invitation is a way in: the account is activated and signed in, so
      // the person lands on their workbench rather than on a login form.
      widget.onAccepted?.call();
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on NetworkError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpace.s4),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Accept your invitation',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: AppSpace.s2),
                  Text(
                    'Choose a password for your new account. Nobody else knows it — '
                    'not even the administrator who invited you.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: AppSpace.s4),
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_fieldErrors['token'] != null) ...[
                          InlineError(error: _fieldErrors['token']!),
                          const SizedBox(height: AppSpace.s3),
                        ],
                        AppTextField(
                          label: 'Your name (optional)',
                          controller: _fullName,
                          enabled: !_submitting,
                        ),
                        const SizedBox(height: AppSpace.s3),
                        AppTextField(
                          label: 'Password',
                          controller: _password,
                          obscureText: true,
                          errorText: _fieldErrors['password'],
                          enabled: !_submitting,
                          required: true,
                          helper: 'At least 8 characters.',
                        ),
                        const SizedBox(height: AppSpace.s3),
                        AppTextField(
                          label: 'Password again',
                          controller: _confirm,
                          obscureText: true,
                          errorText: _fieldErrors['confirm'],
                          enabled: !_submitting,
                          required: true,
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: AppSpace.s3),
                          InlineError(error: _error!),
                        ],
                        const SizedBox(height: AppSpace.s4),
                        AppButton(
                          label: 'Set my password and sign in',
                          size: AppButtonSize.lg,
                          expand: true,
                          loading: _submitting,
                          onPressed: _submit,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpace.s4),
                  AppButton(
                    label: 'Back to sign in',
                    variant: AppButtonVariant.ghost,
                    expand: true,
                    onPressed: () => context.go('/login'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
