import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/format.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/requests_provider.dart';
import '../../models/enums.dart';
import '../../models/request.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/data_display.dart';
import '../../widgets/feedback.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../../widgets/status_badges.dart';

/// `/requests/:id` (§10.7).
///
/// The decision rules are the most specific in the whole app, and all three are
/// required before the buttons appear:
///
///   1. **Admin only.** A staff member never sees them — and never needs to, because
///      the server requires `ADMIN` on both endpoints.
///   2. **`status === PENDING` only.** A decided request is a record, not a task.
///   3. **Not your own request.** An admin filing a request and then approving it
///      themselves is the cheapest possible fraud in this system, so the API refuses
///      it and the UI does not offer it.
///
/// After a decision, the response's `itemChanges` and `cascadedItemIds` are rendered
/// as a "what changed" list. That is not decoration: approving a transfer rewrites
/// fields the requester never named (a cascade to accessories), and showing exactly
/// what happened at the moment it happened is the accountability trail made visible
/// where it matters most.
class RequestDetailPage extends ConsumerStatefulWidget {
  const RequestDetailPage({super.key, required this.requestId});

  final String requestId;

  @override
  ConsumerState<RequestDetailPage> createState() => _RequestDetailPageState();
}

class _RequestDetailPageState extends ConsumerState<RequestDetailPage> {
  DecideRequestResponse? _outcome;
  var _busy = false;

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(requestDetailProvider(widget.requestId));

