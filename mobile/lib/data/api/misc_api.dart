import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../../core/api/api_client.dart';
import '../../models/json.dart';

/// `GET /health` — unauthenticated, fixed `{ "status": "ok" }`. Enough to tell
/// "the API is reachable" from "it isn't", and nothing more; it is what the login
/// screen's connection banner reads.
class SystemApi {
  const SystemApi(this._client);

  final ApiClient _client;

  Future<bool> healthy() async {
    final json = await _client.get<Map<String, dynamic>>('/health');
    return asString(json['status']) == 'ok';
  }
}

/// `POST /uploads/photo` — stores an image and resolves with its CDN URL.
///
/// Used by the item form in **both** modes. Uploading first and submitting the
/// returned URL as `photoUrl` means create and edit behave identically, and the
/// form's Save is what commits the photo — so a cancelled edit leaves nothing
/// behind. That is the same choice the web form made.
class UploadsApi {
  const UploadsApi(this._client);

  final ApiClient _client;

  /// The field name `photo` is part of the API contract — the route reads it.
  /// The content type is set explicitly because multer validates the image type;
  /// without it the server sees `application/octet-stream` and refuses the file.
  Future<String> uploadPhoto({
    required List<int> bytes,
    required String filename,
    required String mimeType,
  }) async {
    final form = FormData.fromMap({
      'photo': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: MediaType.parse(mimeType),
      ),
    });
    final json = await _client.postMultipart<Map<String, dynamic>>('/uploads/photo', form);
    return asString(json['url']);
  }

  /// `DELETE /uploads/photo` — destroys an already-uploaded image by URL.
  ///
  /// Called when a photo was uploaded for the form and then removed or replaced
  /// before saving. **Best-effort**: a failure here never blocks the form, and a
  /// URL outside the app's own Cloudinary folder answers `deleted: false` rather
  /// than an error.
  Future<bool> deletePhoto(String url) async {
    final json = await _client.delete<Map<String, dynamic>>(
      '/uploads/photo',
      body: {'url': url},
    );
    return asBool(json['deleted']);
  }
}
