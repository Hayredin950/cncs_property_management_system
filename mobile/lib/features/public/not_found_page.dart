import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/auth_provider.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';

/// The one 404, used for three different situations on purpose (§9.1, §10.14):
///
///   * an unknown path;
///   * a staff session deep-linking to an `/admin/*` screen;
///   * any route the router could not match at all.
///
/// They share a page because inventing a "you don't have permission" screen for the
/// second case would be UI theatre — the admin screens are protected by the server
/// (which 403s), not by this route. One 404 keeps the number of trust boundaries
/// the UI *pretends* to enforce at zero.
///
/// The copy is the app-level wording, not the item page's "Tag not found." — and
/// the link back depends on who is looking, because "Back to the register" and
/// "Back to home" are different journeys.
class NotFoundPage extends ConsumerWidget {
  const NotFoundPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(authProvider).isAuthenticated;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpace.gutter),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                  color: AppColors.aauGray100,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.search_off_outlined, size: 30, color: AppColors.aauGray400),
              ),
              const SizedBox(height: AppSpace.s4),
              const Text(
                'Page not found',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                ),
              ),
              const SizedBox(height: AppSpace.stackTight),
              Text(
                signedIn
                    ? 'This address does not exist, or your account cannot open it. The '
                        'register is one tap away.'
                    : 'This address does not exist. You can scan an item tag or search the '
                        'register from the home page.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13.5, color: AppColors.aauGray500, height: 1.5),
              ),
              const SizedBox(height: AppSpace.s5),
              AppButton(
                label: signedIn ? 'Back to the register' : 'Back to home',
                expand: true,
                icon: Icons.arrow_back,
                onPressed: () => context.go(signedIn ? '/items' : '/'),
              ),
              const SizedBox(height: AppSpace.s2),
              if (signedIn)
                AppButton(
                  label: 'Go to dashboard',
                  variant: AppButtonVariant.ghost,
                  expand: true,
                  onPressed: () => context.go('/dashboard'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
