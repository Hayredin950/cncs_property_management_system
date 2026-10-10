import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../theme/tokens.dart';
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
    return PageScaffold(
      title: 'Scan a tag',
      subtitle: 'Point the camera at the sticker, or type what it says',
      maxWidth: 480,
      children: [
        ScannerFrame(
          caption: 'The tag on the item encodes its own address — scanning it opens '
              'that item straight away.',
          onTag: (tagId) {
            // `push`, not `go`: the back button returns to the scanner, which is what
            // someone working through a shelf of equipment expects.
            context.push('/item/$tagId');
          },
        ),
        const SizedBox(height: AppSpace.s5),
        const InfoNote(
          icon: Icons.info_outline,
          message: 'If the sticker is damaged or missing, the tag ID is printed under '
              'the QR code. Typing it works exactly like scanning it.',
        ),
      ],
    );
  }
}
