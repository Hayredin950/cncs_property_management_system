import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/auth_provider.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/change-password` — reachable in two moods, and the screen says which one.
///
///   * **Forced**: an administrator reset this account's password, the server set
///     `mustChangePassword`, and every other route is refused until this is done.
///     The router funnels here from anywhere (§10.13's `RequireAuth` equivalent),
///     so this page must explain *why* it is unavoidable rather than just appearing.
///   * **Chosen**: the same form as a normal self-service action from the More
///     sheet. Same fields, no banner.
///
/// On success the server has already revoked every other session and returns a
/// fresh token for this one, so the app stays signed in — the token is saved and the
/// forced flag clears, which is what lets the router release the other routes.
class ChangePasswordPage extends ConsumerStatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  ConsumerState<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends ConsumerState<ChangePasswordPage> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();

  var _obscure = true;
  var _submitting = false;
  Object? _error;
  String? _confirmError;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _confirmError = _next.text != _confirm.text ? 'The two passwords do not match.' : null;
      _error = null;
    });
    if (_confirmError != null) return;

    if (_current.text.isEmpty || _next.text.isEmpty) {
      setState(() => _error = const ApiError(400, 'All three fields are required.'));
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(authProvider.notifier).changePassword(
            currentPassword: _current.text,
            newPassword: _next.text,
          );
      if (!mounted) return;
      showAppToast(
        context,
        message: 'Password changed. Every other session has been signed out.',
        tone: ToastTone.success,
      );
      // The forced flag is now clear, so the router stops holding this screen; if
      // it was chosen voluntarily, there is simply nothing left to do here.
      if (ref.read(authProvider).mustChangePassword == false) {
        if (context.mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
      }
    } on ApiError catch (error) {
      setState(() => _error = error);
    } on NetworkError catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final forced = ref.watch(authProvider).mustChangePassword;

    return PageScaffold(
      title: 'Change password',
      subtitle: forced
          ? 'Required before you can continue'
          : 'Choose something you can remember',
      maxWidth: 520,
      children: [
        if (forced)
          const InfoNote(
            icon: Icons.lock_reset_outlined,
            message: 'An administrator reset this password. The rest of the app stays '
                'locked until you set your own — that is why every other screen redirects '
                'here.',
            tone: InfoTone.warning,
          ),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                label: 'Current password',
                controller: _current,
                obscureText: _obscure,
                enabled: !_submitting,
                prefixIcon: Icons.lock_outline,
                helper: forced ? 'Use the password you were given.' : null,
              ),
              const SizedBox(height: AppSpace.stack),
              AppTextField(
                label: 'New password',
                controller: _next,
                obscureText: _obscure,
                enabled: !_submitting,
                prefixIcon: Icons.key_outlined,
                helper: 'At least 8 characters.',
                suffix: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  tooltip: _obscure ? 'Show passwords' : 'Hide passwords',
                  icon: Icon(
                    _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                    size: 19,
                  ),
                ),
              ),
              const SizedBox(height: AppSpace.stack),
              AppTextField(
                label: 'Confirm new password',
                controller: _confirm,
                obscureText: _obscure,
                enabled: !_submitting,
                prefixIcon: Icons.key_outlined,
                errorText: _confirmError,
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpace.stack),
                InlineError(error: _error!),
              ],
              const SizedBox(height: AppSpace.s5),
              AppButton(
                label: 'Change password',
                expand: true,
                loading: _submitting,
                onPressed: _submit,
              ),
            ],
          ),
        ),
        const Text(
          'Changing your password signs out every other device. If you did not ask for '
          'this, change it again and tell the property office.',
          style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.5),
        ),
      ],
    );
  }
}
