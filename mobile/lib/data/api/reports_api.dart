import '../../core/format.dart';
import '../../models/report.dart';
import '../../core/api/api_client.dart';

/// Report exports (F10) — Staff/Admin, CSV or PDF.
///
/// Every one of these goes through [ApiClient.getBytes], never a bare URL: the
/// endpoints sit behind `authenticate`, so on the web a plain `<a href>` sent no
/// Bearer token and downloaded a 401 body named `.csv`. On mobile the same trap
/// exists in a different shape — `Image.network`/`url_launcher` with a report URL
/// would also arrive unauthenticated — so the bytes are always fetched through the
/// client and then written to a file.
///
/// `format` is a parameter rather than a function per format: the endpoint,
/// filters and filename stem are identical and only the extension differs, so a
/// second function would be a copy that drifts.
class ReportsApi {
  const ReportsApi(this._client);

  final ApiClient _client;

  /// `GET /reports/inventory` — one row per item, disposed items included (F7.2).
  Future<ReportFile> inventory(InventoryReportQuery query, ReportFormat format) =>
      _download(
        '/reports/inventory',
        query.toQuery(),
        format,
        'inventory-report',
      );

  /// `GET /reports/disposals` — one row per *decided* disposal request.
  Future<ReportFile> disposals(DisposalsReportQuery query, ReportFormat format) =>
      _download(
        '/reports/disposals',
        query.toQuery(),
        format,
        'disposals-report',
      );

  /// `GET /reports/audit/:auditId` — works for an in-progress session too (only
  /// `FOUND` rows exist yet), so the report screen offers it before completion.
  Future<ReportFile> audit(String auditId, ReportFormat format) => _download(
        '/reports/audit/${Uri.encodeComponent(auditId)}',
        const {},
        format,
        'audit-report-$auditId',
      );

  Future<ReportFile> _download(
    String path,
    Map<String, dynamic> query,
    ReportFormat format,
    String filenameStem,
  ) async {
    final bytes = await _client.getBytes(
      path,
      query: {...query, 'format': format.wire},
    );
    return ReportFile(
      bytes: bytes,
      filename: '$filenameStem-${todayStampUtc()}.${format.wire}',
      mimeType: format.mimeType,
    );
  }
}
