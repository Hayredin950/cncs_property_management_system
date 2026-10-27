import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/auth_provider.dart';
import '../../theme/tokens.dart';
import '../../widgets/feedback.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/scanner_frame.dart';
import '../../widgets/states.dart';

/// `/scan` — Shell A (or the workbench, when signed in).
///
/// "Camera-first, manual entry always visible — never behind a 'having trouble?'
/// toggle (F4.1 requires both to resolve to the same destination)" (§10.3). Both
/// paths call the same `onTag`, and both land on `/item/:tagId`, so there is exactly
/// one code path from "here is a tag" to "here is the item".
///
/// The web version constrains itself to `max-w-md` and calls the screen "designed
/// once, for a phone". Here that is simply the phone, so the constraint is padding
/// rather than a width.
class ScanPage extends ConsumerWidget {
  const ScanPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    // A signed-in account role has no register grant, so `/item/:tagId` would
    // be a 404 for it — and a tab that always ends in "not found" is worse than
    // an honest sentence. Anonymous visitors are unaffected: their scan goes to
    // sign-in with the tag as `from`, which is the whole public journey.
    final canOpenTag = !auth.isAuthenticated || auth.seesAssetData;

    return PageScaffold(
      title: 'Scan a tag',
      subtitle: 'Point the camera at the sticker, or type what it says',
      maxWidth: 480,
      children: [
        ScannerFrame(
          caption: canOpenTag
              ? 'The tag on the item encodes its own address — scanning it opens '
                  'that item straight away.'
              : 'Scanning reads the tag, but item records belong to the register roles.',
          onTag: (tagId) {
            if (!canOpenTag) {
              showAppToast(
                context,
                message: 'Tag $tagId read. Item records open for staff, heads, the '
                    'Property Officer and auditors — not account administrators.',
                tone: ToastTone.info,
              );
              return;
            }
            // `push`, not `go`: the back button returns to the scanner, which is what
            // someone working through a shelf of equipment expects.
            context.push('/item/$tagId');
          },
        ),
        const SizedBox(height: AppSpace.s5),
        InfoNote(
          icon: Icons.info_outline,
          message: canOpenTag
              ? 'If the sticker is damaged or missing, the tag ID is printed under '
                  'the QR code. Typing it works exactly like scanning it.'
              : 'Your role runs accounts, not assets, so a scanned tag cannot be opened '
                  'here. Use a staff, head, Property Officer or auditor account to read '
                  'an item.',
        ),
      ],
    );
  }
}
