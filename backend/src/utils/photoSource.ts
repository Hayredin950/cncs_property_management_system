/**
 * What counts as an acceptable `Item.photoUrl`.
 *
 * Two shapes, and both are real:
 *
 *   - an **absolute** `http(s)` URL — what Cloudinary returns after an upload,
 *     and what an operator pastes when the photo is already hosted somewhere;
 *   - a **site-relative** path beginning with a single `/` — what the seeded
 *     demo photos use (`/photos/desk.jpg`, served from the frontend's own
 *     `public/`). Baking the dev host into the column would 404 the moment the
 *     app moved, the same way a changed `PUBLIC_BASE_URL` kills every printed
 *     QR sticker.
 *
 * `//host/path` is rejected deliberately: a browser reads that as
 * protocol-relative, i.e. as *another* host, which is not a local path at all.
 *
 * This mirrors `isPhotoSource` in the frontend form. The duplication is
 * deliberate — the server has to enforce it regardless of what the client
 * validates, and a shared package for one predicate would be heavier than the
 * predicate.
 */
export function isPhotoSource(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
