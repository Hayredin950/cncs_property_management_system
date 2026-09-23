import crypto from "crypto";

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
export function uploadItemPhoto(buffer: Buffer, tagId: string): Promise<string> {
  return upload(buffer, tagId, true);
}

/**
 * Upload an image that is not attached to an item yet, and resolve with its URL.
 *
 * This is what the item *form* needs: on `/items/new` there is no row yet, so
 * there is no tag id to key the upload by and no item to attach it to. The URL
 * comes back to the form, which submits it as `photoUrl`, and the ordinary
 * create/update path stores it — so the column still has exactly one writer.
 *
 * `public_id` is random and `overwrite` is off: two people photographing two
 * different new items must not collide, and nothing should be able to replace an
 * existing image without knowing its id.
 *
 * The cost is real and worth naming: if the form is abandoned after the upload,
 * the image stays in the account unreferenced. That is the trade every
 * "upload, then save" form makes, and the alternative — holding the bytes until
 * submit — cannot produce a URL for the preview the user needs to see.
 */
export function uploadPendingPhoto(buffer: Buffer): Promise<string> {
  return upload(buffer, `pending-${crypto.randomUUID()}`, false);
}

async function upload(buffer: Buffer, publicId: string, overwrite: boolean): Promise<string> {
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
        public_id: publicId,
        resource_type: "image",
        overwrite,
        // Only meaningful when replacing an existing public_id; asking the CDN
        // to invalidate a brand-new id is a no-op that still costs a call.
        invalidate: overwrite,
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
