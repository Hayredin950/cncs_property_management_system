import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Where a downloaded report or QR tag goes, and what the user can then do with it.
///
/// The web app hands a `Blob` to an `<a download>` and the browser takes over. There
/// is no such thing on a phone, so this file is the equivalent, and it makes one
/// deliberate choice: **files land in the app's own documents directory**, never in
/// the shared `/Downloads`. Writing to shared storage needs `WRITE_EXTERNAL_STORAGE`
/// on older Android and a MediaStore dance on newer, for no benefit — because the
/// thing a user actually wants at the end of "Download CSV" is to *send it somewhere*
/// or *open it now*, and both of those are one tap away through the OS share sheet.
/// Storing a copy in a folder they will never browse adds a permission prompt and
/// removes nothing.
class SavedFile {
  const SavedFile({required this.path, required this.filename, required this.mimeType});

  final String path;
  final String filename;
  final String mimeType;

  File get file => File(path);
}

/// Writes [bytes] under the app's documents directory, in a `Downloads/`
/// subfolder so a user who *does* browse the app's files finds them grouped.
///
/// An existing file of the same name is overwritten: report filenames already carry
/// today's UTC date, so "run the inventory report twice" should leave one file, not
/// `inventory-2026-10-07 (2).csv`.
Future<SavedFile> saveBytes({
  required List<int> bytes,
  required String filename,
  required String mimeType,
}) async {
  final root = await getApplicationDocumentsDirectory();
  final directory = Directory('${root.path}/Downloads');
  if (!await directory.exists()) {
    await directory.create(recursive: true);
  }

  final target = File('${directory.path}/$filename');
  await target.writeAsBytes(
    bytes is Uint8List ? bytes : Uint8List.fromList(bytes),
    flush: true,
  );

  return SavedFile(path: target.path, filename: filename, mimeType: mimeType);
}

/// Opens the OS share sheet for a saved file.
///
/// [origin] anchors the sheet on iPad/Mac, where an unanchored popover lands in the
/// middle of the screen; passing the button's rect is the difference between a sheet
/// that looks attached to the tap and one that looks like a bug.
Future<bool> shareFile(
  SavedFile file, {
  Rect? origin,
  String? subject,
  String? text,
}) async {
  final result = await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path, mimeType: file.mimeType)],
      subject: subject,
      text: text,
      sharePositionOrigin: origin,
    ),
  );
  // `unavailable` means the platform could not report an outcome (not a failure),
  // so anything other than the user actively dismissing counts as handled.
  return result.status != ShareResultStatus.dismissed;
}

/// Hands the file to the platform's opener. Callers usually only care whether the
/// result's `type` is `ResultType.done`.
Future<OpenResult> openFile(SavedFile file) => OpenFilex.open(file.path);

/// Apple's Quick Look and Android's intent resolver both guess the type from the
/// extension, but an explicit MIME type is what makes a `.csv` open in a spreadsheet
/// app rather than a text editor.
String mimeTypeFor(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
