import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/providers/requests_provider.dart';
import '../../models/enums.dart';
import '../../models/request.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/data_display.dart';
import '../../widgets/media.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';
import '../../widgets/status_badges.dart';

/// `/requests` — the queue (§10.7).
///
/// The **server** scopes this list: a staff member sees their own requests, an
/// admin sees every request. This screen sends no user id and never re-implements
/// that rule — the `mine` toggle is an *additional* narrowing filter, present only
/// for an admin, for whom "all requests" is a large and unhelpful default.
///
/// There is deliberately **no sort control**. The API sorts `status asc, createdAt
/// desc` — pending first, newest first — which is already the order the queue should
/// be worked in; a client-side sort arrow would only reorder the current page and
/// quietly lie about the whole result set.
class RequestsListPage extends ConsumerWidget {
  const RequestsListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(requestQueryProvider);
    final requests = ref.watch(requestListProvider);
    final isAdmin = ref.watch(isAdminProvider);

    return PageScaffold(
      title: 'Requests',
      subtitle: isAdmin ? 'Everything filed against the register' : 'Your requests',
      maxWidth: 900,
      padBottom: 96,
      trailing: AppIconButton(
        icon: Icons.add,
        tooltip: 'File a new request',
        variant: AppButtonVariant.primary,
        onPressed: () => context.push('/requests/new'),
      ),
      onRefresh: () async {
        ref.invalidate(requestListProvider);
        await ref.read(requestListProvider.future);
      },
      children: [
        _StatusFilter(
          value: query.status,
          onChanged: (value) => ref.read(requestQueryProvider.notifier).setStatus(value),
        ),
        const SizedBox(height: AppSpace.s3),
        Wrap(
          spacing: AppSpace.s2,
          runSpacing: AppSpace.s2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final type in [RequestType.transfer, RequestType.disposal])
              _TypeToggle(
                type: type,
                active: query.type == type.wire,
                onTap: () => ref
                    .read(requestQueryProvider.notifier)
                    .setType(query.type == type.wire ? null : type.wire),
              ),
            if (isAdmin)
              _TypeToggle(
                label: 'Only mine',
                icon: Icons.person_outline,
                active: query.mine,
                onTap: () => ref.read(requestQueryProvider.notifier).setMine(!query.mine),
              ),
            if (query.status != null || query.type != null || query.mine)
              AppButton(
                label: 'Clear',
                variant: AppButtonVariant.outline,
                size: AppButtonSize.sm,
                icon: Icons.filter_alt_off_outlined,
                onPressed: () => ref.read(requestQueryProvider.notifier).reset(),
              ),
          ],
        ),
        const SizedBox(height: AppSpace.s5),

        requests.when(
          loading: () => const SkeletonList(count: 4, height: 116),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(requestListProvider),
          ),
          data: (response) {
            if (response.requests.isEmpty) {
              final filtered = query.status != null || query.type != null || query.mine;
              return filtered
                  ? EmptyState(
                      icon: Icons.filter_alt_off_outlined,
                      title: 'Nothing matches these filters',
                      body: 'No request in this queue has that status and type.',
                      actionLabel: 'Clear filters',
                      onAction: () => ref.read(requestQueryProvider.notifier).reset(),
                    )
                  : const EmptyState(
                      icon: Icons.assignment_outlined,
                      title: 'Nothing waiting on you',
                      body: 'New requests will show up here.',
                    );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(
                  title: '${response.total} '
                      '${response.total == 1 ? 'request' : 'requests'}',
                  subtitle: 'Pending first, then newest.',
                ),
                for (final request in response.requests) ...[
                  _RequestCard(
                    request: request,
                    onTap: () => context.push('/requests/${request.id}'),
                  ),
                  const SizedBox(height: AppSpace.stack),
                ],
                PaginationBar(
                  page: response.limit == 0 ? 1 : (response.offset ~/ response.limit) + 1,
                  totalPages: response.limit == 0
                      ? 1
                      : ((response.total + response.limit - 1) ~/ response.limit).clamp(1, 9999),
                  onPageChanged: (page) => ref
                      .read(requestQueryProvider.notifier)
                      .setOffset((page - 1) * response.limit),
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// A segmented filter over the three statuses plus "All".
class _StatusFilter extends StatelessWidget {
  const _StatusFilter({required this.value, required this.onChanged});

  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    const options = <(String?, String)>[
      (null, 'All'),
      ('PENDING', 'Pending'),
      ('APPROVED', 'Approved'),
      ('REJECTED', 'Rejected'),
    ];

    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpace.s2),
        itemBuilder: (context, index) {
          final (wire, label) = options[index];
          final active = value == wire;
          return _TypeToggle(
            label: label,
            active: active,
            onTap: () => onChanged(wire),
          );
        },
      ),
    );
  }
}

class _TypeToggle extends StatelessWidget {
  const _TypeToggle({
    this.type,
    this.label,
    this.icon,
    required this.active,
    required this.onTap,
  });

  final RequestType? type;
  final String? label;
  final IconData? icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = label ?? type?.label ?? '';

    return Material(
      color: active ? AppColors.brand600 : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        side: BorderSide(color: active ? AppColors.brand600 : AppColors.aauGray300),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (type != null) ...[
                Icon(
                  type == RequestType.transfer
                      ? Icons.swap_horiz_outlined
                      : Icons.delete_outline,
                  size: 15,
                  color: active ? Colors.white : AppColors.aauGray600,
                ),
                const SizedBox(width: 5),
              ] else if (icon != null) ...[
                Icon(icon, size: 15, color: active ? Colors.white : AppColors.aauGray600),
                const SizedBox(width: 5),
              ],
              Text(
                text,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                  color: active ? Colors.white : AppColors.aauGray700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One request row: type, item, requester, status, and *how long ago* — because
/// "how long has this been waiting" is the question a queue exists to answer.
class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request, required this.onTap});

  final RequestSummary request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                request.type == RequestType.transfer
                    ? Icons.swap_horiz_outlined
                    : Icons.delete_outline,
                size: 20,
                color: request.type == RequestType.transfer
                    ? AppColors.info600
                    : AppColors.orange600,
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.item.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 2),
                    TagIdText(tagId: request.item.tagId, fontSize: 11.5),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              RequestStatusBadge(status: request.status, dense: true),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          const Divider(height: 1),
          const SizedBox(height: AppSpace.s3),
          Row(
            children: [
              InitialsAvatar(initial: _initial(request.requestedBy.fullName), size: 26),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: Text(
                  request.requestedBy.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray600),
                ),
              ),
              Text(
                formatRelativeTime(request.createdAt),
                style: const TextStyle(fontSize: 12, color: AppColors.aauGray500),
              ),
            ],
          ),
          if (request.newLocationLine != null) ...[
            const SizedBox(height: AppSpace.s2),
            Row(
              children: [
                const Icon(Icons.place_outlined, size: 14, color: AppColors.aauGray400),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    'to ${request.newLocationLine}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray600),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _initial(String name) => name.trim().isEmpty ? '?' : name.trim().substring(0, 1);
}
