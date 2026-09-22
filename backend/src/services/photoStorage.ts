/**
 * Item photo uploads — the missing half of `Item.photoUrl` (SRS F3.4).
 *
 * Until now `photoUrl` was a bare string with no upload path anywhere in the
 * API: an operator had to host a photo on some other site and paste its URL,
 * which is the gap the frontend plan recorded as G3 ("no upload endpoint so
 * photos are URLs"). This module is that missing upload. The request's buffer
 * goes to Cloudinary and the value stored on the item is the returned
 * `secure_url`.
 *
 * Cloudinary rather than local disk — which is what the QR tag PNGs use — for
 * one reason: photos are the artefact that has to outlive the process. Vercel's
 * filesystem is read-only apart from `/tmp`, and `/tmp` is per-instance and
 * ephemeral, so a photo written there would 404 for the next visitor and vanish
 * on the next deploy; QR tags tolerate that only because `GET /items/:id/tag`
 * regenerates a missing file from the tag id. There is nothing to regenerate a
 * photo *from*. Cloudinary also returns a CDN URL and does the resizing, which
 * matters for a register whose list view renders four thumbnails per row.
 *
 * Configuration is read per call rather than at module load, the same rule
 * `services/email.ts` follows and for the same reason: a value captured at
 * import time is frozen before a test (or a platform) can set it.
 */

/** Cloudinary's own signal that an upload failed; deliberately not an HttpError. */
export class PhotoUploadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PhotoUploadError";
  }
}

export interface PhotoUploadConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * `null` when the deployment has no Cloudinary credentials.
 *
 * The route turns this into a 503 rather than a 500: "this server cannot do
 * uploads" is a configuration fact an operator can fix, and it must not look
 * like a bug in the request.
 */
export function readPhotoUploadConfig(): PhotoUploadConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

/** Cloudinary folder for every item photo. Keeps the account's root tidy. */
const PHOTO_FOLDER = "cncs-pms/items";

/**
 * Upload one image and resolve with its public HTTPS URL.
 *
 * `public_id` is the item's **tag id**, and `overwrite` is on, so re-photographing
 * an item replaces its image instead of leaving the old one orphaned in the
 * account forever. Tag ids are unique per item and stable across tag
 * regeneration (F3.5 reissues the sticker, not the id), which makes them exactly
 * the right key for this.
 */
export async function uploadItemPhoto(buffer: Buffer, tagId: string): Promise<string> {
  const config = readPhotoUploadConfig();
  if (!config) {
    throw new PhotoUploadError("Photo uploads are not configured");
  }

  // Imported lazily so the SDK is only loaded on the paths that upload, and so a
  // deployment without credentials never pays for it.
  const { v2: cloudinary } = await import("cloudinary");

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: PHOTO_FOLDER,
        public_id: tagId,
        resource_type: "image",
        overwrite: true,
        invalidate: true,
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          // The SDK's error object is not an Error instance, so it is attached
          // as a cause rather than rethrown raw — a thrown non-Error loses its
          // stack and reads as `[object Object]` in the logs.
          reject(new PhotoUploadError("Cloudinary rejected the upload", { cause: error }));
          return;
        }
        resolve(result.secure_url);
      },
    );

    stream.end(buffer);
  });
}
