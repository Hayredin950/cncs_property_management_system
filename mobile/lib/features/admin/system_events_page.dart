import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../data/providers/system_provider.dart';
import '../../models/system.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/page_scaffold.dart';
import '../../widgets/states.dart';

/// `/admin/events` — the account log, in full.
///
/// Every decision the system made about an account, with the record behind it:
/// who did it, who it was about, what authority it was made under. The log is
/// append-only — a row here is never edited, only added to — which is why the
/// list is readable rather than merely present.
///
/// Paged rather than infinite-scrolling on purpose: an administrator looking for
/// "the approval from last Tuesday" wants to know where they are, and the pager
/// says "1 of 3" instead of making them scroll until it appears.
class SystemEventsPage extends ConsumerStatefulWidget {
  const SystemEventsPage({super.key});

  @override
  ConsumerState<SystemEventsPage> createState() => _SystemEventsPageState();
}

class _SystemEventsPageState extends ConsumerState<SystemEventsPage> {
  static const _pageSize = 20;

  /// The action slugs the API stores. A picker, not a free-text box: the point
  /// is to find a class of event, and the server filters on the exact slug.
  static const _actions = <String, String>{
    '': 'All actions',
    'ACCOUNT_APPROVED': 'Account approved',
    'ACCOUNT_REJECTED': 'Account declined',
    'ACCOUNT_INVITE_SENT': 'Invite sent',
    'ACCOUNT_INVITE_RESENT': 'Invite resent',
    'ACCOUNT_INVITE_ACCEPTED': 'Invite accepted',
    'ACCOUNT_ESCALATED': 'Escalated',
    'ACCOUNT_DEACTIVATED': 'Account deactivated',
  };

  final _search = TextEditingController();
  String _action = '';
  var _page = 0;
  String? _expandedId;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  SystemEventQuery get _query => SystemEventQuery(
    limit: _pageSize,
    offset: _page * _pageSize,
    action: _action,
    search: _search.text.trim(),
  );

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(systemEventsProvider(_query));

    return PageScaffold(
      title: 'System events',
      subtitle: 'Every decision about an account, newest first \u2014 append-only',
      maxWidth: 900,
      onRefresh: () async {
        ref.invalidate(systemEventsProvider(_query));
        await ref.read(systemEventsProvider(_query).future);
      },
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                label: 'Search',
                controller: _search,
                hint: 'An action, or a person\u2019s name',
                prefixIcon: Icons.search,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => setState(() => _page = 0),
              ),
              const SizedBox(height: AppSpace.stack),
              AppSelectField<String>(
                label: 'Action',
                value: _action,
                options: _actions.keys.toList(),
                labelOf: (value) => _actions[value] ?? value,
                onChanged: (value) => setState(() {
                  _action = value ?? '';
                  _page = 0;
                  _expandedId = null;
                }),
              ),
              const SizedBox(height: AppSpace.s3),
              AppButton(
                label: 'Search the log',
                icon: Icons.search,
                variant: AppButtonVariant.outline,
                expand: true,
                onPressed: () => setState(() {
                  _page = 0;
                  _expandedId = null;
                }),
              ),
            ],
          ),
        ),

        const SizedBox(height: AppSpace.s5),
        events.when(
          loading: () => const SkeletonList(count: 4, height: 82),
          error: (error, _) => InlineError(
            error: error,
            onRetry: () => ref.invalidate(systemEventsProvider(_query)),
          ),
          data: (slice) {
            if (slice.events.isEmpty) {
              return const AppCard(
                child: Text(
                  'Nothing in the log matches what you asked for.',
                  style: TextStyle(fontSize: 13.5, color: AppColors.aauGray500),
                ),
              );
            }

            final pageCount = (slice.total / _pageSize).ceil().clamp(1, 999);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(
                  title: slice.total == 1 ? '1 event' : '${slice.total} events',
                  subtitle: 'Tap a row for who it concerned and the authority behind it.',
                ),
                for (final event in slice.events) ...[
                  _EventCard(
                    event: event,
                    expanded: event.id == _expandedId,
                    onTap: () => setState(
                      () => _expandedId = _expandedId == event.id ? null : event.id,
                    ),
                  ),
                  const SizedBox(height: AppSpace.s2),
                ],
                const SizedBox(height: AppSpace.s3),
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        label: 'Previous',
                        icon: Icons.chevron_left,
                        variant: AppButtonVariant.outline,
                        onPressed: _page == 0
                            ? null
                            : () => setState(() {
                                _page -= 1;
                                _expandedId = null;
                              }),
                      ),
                    ),
                    const SizedBox(width: AppSpace.s2),
                    Expanded(
                      child: Column(
                        children: [
                          Text(
                            'Page ${_page + 1} of $pageCount',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 12.5,
                              color: AppColors.aauGray600,
                            ),
                          ),
                          Text(
                            '${slice.offset + 1}\u2013'
                            '${(slice.offset + slice.events.length)} of ${slice.total}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.aauGray400,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpace.s2),
                    Expanded(
                      child: AppButton(
                        label: 'Next',
                        icon: Icons.chevron_right,
                        variant: AppButtonVariant.outline,
                        onPressed: _page + 1 >= pageCount
                            ? null
                            : () => setState(() {
                                _page += 1;
                                _expandedId = null;
                              }),
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, required this.expanded, required this.onTap});

  final SystemEventEntry event;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s3),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.actionLabel,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      event.message,
                      style: const TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: AppColors.aauGray600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (event.actorName != null) 'by ${event.actorName}',
                        formatRelativeTime(event.timestamp),
                      ].join(' \u00b7 '),
                      style: const TextStyle(fontSize: 11.5, color: AppColors.aauGray400),
                    ),
                  ],
                ),
              ),
              Icon(
                expanded ? Icons.expand_less : Icons.expand_more,
                size: 20,
                color: AppColors.aauGray400,
              ),
            ],
          ),
          if (expanded) ...[
            const Divider(height: AppSpace.s4),
            _Detail(label: 'When', value: formatDateTimeUtc(event.timestamp) ?? '\u2014'),
            if (event.actorEmail != null)
              _Detail(label: 'Actor', value: '${event.actorName} \u00b7 ${event.actorEmail}'),
            if (event.targetName != null)
              _Detail(
                label: 'Account',
                value: event.targetEmail == null
                    ? event.targetName!
                    : '${event.targetName} \u00b7 ${event.targetEmail}',
              ),
            if (event.unit != null) _Detail(label: 'Unit', value: event.unit!),
            if (event.authorizedBy != null)
              _Detail(label: 'Authorized by', value: event.authorizedBy!),
            if (event.authorizationRef != null)
              _Detail(label: 'Reference', value: event.authorizationRef!),
          ],
        ],
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label.toUpperCase(),
              style: const TextStyle(
                fontSize: 10,
                letterSpacing: 0.5,
                color: AppColors.aauGray400,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray700),
            ),
          ),
        ],
      ),
    );
  }
}
