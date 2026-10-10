import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/auth_provider.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/states.dart';

/// `/login` — Shell A, "single card, `max-w-sm`, centered vertically and
/// horizontally on both breakpoints — this screen never needs more layout than
/// that" (§10.13).
///
/// Two details from that spec are load-bearing:
///
///   * **One generic error line for any `401`**, showing the API's own string
///     ("Invalid credentials") and nothing more. Saying which field was wrong
///     would tell an attacker whether an email exists; the screen has no way to
///     know that safely, so it does not guess.
///   * **`next` redirect.** [from] is the path the 401 interrupted, and the router
///     returns to it on success rather than dumping everyone on the dashboard.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key, this.from});

  final String? from;

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();

  var _obscure = true;
  var _submitting = false;
  Object? _error;
  String? _emailError;
  String? _passwordError;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;

    // Client-side mirrors of the server's own required-field check, so the only
    // way to see a validation error from the API is a real edge case.
    setState(() {
      _emailError = email.isEmpty ? 'Enter your email address.' : null;
      _passwordError = password.isEmpty ? 'Enter your password.' : null;
      _error = null;
    });
    if (_emailError != null || _passwordError != null) return;

    setState(() => _submitting = true);
    try {
      await ref.read(authProvider.notifier).login(email: email, password: password);
      // No navigation here: the router's redirect moves an authenticated user off
      // /login, and it is the only thing that knows about `from`, the forced
      // password change, and role gating. A `context.go` in this method would be a
      // second, disagreeing source of truth for navigation.
    } on ApiError catch (error) {
      // The server's own sentence, whatever it is: a 401 is "Invalid credentials",
      // a 429 says how long to wait, a 500 says the server broke. Rewording any of
      // them would lose information the user needs.
      setState(() => _error = error);
    } on NetworkError catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpace.gutter),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: AppCard(
            padding: const EdgeInsets.all(AppSpace.s5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Staff sign in',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
                const SizedBox(height: AppSpace.s1),
                const Text(
                  'The register is maintained by CNCS staff and administrators.',
                  style: TextStyle(fontSize: 13.5, color: AppColors.aauGray500, height: 1.45),
                ),
                const SizedBox(height: AppSpace.s5),

                AppTextField(
                  label: 'Email',
                  controller: _email,
                  hint: 'you@aau.edu.et',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  prefixIcon: Icons.mail_outline,
                  errorText: _emailError,
                  enabled: !_submitting,
                  onSubmitted: (_) => _passwordFocus.requestFocus(),
                ),
                const SizedBox(height: AppSpace.stack),
                AppTextField(
                  label: 'Password',
                  controller: _password,
                  focusNode: _passwordFocus,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.go,
                  prefixIcon: Icons.lock_outline,
                  errorText: _passwordError,
                  enabled: !_submitting,
                  onSubmitted: (_) => _submit(),
                  suffix: IconButton(
                    onPressed: () => setState(() => _obscure = !_obscure),
                    tooltip: _obscure ? 'Show password' : 'Hide password',
                    icon: Icon(
                      _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                      size: 19,
                    ),
                  ),
                ),

                if (_error != null) ...[
                  const SizedBox(height: AppSpace.stack),
                  InlineError(error: _error!),
                ],

                const SizedBox(height: AppSpace.s5),
                AppButton(
                  label: 'Sign in',
                  expand: true,
                  size: AppButtonSize.lg,
                  loading: _submitting,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
