import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/items_provider.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../items/widgets/item_detail_view.dart';

/// `/item/:tagId` — the QR destination.
///
/// "**This is the highest-traffic, highest-stakes screen in the system.** It has
/// exactly three outcomes and each is a fully designed page, not a shared error
/// box" (§10.2). This file is that sentence, implemented:
///
///   1. **Found** — [ItemDetailView] renders the fields the API sent.
///   2. **404** — "Tag not found.", the raw tag that was looked up, and a way to try
///      again. The tag is echoed because the most common cause is a typo in a manual
///      entry, and seeing your own string back is how you spot it.
///   3. **410** — a disposed item seen by a public viewer: the API's exact sentence,
///      the `Archive` icon, calm slate styling, and **nothing else** — no tag ID, no
///      name, per F7.3's "nothing else". A disposed item is a normal end of
///      lifecycle, not an alarm, so it is deliberately not red.
///
/// A signed-in staff member never sees outcome 3: the same lookup returns the full
/// disposed record for them, with a "Disposed" status badge, which is why this
/// screen's 410 branch is unreachable for a staff session.
class ItemDetailPage extends ConsumerStatefulWidget {
  const ItemDetailPage({super.key, required this.tagId});

  final String tagId;

  @override
  ConsumerState<ItemDetailPage> createState() => _ItemDetailPageState();
}

class _ItemDetailPageState extends ConsumerState<ItemDetailPage> {
  final _retryTag = TextEditingController();

  @override
  void dispose() {
    _retryTag.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = ref.watch(itemByTagProvider(widget.tagId));
    final signedIn = ref.watch(authProvider).isAuthenticated;

    return item.when(
      loading: () => const PageScaffold(
        title: 'Loading item',
        maxWidth: 640,
        children: [SkeletonDetail()],
      ),
      error: (error, _) {
        if (error is ApiError && error.isGone) {
          return _DisposedNotice(message: error.message);
        }
        if (error is ApiError && error.isNotFound) {
          return _TagNotFound(
            tagId: widget.tagId,
            controller: _retryTag,
            onRetry: () {
              final next = _retryTag.text.trim();
              if (next.isEmpty) return;
              _retryTag.clear();
              context.pushReplacement('/item/$next');
            },
          );
        }
        return PageScaffold(
          title: 'Item',
          maxWidth: 640,
          children: [
            InlineError(
              error: error,
              onRetry: () => ref.invalidate(itemByTagProvider(widget.tagId)),
            ),
          ],
        );
      },
      data: (item) => PageScaffold(
        title: item.name,
        subtitle: signedIn ? item.locationLine : null,
        maxWidth: 640,
        onRefresh: () async {
          ref.invalidate(itemByTagProvider(widget.tagId));
          await ref.read(itemByTagProvider(widget.tagId).future);
        },
        children: [
          ItemDetailView(item: item, showPublicLink: signedIn),
          if (signedIn) ...[
            const SizedBox(height: AppSpace.s2),
            AppButton(
              label: 'Open the staff record for this item',
              variant: AppButtonVariant.outline,
              expand: true,
              icon: Icons.open_in_new,
              onPressed: () => context.push('/items/${item.id}'),
            ),
            const SizedBox(height: AppSpace.s3),
            const Text(
              'This is the page a scan of the sticker opens.',
              style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.5),
            ),
          ] else ...[
            const SizedBox(height: AppSpace.s5),
            AppButton(
              label: 'Sign in for the full record',
              variant: AppButtonVariant.secondary,
              expand: true,
              icon: Icons.login,
              onPressed: () => context.push(
                '/login?from=${Uri.encodeComponent('/item/${item.tagId}')}',
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Outcome 2 — a designed 404, "same visual weight as a normal page, not a
/// browser-default error".
class _TagNotFound extends StatelessWidget {
  const _TagNotFound({required this.tagId, required this.controller, required this.onRetry});

  final String tagId;
  final TextEditingController controller;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Tag not found',
      maxWidth: 560,
      children: [
        Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(color: AppColors.aauGray100, shape: BoxShape.circle),
              child: const Icon(Icons.search_off_outlined, size: 26, color: AppColors.aauGray400),
            ),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Tag not found.',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: AppColors.aauGray900,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'No item is registered against this tag.',
                    style: const TextStyle(fontSize: 13.5, color: AppColors.aauGray500),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s5),
        Container(
          padding: const EdgeInsets.all(AppSpace.s4),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: AppRadius.mdAll,
            border: Border.all(color: AppColors.aauGray200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Tag that was looked up',
                style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
              ),
              const SizedBox(height: AppSpace.s2),
              CopyableTagId(tagId: tagId, fontSize: 16),
              const SizedBox(height: AppSpace.s3),
              const Text(
                'Check the sticker for a character that was misread — O and 0, I and 1 '
                'and l are the usual culprits.',
                style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.5),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.s5),
        AppTextField(
          label: 'Try another tag',
          controller: controller,
          hint: 'CNCS-________',
          uppercase: true,
          mono: true,
          prefixIcon: Icons.qr_code_2_outlined,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => onRetry(),
        ),
        const SizedBox(height: AppSpace.s3),
        AppButton(
          label: 'Look it up',
          expand: true,
          icon: Icons.search,
          onPressed: onRetry,
        ),
        const SizedBox(height: AppSpace.s2),
        AppButton(
          label: 'Scan the sticker instead',
          variant: AppButtonVariant.outline,
          expand: true,
          icon: Icons.qr_code_scanner,
          onPressed: () => context.push('/scan'),
        ),
        const SizedBox(height: AppSpace.s2),
        AppButton(
          label: 'Search the register by name',
          variant: AppButtonVariant.ghost,
          expand: true,
          onPressed: () => context.go('/items'),
        ),
      ],
    );
  }
}

/// Outcome 3 — the disposed-item notice.
///
/// The copy is the API's own sentence, shown **verbatim and alone**. Nothing here
/// names the item, echoes the tag, or offers a next step, because F7.3's "nothing
/// else" is the requirement: a disposed record's identity is not public.
class _DisposedNotice extends StatelessWidget {
  const _DisposedNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
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
                child: const Icon(Icons.archive_outlined, size: 30, color: AppColors.aauGray500),
              ),
              const SizedBox(height: AppSpace.s4),
              // Calm slate, not danger red: this is a normal lifecycle end.
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray700,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
