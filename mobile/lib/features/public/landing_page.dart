import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/page_scaffold.dart';

/// `/` — the anonymous front door, and the same page the web app shows.
///
/// The web landing is informational on purpose: the register is behind
/// `authenticate`, so a public search box on this page could only ever answer
/// 401. The phone used to keep a second, signed-in search layout here that the
/// router never rendered (a session asking for `/` is forwarded to `/dashboard`),
/// so it was dead code kept alive by the auth check at the top of `build`. What
/// remains is the promise the app can keep: sign in, or ask for an account.
///
/// The three cards are the web page's three, in the same order and words. A
/// visitor who has seen one app and then the other is not re-reading a different
/// introduction.
class LandingPage extends StatelessWidget {
  const LandingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const PageScaffold(
      title: 'CNCS Property Management System',
      subtitle:
          'A property register for CNCS \u2014 tracking university-owned equipment '
          'and assets.',
      maxWidth: 960,
      children: [
        _SignInCard(),
        SizedBox(height: AppSpace.s6),
        _InfoCard(
          icon: Icons.place_outlined,
          title: 'Who can use this',
          body:
              'Staff, department heads, property officers, and auditors with a CNCS '
              'account can access the system to track and manage university property.',
        ),
        SizedBox(height: AppSpace.s3),
        _InfoCard(
          icon: Icons.login,
          title: 'How to get an account',
          body:
              'Contact your department head or the Property Office to request an '
              'account. All accounts require approval from a system administrator.',
        ),
        SizedBox(height: AppSpace.s3),
        _InfoCard(
          icon: Icons.mail_outline,
          title: 'Contact the Property Office',
          body:
              'For questions about the system, lost items, or account access, reach '
              'out to the CNCS Property Office.',
        ),
      ],
    );
  }
}

/// The one action on the page, plus the second door for someone without an
/// account yet.
class _SignInCard extends StatelessWidget {
  const _SignInCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.s5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: AppColors.aauGrayLine),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppButton(
            label: 'Staff sign in',
            icon: Icons.login,
            size: AppButtonSize.lg,
            expand: true,
            onPressed: () => context.push('/login'),
          ),
          const SizedBox(height: AppSpace.s2),
          AppButton(
            label: 'Request an account',
            variant: AppButtonVariant.outline,
            expand: true,
            icon: Icons.person_add_alt_1_outlined,
            onPressed: () => context.push('/request-account'),
          ),
          const SizedBox(height: AppSpace.s3),
          const Text(
            'Found a sticker on a piece of equipment? Sign in and scan it \u2014 the tag '
            'opens that item\u2019s record, including where it is kept.',
            style: TextStyle(
              fontSize: 12.5,
              color: AppColors.aauGray600,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.s4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: AppRadius.mdAll,
        border: Border.all(color: AppColors.aauGrayLine),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.brand50,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 22, color: AppColors.brand600),
          ),
          const SizedBox(width: AppSpace.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.aauGray600,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
