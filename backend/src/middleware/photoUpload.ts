import type { NextFunction, Request, Response } from "express";
import multer from "multer";

/**
 * The multipart acceptance rules for a photo, in one place.
 *
 * Two routes take an image — `POST /items/:id/photo` (attach to an existing
 * item) and `POST /uploads/photo` (store an image and hand back its URL, which
 * is what a *new* item needs) — and they must accept exactly the same files.
 * Duplicating the size limit or the type list would let the two drift, and the
 * symptom of a drift is an upload that works on one screen and 415s on another
 * for no reason the user can see.
 */

/** 5 MB: comfortably above a phone photo, well under a serverless body limit. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * MIME types accepted for a photo. Checked against the *declared* type rather
 * than the bytes, which is why the list is short and the files are not served
 * from our own origin: the value ends up as an `<img src>` pointing at
 * Cloudinary's CDN, so a mislabelled file cannot execute in the app's origin.
 */
export const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** The form field the image must arrive in — part of the API contract. */
export const PHOTO_FIELD_NAME = "photo";

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
});

/**
 * Run multer, then translate its own failures into this API's status codes.
 * Without this an oversized upload reaches the central error handler as a bare
 * `MulterError` and comes back as a 500 — "the server is broken" for what is
 * plainly a client mistake.
 */
export function acceptPhotoUpload(req: Request, res: Response, next: NextFunction): void {
  photoUpload.single(PHOTO_FIELD_NAME)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? "Photo must be 5 MB or smaller"
          : `Photo upload rejected: ${err.code}`,
      });
      return;
    }
    next(err);
  });
}
