import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/format.dart';
import '../../../models/item.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/app_button.dart';
import '../../../widgets/data_display.dart';
import '../../../widgets/media.dart';
import '../../../widgets/status_badges.dart';

/// The item's field layout, shared by the public QR destination and the staff
/// detail screen (§10.2).
///
/// The single most important rule this widget implements is a **negative** one: it
/// renders exactly the keys the API sent and never re-implements the server's field
/// filter (`backend/src/utils/filterItemFields.ts`). So a public viewer sees a page
/// that is visibly shorter — no owner, no money, no specs, no notes, no accessories
/// — and **that difference is the access control, not a bug to visually patch over**
/// (§10.2, and `frontend-plan.md` §5's "never hide instead of enforce").
///
/// Two consequences worth stating, because both look like omissions:
///
///   * There is no "hidden fields" placeholder. A public viewer is not shown a
///     greyed-out price with a lock icon; the block is simply absent, because
///     rendering the *shape* of withheld data still leaks that it exists.
///   * [Item.isPrivileged] exists and is deliberately unused here. It is the flag a
///     caller uses to decide what *actions* to offer (edit, history, tag controls),
///     never what fields to draw.
class ItemDetailView extends StatelessWidget {
  const ItemDetailView({super.key, required this.item, this.extras, this.showPublicLink = false});

  final Item item;

  /// The staff-only blocks appended after the fields — history, the tag sticker
  /// panel, accessory management. Kept as a slot so this widget stays the field
  /// layout and a caller cannot accidentally hide a field behind a role check.
  final Widget? extras;

  /// Adds a control that copies the shareable public URL. Only meaningful on the
  /// staff view, where the public address is not already in the address bar.
  final bool showPublicLink;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PhotoFrame(
          url: item.photoUrl,
          categoryName: item.categoryName,
          radius: AppRadius.lg,
          iconSize: 52,
        ),
        const SizedBox(height: AppSpace.s4),

