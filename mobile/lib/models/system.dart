import 'json.dart';

/// `GET /system/status` — the build facts an administrator asks for first.
///
/// Deliberately *not* a health check: `GET /health` is the login screen's
/// reachability banner. This is the deeper answer — which environment, which
/// version, how long the instance serving the request has been up, and when the
/// build ran. `builtAt` is null on a deployment that predates the build stamp,
/// and the screen says so instead of inventing a date.
class SystemStatusInfo {
  const SystemStatusInfo({
    required this.environment,
    required this.version,
    required this.uptime,
    required this.database,
    this.startedAt,
    this.builtAt,
  });

  factory SystemStatusInfo.fromJson(Map<String, dynamic> json) => SystemStatusInfo(
    environment: asString(json['environment'], fallback: 'Unknown'),
    version: asString(json['version'], fallback: 'Unknown'),
    uptime: asDouble(json['uptime']),
    database: asString(json['database'], fallback: 'Unknown'),
    startedAt: asStringOrNull(json['startedAt']),
    builtAt: asStringOrNull(json['builtAt']),
  );

  final String environment;
  final String version;

  /// Seconds the instance serving this request has been running. On a serverless
  /// platform a cold start resets it, which is the honest answer: it is about the
  /// instance, not the deployment.
  final double uptime;
  final String database;
  final String? startedAt;
  final String? builtAt;
}

/// `GET /system/events` — one row of the account log.
///
/// The pair of `type` and `message` is on purpose: `type` is the stored action
/// slug (`ACCOUNT_APPROVED`) and `message` is the sentence naming who it happened
/// to, so the list can show a badge and a readable line without re-deriving
/// either from the other.
class SystemEventEntry {
  const SystemEventEntry({
    required this.id,
    required this.type,
    required this.message,
    required this.timestamp,
    this.actorName,
    this.actorEmail,
    this.targetName,
    this.targetEmail,
    this.unit,
    this.authorizedBy,
    this.authorizationRef,
  });

  factory SystemEventEntry.fromJson(Map<String, dynamic> json) {
    final actor = asMap(json['actor']);
    final target = asMap(json['target']);
    return SystemEventEntry(
      id: asString(json['id']),
      type: asString(json['type']),
      message: asString(json['message']),
      timestamp: asString(json['timestamp']),
      actorName: asStringOrNull(actor['fullName']),
      actorEmail: asStringOrNull(actor['email']),
      targetName: asStringOrNull(target['fullName']),
      targetEmail: asStringOrNull(target['email']),
      unit: asStringOrNull(json['unit']),
      authorizedBy: asStringOrNull(json['authorizedBy']),
      authorizationRef: asStringOrNull(json['authorizationRef']),
    );
  }

  final String id;
  final String type;
  final String message;
  final String timestamp;
  final String? actorName;
  final String? actorEmail;
  final String? targetName;
  final String? targetEmail;
  final String? unit;
  final String? authorizedBy;
  final String? authorizationRef;

  /// `ACCOUNT_INVITE_SENT` → `Account invite sent` — the same words the web log
  /// shows, derived here so the phone does not keep a second table of labels.
  String get actionLabel {
    if (type.isEmpty) return 'Event';
    final words = type.toLowerCase().split('_');
    final sentence = words.join(' ');
    return '${sentence[0].toUpperCase()}${sentence.substring(1)}';
  }
}

/// One page of the log, with the total so a pager can say "3 of 12".
class SystemEventsSlice {
  const SystemEventsSlice({
    required this.events,
    required this.total,
    required this.limit,
    required this.offset,
  });

  factory SystemEventsSlice.fromJson(Map<String, dynamic> json) => SystemEventsSlice(
    events: [for (final row in asMapList(json['events'])) SystemEventEntry.fromJson(row)],
    total: asInt(json['total']),
    limit: asInt(json['limit'], fallback: 20),
    offset: asInt(json['offset']),
  );

  final List<SystemEventEntry> events;
  final int total;
  final int limit;
  final int offset;
}

/// `GET /system/statistics` — the shape of the college's register, counts only.
class SystemStatistics {
  const SystemStatistics({
    required this.accounts,
    required this.decisions,
    required this.items,
    required this.requests,
    required this.audits,
  });

  factory SystemStatistics.fromJson(Map<String, dynamic> json) {
    final accounts = asMap(json['accounts']);
    final items = asMap(json['items']);
    final requests = asMap(json['requests']);
    return SystemStatistics(
      accounts: AccountStatistics(
        total: asInt(accounts['total']),
        byStatus: _countMap(accounts['byStatus']),
        perMonth: [
          for (final row in asMapList(accounts['perMonth']))
            MonthCount(month: asString(row['month']), count: asInt(row['count'])),
        ],
      ),
      decisions: [
        for (final row in asMapList(json['decisions']))
          CountRow(
            label: asString(row['action']).toLowerCase().replaceAll('_', ' '),
            count: asInt(row['count']),
          ),
      ],
      items: ItemStatistics(
        total: asInt(items['total']),
        byStatus: _countMap(items['byStatus']),
        byDepartment: [
          for (final row in asMapList(items['byDepartment']))
            CountRow(label: asString(row['name']), count: asInt(row['count'])),
        ],
      ),
      requests: CountStatistics(
        byStatus: _countMap(requests['byStatus']),
        byType: _countMap(requests['byType']),
      ),
      audits: _countMap(asMap(json['audits'])['byType']),
    );
  }

  final AccountStatistics accounts;
  final List<CountRow> decisions;
  final ItemStatistics items;
  final CountStatistics requests;
  final Map<String, int> audits;

  static Map<String, int> _countMap(Object? value) {
    final map = asMap(value);
    return {
      for (final entry in map.entries)
        entry.key.toLowerCase().replaceAll('_', ' '): asInt(entry.value),
    };
  }
}

class AccountStatistics {
  const AccountStatistics({
    required this.total,
    required this.byStatus,
    required this.perMonth,
  });

  final int total;
  final Map<String, int> byStatus;
  final List<MonthCount> perMonth;
}

class ItemStatistics {
  const ItemStatistics({
    required this.total,
    required this.byStatus,
    required this.byDepartment,
  });

  final int total;
  final Map<String, int> byStatus;
  final List<CountRow> byDepartment;
}

class CountStatistics {
  const CountStatistics({required this.byStatus, required this.byType});

  final Map<String, int> byStatus;
  final Map<String, int> byType;
}

/// One labelled count — a bar in a chart, whatever the label names (a status, a
/// department, an action).
class CountRow {
  const CountRow({required this.label, required this.count});

  final String label;
  final int count;
}

/// One month of the six-month growth strip: `2026-05`, and how many accounts
/// were created that month.
class MonthCount {
  const MonthCount({required this.month, required this.count});

  /// `YYYY-MM`, as the API writes it. The chart label is the month alone.
  final String month;
  final int count;

  String get shortLabel => month.length >= 7 ? month.substring(5) : month;
}
