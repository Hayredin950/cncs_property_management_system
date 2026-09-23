import { Router, type NextFunction, type Response } from "express";
import { httpError } from "../lib/httpError.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  ALLOWED_PHOTO_TYPES,
  PHOTO_FIELD_NAME,
  acceptPhotoUpload,
} from "../middleware/photoUpload.js";
import {
  PhotoUploadError,
  readPhotoUploadConfig,
  uploadPendingPhoto,
} from "../services/photoStorage.js";

export const uploadsRouter: Router = Router();

/**
 * `POST /api/v1/uploads/photo` — Staff/Admin. Stores an image, returns its URL.
 *
 * This exists for the one case `POST /items/:id/photo` cannot serve: a photo
 * chosen **before the item exists**. The item form is one page with two modes,
 * and in `create` mode there is no id to address, so the form uploads first,
 * gets a URL back, and submits that URL as `photoUrl` with the rest of the
 * record. Both modes then behave identically, and `photoUrl` keeps a single
 * writer — the normal create/update path.
 *
 * It is deliberately *not* a second way to attach a photo to an existing item:
 * it never touches an item row and writes no history. Attaching to a row, with
 * the edit-log entry that must accompany it, stays `POST /items/:id/photo`.
 *
 * `multipart/form-data`, image in a field named `photo`, same limits and MIME
 * rules as the item-scoped route (both read them from `middleware/photoUpload`).
 * Authentication matches every other write: the photo is a field of a record,
 * not a public contribution.
 */
uploadsRouter.post(
  "/photo",
  authenticate,
  requireRole(["ADMIN", "STAFF"]),
  acceptPhotoUpload,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Configuration first: a deployment without Cloudinary keys should say so
      // before it has consumed and discarded the caller's upload.
      if (!readPhotoUploadConfig()) {
        res.status(503).json({ error: "Photo uploads are not configured on this server" });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          error: `Attach the image in a form field named \`${PHOTO_FIELD_NAME}\``,
        });
        return;
      }

      if (!ALLOWED_PHOTO_TYPES.has(req.file.mimetype)) {
        res.status(415).json({
          error: `Photo must be a JPEG, PNG, WebP or GIF image (received ${req.file.mimetype})`,
        });
        return;
      }

      const url = await uploadPendingPhoto(req.file.buffer);
      res.status(201).json({ url });
    } catch (err) {
      // An upload failure is upstream, not a bug in the request: 502 says "the
      // thing we depend on did not answer", which is what an operator needs to
      // check the Cloudinary account rather than the request.
      if (err instanceof PhotoUploadError) {
        next(httpError(502, "The photo could not be uploaded"));
        return;
      }
      next(err);
    }
  },
);
