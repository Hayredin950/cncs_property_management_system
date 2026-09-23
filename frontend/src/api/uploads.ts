import { apiClient } from "../lib/apiClient";

/**
 * `POST /uploads/photo` — stores an image and resolves with its CDN URL.
 *
 * Used by the item form, in *both* modes. The item-scoped
 * `POST /items/:id/photo` cannot serve `create`: there is no id yet. Uploading
 * first and submitting the returned URL as `photoUrl` also means both modes
 * behave identically, and the form's Save is what commits the photo — so a
 * cancelled edit leaves nothing behind.
 *
 * The URL is stored as-is: it is Cloudinary's `secure_url`, and the server
 * accepts it because `utils/photoSource.ts` allows an absolute `http(s)` value.
 */
export interface UploadedPhoto {
  url: string;
}

export function uploadPhoto(file: File): Promise<UploadedPhoto> {
  const form = new FormData();
  // The field name is part of the API contract — the route reads `photo`.
  form.append("photo", file);
  return apiClient.postForm<UploadedPhoto>("/uploads/photo", form);
}
