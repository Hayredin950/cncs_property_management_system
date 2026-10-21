import { ImageOff, Package } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";

export interface PhotoFrameProps {
  // `| undefined` (not just `?`) because callers forward `item.photoUrl`, which
  // is `string | null | undefined` — exactOptionalPropertyTypes treats an
  // explicit undefined as a different type than an absent prop.
  src?: string | null | undefined;
  alt: string;
  className?: string | undefined;
  /**
   * A picture to show when the item's own will not load.
   *
   * A dead link is common: an upload that was made against a previous
   * deployment, a photo that was deleted from the bucket, a path from an older
   * seed. The frame showed "Image unavailable" — a grey box that says nothing
   * about the item. With a fallback the reader gets a picture of *something*
   * like it, which is what a person looking for a laptop needs.
   */
  fallbackSrc?: string | null | undefined;
}

/**
 * Fixed 4:3 frame around `photoUrl` (frontend-design-system.md §8). `photoUrl` is
 * still just a string — it may have been uploaded through `POST /uploads/photo`,
 * pasted as an external link, or written by the seed script — so a dead link is
 * an expected case, not an exceptional one, and this never renders the browser's
 * broken-image icon.
 *
 * Falls back to a generic placeholder rather than a per-category icon:
 * categories are open-ended, admin-created strings (`POST /categories`), not a
 * fixed enum this component could map reliably.
 */
export function PhotoFrame({ src, alt, className, fallbackSrc }: PhotoFrameProps) {
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  
  /**
   * A site-relative path is resolved against **this app's** origin, not the
   * API's.
   *
   * The demo photos live in the frontend's `public/photos/` and are therefore
   * served by the web app; the API serves `/api/v1/…`. Resolving `/photos/
   * laptop.jpg` against the API produced
   * `…/api/v1/photos/laptop.jpg`, which 404s — so every seeded item showed
   * "Image unavailable" while the very same files were sitting in the app's own
   * public folder. A full URL (a Cloudinary upload, say) is used as it is.
   */
  const resolvedSrc =
    src && !src.startsWith("http")
      ? `${typeof window === "undefined" ? "" : window.location.origin}${src.startsWith("/") ? "" : "/"}${src}`
      : src;
  
  // The fallback is a site-relative path too — the same origin rule.
  const resolvedFallback =
    fallbackSrc && !fallbackSrc.startsWith("http")
      ? `${typeof window === "undefined" ? "" : window.location.origin}${fallbackSrc.startsWith("/") ? "" : "/"}${fallbackSrc}`
      : fallbackSrc;

  // The fallback stands in for a **missing** photo as well as a broken one.
  // "No photo" is an honest answer about a record, but a register where a
  // reader has to guess what a thing looks like is a register nobody can scan.
  const useFallback = Boolean(resolvedFallback) && (!resolvedSrc || failed);

  const showPlaceholder = !useFallback && (!resolvedSrc || failed);

  return (
    <div
      className={cn(
        "flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-slate-100",
        className,
      )}
    >
      {useFallback && !fallbackFailed ? (
        <img
          src={resolvedFallback ?? undefined}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFallbackFailed(true)}
        />
      ) : showPlaceholder ? (
        <div className="flex flex-col items-center gap-1.5 text-slate-400" aria-hidden="true">
          {resolvedSrc ? <ImageOff className="h-8 w-8" /> : <Package className="h-8 w-8" />}
          <span className="text-xs">{resolvedSrc ? "Image unavailable" : "No photo"}</span>
        </div>
      ) : (
        <img
          src={resolvedSrc ?? undefined}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