        Text(
          item.name,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: AppColors.aauGray900,
            height: 1.25,
          ),
        ),
        const SizedBox(height: AppSpace.s2),
        Row(
          children: [
            Flexible(
              child: CopyableTagId(
                tagId: item.tagId,
                fontSize: 14,
                copiedMessage: 'Tag ID copied',
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s3),
        Wrap(
          spacing: AppSpace.s2,
          runSpacing: AppSpace.s2,
          children: [
            ConditionBadge(condition: item.condition, label: item.conditionLabel),
            ItemStatusBadge(status: item.status, label: item.statusLabel),
          ],
        ),

        const SizedBox(height: AppSpace.s6),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DetailGroup(
                title: 'Location',
                icon: Icons.place_outlined,
                rows: [
                  FieldRow(
                    label: 'Department',
                    value: item.department,
                    icon: Icons.apartment_outlined,
                  ),
                  FieldRow(label: 'Building', value: item.building, icon: Icons.domain_outlined),
                  FieldRow(label: 'Floor', value: item.floor, icon: Icons.layers_outlined),
                  FieldRow(label: 'Room', value: item.room, icon: Icons.meeting_room_outlined),
                  FieldRow(
                    label: 'Category',
                    value: item.categoryName,
                    icon: Icons.sell_outlined,
                  ),
                  FieldRow(
                    label: 'Registered',
                    value: formatDateUtc(item.registeredAt),
                    icon: Icons.event_outlined,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.stack),

        // Everything below is optional, and each block's absence is the server's
        // decision rather than this widget's.
        if (item.ownerName != null)
          _block(
            AppCard(
              child: DetailGroup(
                title: 'Owner',
                icon: Icons.person_outline,
                rows: [
                  FieldRow(label: 'Name', value: item.ownerName),
                  FieldRow(label: 'Email', value: item.ownerEmail, icon: Icons.mail_outline),
                ],
              ),
            ),
          ),

        if (item.purchaseCost != null || item.currentValue != null)
          _block(
            AppCard(
              child: DetailGroup(
                title: 'Value',
                icon: Icons.payments_outlined,
                rows: [
                  FieldRow(
                    label: 'Purchase',
                    value: formatCurrencyEtb(item.purchaseCost),
                    muted: item.purchaseCost == null,
                  ),
                  FieldRow(
                    label: 'Current',
                    value: formatCurrencyEtb(item.currentValue),
                    muted: item.currentValue == null,
                  ),
                ],
                note: 'Amounts are in Ethiopian Birr, as recorded at registration.',
              ),
            ),
          ),

        if (item.brand != null || item.model != null || item.serialNumber != null)
          _block(
            AppCard(
              child: DetailGroup(
                title: 'Specs',
                icon: Icons.build_outlined,
                rows: [
                  FieldRow(label: 'Brand', value: item.brand, muted: item.brand == null),
                  FieldRow(label: 'Model', value: item.model, muted: item.model == null),
                  FieldRow(
                    label: 'Serial',
                    value: item.serialNumber,
                    muted: item.serialNumber == null,
                  ),
                ],
              ),
            ),
          ),

        if (item.notes != null)
          _block(
            AppCard(
              child: DetailGroup(
                title: 'Notes',
                icon: Icons.sticky_note_2_outlined,
                rows: [
                  Text(
                    item.notes!,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.aauGray800,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ),

        // A disposed item shows *why*, because "disposed" without a reason invites
        // someone to ask whether it was a mistake.
        if (item.isDisposed)
          _block(
            AppCard(
              readOnly: true,
              child: DetailGroup(
                title: 'Disposal',
                icon: Icons.archive_outlined,
                rows: [
                  FieldRow(label: 'Reason', value: item.disposalReason),
                  FieldRow(
                    label: 'Disposed on',
                    value: formatDateUtc(item.disposedAt),
                    icon: Icons.event_outlined,
                  ),
                ],
              ),
            ),
          ),

        if (item.accessories.isNotEmpty)
          _block(
            AppCard(
              child: DetailGroup(
                title: 'Accessories',
                icon: Icons.link_outlined,
                rows: [
                  for (final accessory in item.accessories)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpace.s2),
                      child: Row(
                        children: [
                          const Icon(Icons.circle, size: 5, color: AppColors.aauGray400),
                          const SizedBox(width: AppSpace.s2),
                          Expanded(
                            child: Text(
                              accessory.name,
                              style: const TextStyle(
                                fontSize: 14,
                                color: AppColors.aauGray900,
                                height: 1.4,
                              ),
                            ),
                          ),
                          TagIdText(tagId: accessory.tagId, fontSize: 11.5),
                        ],
                      ),
                    ),
                ],
                note: item.accessories.length == 1
                    ? 'Bundled with this item.'
                    : 'Disposing or transferring the parent item cascades to these.',
              ),
            ),
          ),

        if (showPublicLink && item.isPrivileged)
          _block(
            AppCard(
              child: DetailGroup(
                title: 'Public link',
                icon: Icons.public_outlined,
                rows: [
                  const Text(
                    'Printed on the sticker and open to anyone: it shows the item\u2019s '
                    'name, tag, condition and location, and nothing else.',
                    style: TextStyle(fontSize: 13, color: AppColors.aauGray600, height: 1.5),
                  ),
                ],
                trailing: IconButton(
                  tooltip: 'Copy the public link',
                  icon: const Icon(Icons.copy_outlined, size: 18),
                  onPressed: () async {
                    await Clipboard.setData(
                      ClipboardData(text: 'https://cncs-pms.aau.edu.et/item/${item.tagId}'),
                    );
                    await HapticFeedback.selectionClick();
                  },
                ),
              ),
            ),
          ),

        ?extras,
      ],
    );
  }

  Widget _block(Widget child) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.stack),
        child: child,
      );
}

/// The staff view's quick-action row: the three things worth doing to an item,
/// and the two the API will refuse (a disposed item cannot be edited).
class ItemActionBar extends StatelessWidget {
  const ItemActionBar({
    super.key,
    required this.onEdit,
    required this.onViewTag,
    required this.onFileRequest,
    required this.disposed,
  });

  final VoidCallback onEdit;
  final VoidCallback onViewTag;
  final VoidCallback onFileRequest;
  final bool disposed;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: 'Edit',
                icon: Icons.edit_outlined,
                variant: AppButtonVariant.primary,
                expand: true,
                // Disabled rather than hidden, and the detail screen says why — the
                // design system's rule ("never hide instead of enforce") is about
                // *permissions*, and this is not a permission: a disposed item's edit
                // form would 409 on submit, so a control that explains itself beats a
                // control that vanishes with no trace.
                onPressed: disposed ? null : onEdit,
              ),
            ),
            const SizedBox(width: AppSpace.s2),
            Expanded(
              child: AppButton(
                label: 'Tag',
                icon: Icons.qr_code_2_outlined,
                variant: AppButtonVariant.outline,
                expand: true,
                onPressed: onViewTag,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s2),
        AppButton(
          label: 'File a transfer or disposal request',
          icon: Icons.assignment_add,
          variant: AppButtonVariant.secondary,
          expand: true,
          onPressed: onFileRequest,
        ),
      ],
    );
  }
}