    return detail.when(
      loading: () => const PageScaffold(
        title: 'Loading request',
        maxWidth: 640,
        children: [SkeletonDetail()],
      ),
      error: (error, _) {
        // A staff member asking for someone else's request gets a 404 (never a
        // 403) — the endpoint does not confirm the row exists. So the "not found"
        // framing is the truthful one for both an id that does not exist and one
        // this account may not read.
        if (error is ApiError && error.isNotFound) {
          return PageScaffold(
            title: 'Request not found',
            maxWidth: 640,
            children: [
              EmptyState(
                icon: Icons.search_off_outlined,
                title: 'Request not found',
                body: 'It may have been removed, or it may belong to another account. A staff '
                    'member only sees their own requests.',
                actionLabel: 'Back to the queue',
                onAction: () => context.go('/requests'),
              ),
            ],
          );
        }
        return PageScaffold(
          title: 'Request',
          maxWidth: 640,
          children: [
            InlineError(
              error: error,
              onRetry: () => ref.invalidate(requestDetailProvider(widget.requestId)),
            ),
          ],
        );
      },
      data: (data) => _body(data),
    );
  }

  Widget _body(RequestDetail detail) {
    final request = detail.summary;
    final currentUserId = ref.watch(currentUserProvider)?.id;
    final isAdmin = ref.watch(isAdminProvider);

    final canDecide = isAdmin &&
        request.status == RequestStatus.pending &&
        request.requestedById != currentUserId;

    return PageScaffold(
      title: request.type == RequestType.transfer ? 'Transfer request' : 'Disposal request',
      subtitle: request.item.name,
      maxWidth: 640,
      onRefresh: () async {
        ref.invalidate(requestDetailProvider(widget.requestId));
        await ref.read(requestDetailProvider(widget.requestId).future);
      },
      children: [
        Row(
          children: [
            RequestTypeBadge(type: request.type),
            const SizedBox(width: AppSpace.s2),
            RequestStatusBadge(status: request.status),
          ],
        ),
        const SizedBox(height: AppSpace.s4),

        AppCard(
          child: DetailGroup(
            title: 'The item',
            icon: Icons.inventory_2_outlined,
            trailing: AppButton(
              label: 'Open',
              variant: AppButtonVariant.ghost,
              size: AppButtonSize.sm,
              onPressed: () => context.push('/items/${detail.item.id}'),
            ),
            rows: [
              FieldRow(
                label: 'Name',
                value: detail.item.name,
                icon: Icons.label_outline,
              ),
              FieldRow(label: 'Tag', valueWidget: TagIdText(tagId: detail.item.tagId, fontSize: 13)),
              FieldRow(
                label: 'Location now',
                value: detail.item.locationLine,
                icon: Icons.place_outlined,
                layout: FieldLayout.stacked,
              ),
              FieldRow(
                label: 'Status',
                valueWidget: ItemStatusBadge(status: detail.item.status, dense: true),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.stack),

        AppCard(
          child: DetailGroup(
            title: 'Why',
            icon: Icons.notes_outlined,
            rows: [
              Text(
                request.reason,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.aauGray800,
                  height: 1.55,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.stack),

        AppCard(
          child: DetailGroup(
            title: 'Who and when',
            icon: Icons.person_outline,
            rows: [
              FieldRow(
                label: 'Requested by',
                valueWidget: Row(
                  children: [
                    InitialsAvatar(
                      initial: request.requestedBy.fullName.isEmpty
                          ? '?'
                          : request.requestedBy.fullName.substring(0, 1),
                      id: request.requestedById,
                      size: 24,
                    ),
                    const SizedBox(width: AppSpace.s2),
                    Expanded(child: Text(request.requestedBy.fullName)),
                  ],
                ),
              ),
              FieldRow(
                label: 'Filed',
                value: formatDateTimeUtc(request.createdAt),
                icon: Icons.event_outlined,
              ),
              if (detail.reviewedBy != null)
                FieldRow(
                  label: 'Decided by',
                  value: detail.reviewedBy!.fullName,
                  icon: Icons.verified_outlined,
                ),
              if (request.decidedAt != null)
                FieldRow(
                  label: 'Decided',
                  value: formatDateTimeUtc(request.decidedAt),
                  icon: Icons.event_available_outlined,
                ),
            ],
          ),
        ),

        if (request.type == RequestType.transfer && request.newLocationLine != null) ...[
          const SizedBox(height: AppSpace.stack),
          AppCard(
            child: DetailGroup(
              title: 'Requested destination',
              icon: Icons.place_outlined,
              rows: [
                FieldRow(label: 'Location', value: request.newLocationLine),
                FieldRow(
                  label: 'New custodian',
                  value: request.newOwnerId == null ? null : 'Reassign the item',
                  muted: request.newOwnerId == null,
                ),
              ],
            ),
          ),
        ],

        if (request.rejectionReason != null) ...[
          const SizedBox(height: AppSpace.stack),
          AppCard(
            readOnly: true,
            child: DetailGroup(
              title: 'Why it was rejected',
              icon: Icons.block_outlined,
              rows: [
                Text(
                  request.rejectionReason!,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.danger700,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],

        if (_outcome != null) ...[
          const SizedBox(height: AppSpace.stack),
          _OutcomeCard(outcome: _outcome!),
        ],

        const SizedBox(height: AppSpace.s5),
        if (canDecide) ...[
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Reject',
                  variant: AppButtonVariant.destructive,
                  expand: true,
                  size: AppButtonSize.lg,
                  icon: Icons.cancel_outlined,
                  loading: _busy,
                  onPressed: () => _reject(request),
                ),
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: AppButton(
                  label: 'Approve',
                  expand: true,
                  size: AppButtonSize.lg,
                  icon: Icons.check_circle_outline,
                  loading: _busy,
                  onPressed: () => _approve(detail),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          const InfoNote(
            icon: Icons.gavel_outlined,
            message: 'A decision is final. An approved transfer also moves every accessory '
                'bundled with the item, and both are recorded in the item\u2019s history.',
            tone: InfoTone.neutral,
          ),
        ] else if (request.status == RequestStatus.pending && request.requestedById == currentUserId)
          const InfoNote(
            icon: Icons.person_outline,
            message: 'You filed this request, so you cannot decide it. Another administrator '
                'has to review it.',
            tone: InfoTone.warning,
          )
        else if (request.status == RequestStatus.pending && !isAdmin)
          const InfoNote(
            icon: Icons.schedule_outlined,
            message: 'An administrator reviews this. You will be notified when it is decided.',
            tone: InfoTone.neutral,
          ),
      ],
    );
  }

  Future<void> _approve(RequestDetail detail) async {
    final request = detail.summary;
    final confirmed = await showConfirmDialog(
      context,
      // The dialog states the concrete effect rather than "Are you sure?" — the
      // whole safety mechanism is the sentence between the title and the buttons.
      title: 'Approve this request?',
      body: request.type == RequestType.disposal
          ? 'This will mark ${detail.item.tagId} as disposed and take it out of the '
              'register. This cannot be undone from this screen.'
          : _transferConsequence(detail),
      confirmLabel: 'Approve',
      icon: Icons.check_circle_outline,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busy = true);
    try {
      final outcome = await ref.read(requestActionsProvider).approve(
            requestId: widget.requestId,
            itemId: detail.item.id,
          );
      if (!mounted) return;
      setState(() => _outcome = outcome);
      showAppToast(
        context,
        message: outcome.notificationMessage.isEmpty
            ? 'Approved.'
            : outcome.notificationMessage,
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reject(RequestSummary request) async {
    final reason = await showReasonDialog(
      context,
      title: 'Reject this request?',
      body: 'The requester is told, and your reason is the only thing they see. Explain '
          'what would need to change.',
    );
    // `null` means the dialog was dismissed. A cancelled reject is not a rejected
    // request, and treating the two the same is how a queue silently empties itself.
    if (reason == null || !mounted) return;

    setState(() => _busy = true);
    try {
      final outcome = await ref.read(requestActionsProvider).reject(
            requestId: widget.requestId,
            rejectionReason: reason,
            itemId: null,
          );
      if (!mounted) return;
      setState(() => _outcome = outcome);
      showAppToast(context, message: 'Request rejected.', tone: ToastTone.info);
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _transferConsequence(RequestDetail detail) {
    final parts = <String>[];
    final location = detail.summary.newLocationLine;
    if (location != null) parts.add('move ${detail.item.tagId} to $location');
    if (detail.summary.newOwnerId != null) parts.add('reassign it to the named custodian');
    final action = parts.isEmpty ? 'update ${detail.item.tagId}' : parts.join(' and ');

    return 'This will $action. Any accessory bundled with it moves too, and the change is '
        'recorded in the item\u2019s history.';
  }
}

/// "What changed", straight from the decision response.
///
/// `itemChanges` is server-shaped (a flat map of column to new value), so this shows
/// the field names and their new values rather than re-interpreting the diff — the
/// response is the record of what happened, and paraphrase is how a record turns into
/// a claim.
class _OutcomeCard extends StatelessWidget {
  const _OutcomeCard({required this.outcome});

  final DecideRequestResponse outcome;

  @override
  Widget build(BuildContext context) {
    final approved = outcome.status == RequestStatus.approved;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                approved ? Icons.check_circle_outline : Icons.cancel_outlined,
                size: 20,
                color: approved ? AppColors.success600 : AppColors.danger600,
              ),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: Text(
                  approved ? 'Approved — what changed' : 'Rejected',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          if (outcome.itemChanges.isEmpty)
            const Text(
              'No item fields were changed by this decision.',
              style: TextStyle(fontSize: 13, color: AppColors.aauGray500),
            )
          else
            for (final entry in outcome.itemChanges.entries)
              FieldRow(
                label: _fieldLabel(entry.key),
                value: '${entry.value}',
                layout: FieldLayout.inline,
              ),
          if (outcome.cascadedItemIds.isNotEmpty) ...[
            const SizedBox(height: AppSpace.s2),
            Text(
              '${outcome.cascadedItemIds.length} bundled '
              '${outcome.cascadedItemIds.length == 1 ? 'accessory' : 'accessories'} moved '
              'with it.',
              style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray600, height: 1.5),
            ),
          ],
          const SizedBox(height: AppSpace.s2),
          Text(
            '${outcome.editLogRowCount} history '
            '${outcome.editLogRowCount == 1 ? 'entry' : 'entries'} written.',
            style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
          ),
        ],
      ),
    );
  }

  static String _fieldLabel(String field) => switch (field) {
        'building' => 'Building',
        'floor' => 'Floor',
        'room' => 'Room',
        'ownerId' => 'Owner',
        'status' => 'Status',
        'disposalReason' => 'Disposal reason',
        'disposedAt' => 'Disposed at',
        'parentItemId' => 'Parent item',
        _ => field,
      };
}
