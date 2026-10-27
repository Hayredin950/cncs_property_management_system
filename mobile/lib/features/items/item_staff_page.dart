import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/providers/items_provider.dart';
import '../../data/providers/auth_provider.dart';
import '../../models/item.dart';
import '../../models/permissions.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/segmented_tabs.dart';
import '../../widgets/states.dart';
import 'widgets/accessories_panel.dart';
import 'widgets/history_list.dart';
import 'widgets/item_detail_view.dart';
import 'widgets/tag_panel.dart';

/// `/items/:id` — the staff detail view.
///
/// The same field layout as the public QR page ([ItemDetailView]) plus the two
/// blocks only staff can use: the **TagStickerCard** and the **Accessories** list
/// (§10.6). Because a staff session receives the privileged field block, this page is
/// visibly longer than `/item/:tagId` for the same item — and that length is the
/// access control doing its job, not a difference to paper over.
///
/// Two decisions worth naming:
///
///   * **History is a tab, and it is staff/admin only.** SRS 3.4 is explicit that an
///     item's *owner* cannot read its edit history — only Staff and Admin can — so
///     the tab is not offered to an owner, whose route here would 403.
///   * **Edit is disabled rather than hidden on a disposed item**, and the banner
///     says why. That is the deliberate reading of §10.6's "a disposed item opens the
///     form read-only": a missing button is a mystery, a disabled one with a reason
///     is an explanation.
class ItemStaffPage extends ConsumerStatefulWidget {
  const ItemStaffPage({super.key, required this.itemId});

  final String itemId;

  @override
  ConsumerState<ItemStaffPage> createState() => _ItemStaffPageState();
}

class _ItemStaffPageState extends ConsumerState<ItemStaffPage> {
  var _tab = 0;

  @override
  Widget build(BuildContext context) {
    final item = ref.watch(itemByIdProvider(widget.itemId));
    final auth = ref.watch(authProvider);
    final user = auth.user;

    /// The row-level half of the edit rule. The capability says Staff and heads
    /// may edit; this says *which* items — the ones in their custody — so the
    /// button does not invite a save the API will refuse.
    bool canEdit(Item row) {
      if (user == null) return false;
      return canEditItem(
        role: user.role,
        userId: user.id,
        departmentId: user.departmentId,
        ownerId: row.ownerId,
        holderType: row.holderType,
        holderId: row.holderId,
        orgUnitId: row.orgUnitId,
      );
    }

    return item.when(
      loading: () => const PageScaffold(
        title: 'Loading item',
        maxWidth: 640,
        children: [SkeletonDetail()],
      ),
      error: (error, _) => PageScaffold(
        title: 'Item',
        maxWidth: 640,
        children: [
          InlineError(
            error: error,
            onRetry: () => ref.invalidate(itemByIdProvider(widget.itemId)),
          ),
          const SizedBox(height: AppSpace.s3),
          AppButton(
            label: 'Back to browse items',
            variant: AppButtonVariant.outline,
            expand: true,
            onPressed: () => context.go('/items'),
          ),
        ],
      ),
      data: (data) {
        final editable = canEdit(data);
        // The History tab is the item's edit log: the server serves it to the
        // people who see the item in full (the holder, their head, the officer,
        // an auditor) and answers 404 to a colleague reading the catalogue. The
        // tab used to be offered to everyone, so the last tab on a stranger's
        // item was an error message. A head's `ITEM_READ_ALL` is not enough on
        // its own — another department's row is still not theirs.
        final canViewHistory = user != null &&
            seesFullItemDetail(
              role: user.role,
              userId: user.id,
              departmentId: user.departmentId,
              ownerId: data.ownerId,
              holderType: data.holderType,
              holderId: data.holderId,
              orgUnitId: data.orgUnitId,
            );
        return PageScaffold(
        title: data.name,
        subtitle: data.locationLine,
        maxWidth: 640,
        onRefresh: () async {
          ref.invalidate(itemByIdProvider(widget.itemId));
          await ref.read(itemByIdProvider(widget.itemId).future);
        },
        children: [
          if (data.isDisposed)
            const Padding(
              padding: EdgeInsets.only(bottom: AppSpace.stack),
              child: InfoNote(
                icon: Icons.archive_outlined,
                message: 'This item has been disposed. Its record stays readable and its '
                    'tag still resolves, but it cannot be edited \u2014 that is what filing a '
                    'disposal means.',
                tone: InfoTone.neutral,
              ),
            ),

          SegmentedTabs(
            labels: canViewHistory ? const ['Details', 'History'] : const ['Details'],
            index: canViewHistory ? _tab : 0,
            onChanged: (index) => setState(() => _tab = index),
          ),
          const SizedBox(height: AppSpace.s4),

          // A viewer without the history grant has no second tab, so a stale
          // `_tab` must not route them into a section they cannot load.
          if (!canViewHistory || _tab == 0) ...[
            ItemDetailView(item: data, showPublicLink: true),
            const SizedBox(height: AppSpace.s2),
            ItemActionBar(
              item: data,
              onEdit: () => context.push('/items/${data.id}/edit'),
              onViewTag: () => context.push('/item/${data.tagId}'),
              onFileRequest: () => context.push('/requests/new?itemId=${data.id}'),
              currentUserId: user?.id ?? '',
              currentUserRole: user?.role.name ?? '',
              currentUserDepartmentId: user?.departmentId,
              canEdit: editable && !data.isDisposed,
              canFileRequest: auth.canFileRequests,
              canClaim: canClaimItems(user?.role),
            ),
            const SizedBox(height: AppSpace.s5),
            TagPanel(item: data),
            const SizedBox(height: AppSpace.stack),
            AccessoriesPanel(item: data),
            const SizedBox(height: AppSpace.s5),
            const _DangerNote(),
          ] else
            HistoryList(itemId: data.id),
        ],
      );
      },
    );
  }
}

/// The one thing this screen *must* say out loud, because the alternative is an
/// administrator discovering it by accident.
///
/// `DELETE /items/:id` really destroys the row and its dependents — a deliberate
/// departure from F7.2 — and this client never routes to it. Pointing at the disposal
/// workflow instead is the whole safety mechanism: "remove this item" and "this item
/// is gone" are different intentions, and only one of them is what a property officer
/// normally means.
class _DangerNote extends StatelessWidget {
  const _DangerNote();

  @override
  Widget build(BuildContext context) => const Text(
        'Items cannot be deleted from here. Filing a disposal request retires the item, '
        'keeps its history, and leaves its printed tag resolving to a page that says it '
        'is out of service \u2014 which is almost always what "remove this item" means.',
        style: TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.5),
      );
}
