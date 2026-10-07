import 'dart:typed_data';

import 'enums.dart';

/// `frontend/src/types/report.ts`.
///
/// Every export supports CSV and PDF; `?format=` anything else is a 400, not a
/// silent JSON fallback (F10.2). Dates are sent as `YYYY-MM-DD` strings and the
/// server parses them as UTC, with `dateTo` covering the whole UTC day — which is
/// why every date control in the reports UI is labelled UTC. A bare range would
/// otherwise lose or gain a day depending on the device's timezone.

enum ReportFormat {
  csv('csv', 'text/csv'),
  pdf('pdf', 'application/pdf');

  const ReportFormat(this.wire, this.mimeType);

  final String wire;
  final String mimeType;

  String get label => name.toUpperCase();
}

class InventoryReportQuery {
  const InventoryReportQuery({
    this.department,
    this.categoryId,
    this.status,
    this.dateFrom,
    this.dateTo,
  });

  final String? department;
  final String? categoryId;
  final ItemStatus? status;
  final String? dateFrom;
  final String? dateTo;

  Map<String, dynamic> toQuery() => {
        if (department != null && department!.isNotEmpty) 'department': department,
        if (categoryId != null && categoryId!.isNotEmpty) 'categoryId': categoryId,
        if (status != null && status != ItemStatus.unknown) 'status': status!.wire,
        if (dateFrom != null && dateFrom!.isNotEmpty) 'dateFrom': dateFrom,
        if (dateTo != null && dateTo!.isNotEmpty) 'dateTo': dateTo,
      };
}

class DisposalsReportQuery {
  const DisposalsReportQuery({this.department, this.dateFrom, this.dateTo});

  final String? department;
  final String? dateFrom;
  final String? dateTo;

  Map<String, dynamic> toQuery() => {
        if (department != null && department!.isNotEmpty) 'department': department,
        if (dateFrom != null && dateFrom!.isNotEmpty) 'dateFrom': dateFrom,
        if (dateTo != null && dateTo!.isNotEmpty) 'dateTo': dateTo,
      };
}

/// A downloaded export and the name it should be saved under.
///
/// The name is built client-side, mirroring the server's `todayStamp()`, rather
/// than parsed out of `Content-Disposition` — one less header for every caller to
/// deal with, and the two agree by construction.
class ReportFile {
  const ReportFile({required this.bytes, required this.filename, required this.mimeType});

  final Uint8List bytes;
  final String filename;
  final String mimeType;

  int get sizeBytes => bytes.lengthInBytes;
}
