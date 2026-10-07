import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../data/providers/auth_provider.dart';
import '../../theme/theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/data_display.dart';
import '../../widgets/feedback.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../../widgets/status_badges.dart';

/// `/profile` — the account, and the honest list of what it cannot do.
///
/// There is **no profile editing here**: `PATCH /users/:id` is Admin-only, so a
/// staff member changing their own name or email is not a missing screen, it is a
/// missing endpoint. The screen says so rather than shipping a form that would 403.
/// There is also no avatar upload anywhere in the system, which is why identity is an
/// initials circle derived from the account id.
///
/// The screen deliberately carries **no backend/build diagnostics**: the API address,
/// the health probe and the "which build is this" line were developer furniture that
/// ended up in front of staff, and where the app is pointed is not a question a
/// property officer should ever have to answer.
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final user = auth.user;

    if (user == null) {
      return const PageScaffold(
        title: 'Profile',
        maxWidth: 560,
        children: [SkeletonDetail()],
      );
    }

    return PageScaffold(
      title: 'Profile',
      maxWidth: 560,
      children: [
        AppCard(
          child: Row(
            children: [
              InitialsAvatar(initial: user.initial, id: user.id, size: 56),
              const SizedBox(width: AppSpace.s4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.fullName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user.email,
                      style: const TextStyle(fontSize: 13, color: AppColors.aauGray600),
                    ),
                    const SizedBox(height: AppSpace.s2),
                    Row(
                      children: [
                        RoleBadge(role: user.role, dense: true),
                        if (auth.mustChangePassword) ...[
                          const SizedBox(width: AppSpace.s2),
                          const Text(
                            'Password change required',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.warning700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpace.stack),
        AppCard(
          child: DetailGroup(
            title: 'Account',
            icon: Icons.badge_outlined,
            rows: [
              FieldRow(label: 'Name', value: user.fullName),
              FieldRow(label: 'Email', value: user.email),
              FieldRow(
                label: 'Role',
                valueWidget: RoleBadge(role: user.role, dense: true),
              ),
              FieldRow(
                label: 'Joined',
                value: formatDateUtc(user.createdAt),
                icon: Icons.event_outlined,
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpace.stack),
        AppButton(
          label: 'Change password',
          icon: Icons.lock_outline,
          variant: AppButtonVariant.outline,
          expand: true,
          onPressed: () => context.push('/change-password'),
        ),
        const SizedBox(height: AppSpace.s2),
        AppButton(
          label: 'My notifications',
          icon: Icons.notifications_outlined,
          variant: AppButtonVariant.outline,
          expand: true,
          onPressed: () => context.push('/notifications'),
        ),
        const SizedBox(height: AppSpace.s2),
        AppButton(
          label: 'Sign out',
          icon: Icons.logout,
          variant: AppButtonVariant.ghost,
          expand: true,
          onPressed: () async {
            final confirmed = await showConfirmDialog(
              context,
              title: 'Sign out?',
              body: 'You will need your email and password to sign back in.',
              confirmLabel: 'Sign out',
              destructive: true,
              icon: Icons.logout,
            );
            if (confirmed) await ref.read(authProvider.notifier).logout();
          },
        ),

        const SizedBox(height: AppSpace.stack),
        AppCard(
          readOnly: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Your name and email',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray700,
                ),
              ),
              const SizedBox(height: AppSpace.s2),
              Text(
                user.role.isAdmin
                    ? 'Your own name and email are set by the property office. Every '
                        'other account can be edited under More \u2192 Accounts.'
                    : 'Your name and email are set by an administrator. Ask the property '
                        'office if either needs to change.',
                style: const TextStyle(
                  fontSize: 12.5,
                  color: AppColors.aauGray600,
                  height: 1.55,
                  fontFamily: AppTheme.fontSans,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
