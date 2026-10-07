import 'package:flutter/material.dart';

import '../../../models/item.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/media.dart';
import '../../../widgets/status_badges.dart';

/// One item, as every list in the app renders it — the landing page's "recently
/// added", the register, the dashboard preview, the accessory list.
///
/// The layout is the phone half of §8's `Table ⇄ ResponsiveList`: a photo
/// thumbnail, the name, the tag ID in mono, the location line, and the two badges.
/// No table, and **no horizontal scroll** — "never a horizontally-scrolling table,
/// which is unusable on a phone held one-handed".
///
/// [privileged] controls nothing here on purpose. The API has already decided which
/// fields this viewer receives; a card that greyed out a price it *did* receive
/// would be re-implementing the server's field filter, which §10.2 forbids. The
/// only difference a public viewer sees is a card that is visibly shorter, and that
/// difference **is** the access control.
class ItemCard extends StatelessWidget {
  const ItemCard({
    super.key,
    required this.item,
    this.onTap,
    this.trailing,
    this.dense = false,
    this.showStatus = true,
  });

  final Item item;
  final VoidCallback? onTap;

  /// A slot for the one action a particular list wants — a "View tag" icon on the
  /// register, a chevron on the landing page.
  final Widget? trailing;

  /// Drops the location line. Used inside the accessory list, where every row
  /// belongs to the same parent and the location is the parent's.
  final bool dense;

  final bool showStatus;

  @override
  Widget build(BuildContext context) {
    final thumb = dense ? 52.0 : 76.0;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpace.s3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: thumb,
            height: thumb,
            child: PhotoFrame(
              url: item.photoUrl,
              categoryName: item.categoryName,
              aspectRatio: 1,
              radius: AppRadius.sm,
              iconSize: dense ? 22 : 30,
            ),
          ),
          const SizedBox(width: AppSpace.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 3),
                TagIdText(tagId: item.tagId, fontSize: 12),
                if (!dense) ...[
                  const SizedBox(height: 3),
                  Text(
                    item.categoryName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(Icons.place_outlined, size: 13, color: AppColors.aauGray400),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(
                          item.locationLine.isEmpty ? 'No location recorded' : item.locationLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpace.s2),
                Wrap(
                  spacing: AppSpace.s2,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    ConditionBadge(
                      condition: item.condition,
                      label: item.conditionLabel,
                      dense: true,
                    ),
                    if (showStatus)
                      ItemStatusBadge(
                        status: item.status,
                        label: item.statusLabel,
                        dense: true,
                      ),
                  ],
                ),
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: AppSpace.s1),
            trailing!,
          ] else if (onTap != null)
            const Padding(
              padding: EdgeInsets.only(top: AppSpace.s1),
              child: Icon(Icons.chevron_right, size: 20, color: AppColors.aauGray400),
            ),
        ],
      ),
    );
  }
}
