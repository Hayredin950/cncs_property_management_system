import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format.dart';
import '../../../data/providers/items_provider.dart';
import '../../../models/history.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/states.dart';

/// The item's edit history, **grouped by `editedAt`**.
///
/// This grouping is the whole point of the component, and it comes from a real gap:
/// `ItemEditLog` has no `requestId` column, so there is no column that says "these
/// six rows were one approval". The one field that *is* shared is the exact
/// timestamp — every row an approval writes carries the same `editedAt` — so that
/// timestamp is the correlation key (frontend-plan.md §7).
///
/// Ungrouped, approving one transfer that moved an item and cascaded to three
/// accessories renders as five unrelated field edits, and the reader has to
/// reconstruct the decision from the diff. Grouped, it reads as one event with a
/// summary of how much it touched.
class HistoryList extends ConsumerWidget {
  const HistoryList({super.key, required this.itemId});

  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(itemHistoryProvider(itemId));

    return history.when(
      loading: () => const SkeletonList(count: 3, height: 86),
      error: (error, _) => InlineError(
        error: error,
        onRetry: () => ref.invalidate(itemHistoryProvider(itemId)),
      ),
      data: (response) {
        final events = response.groupedByEdit;
        if (events.isEmpty) {
          return const EmptyState(
            icon: Icons.history,
            title: 'No changes recorded',
            body: 'When a transfer or disposal approval changes this item, the previous '
                'and new values appear here.',
            compact: true,
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final event in events) ...[
              _EventCard(event: event),
              const SizedBox(height: AppSpace.stack),
            ],
            Text(
              '${response.total} logged ${response.total == 1 ? 'change' : 'changes'} in '
              'total',
              style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500),
            ),
          ],
        );
      },
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

  final EditEvent event;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.edit_note_outlined, size: 18, color: AppColors.brand600),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: Text(
                  event.editedByName,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
              ),
              Text(
                formatRelativeTime(event.editedAt),
                style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            '${formatDateTimeUtc(event.editedAt) ?? ''} · ${event.summary}',
            style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray400),
          ),
          const SizedBox(height: AppSpace.s3),
          for (final entry in event.entries) _EntryRow(entry: entry),
        ],
      ),
    );
  }
}

class _EntryRow extends StatelessWidget {
  const _EntryRow({required this.entry});

  final EditLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final (icon, label) = _describe(entry.fieldChanged);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: AppColors.aauGray400),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Padding(
            padding: const EdgeInsets.only(left: 21),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              runSpacing: 2,
              children: [
                // Old and new are rendered **verbatim**, whatever they hold: a tag
                // id, a date, a decimal, or an enum member. Reformatting here would
                // make the log disagree with the record it is describing.
                _value(entry.oldValue, strikethrough: true),
                const Icon(Icons.arrow_forward, size: 12, color: AppColors.aauGray400),
                _value(entry.newValue),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _value(String? value, {bool strikethrough = false}) {
    final empty = value == null || value.isEmpty;
    return Text(
      empty ? '—' : value,
      style: TextStyle(
        fontSize: 13,
        color: empty
            ? AppColors.aauGray400
            : (strikethrough ? AppColors.aauGray500 : AppColors.aauGray900),
        decoration: strikethrough && !empty ? TextDecoration.lineThrough : null,
        height: 1.4,
      ),
    );
  }

  /// Field name to a human label and an icon. Anything unmapped falls back to the
  /// raw column name — the same rule as every other enum in this app, and the reason
  /// a future column does not need a client release to be readable.
  static (IconData, String) _describe(String field) => switch (field) {
        'name' => (Icons.label_outline, 'Name'),
        'categoryId' => (Icons.sell_outlined, 'Category'),
        'department' => (Icons.apartment_outlined, 'Department'),
        'building' => (Icons.domain_outlined, 'Building'),
        'floor' => (Icons.layers_outlined, 'Floor'),
        'room' => (Icons.meeting_room_outlined, 'Room'),
        'ownerId' => (Icons.person_outline, 'Owner'),
        'purchaseCost' => (Icons.payments_outlined, 'Purchase cost'),
        'currentValue' => (Icons.trending_up, 'Current value'),
        'condition' => (Icons.build_outlined, 'Condition'),
        'status' => (Icons.toggle_on_outlined, 'Status'),
        'brand' => (Icons.branding_watermark_outlined, 'Brand'),
        'model' => (Icons.memory, 'Model'),
        'serialNumber' => (Icons.qr_code_outlined, 'Serial number'),
        'photoUrl' => (Icons.image_outlined, 'Photo'),
        'notes' => (Icons.sticky_note_2_outlined, 'Notes'),
        'parentItemId' => (Icons.link_outlined, 'Parent item'),
        _ => (Icons.edit_outlined, field),
      };
}
