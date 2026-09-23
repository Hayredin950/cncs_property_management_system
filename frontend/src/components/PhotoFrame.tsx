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
export function PhotoFrame({ src, alt, className }: PhotoFrameProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  return (
    <div
      className={cn(
        "flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-slate-100",
        className,
      )}
    >
      {showPlaceholder ? (
        <div className="flex flex-col items-center gap-1.5 text-slate-400" aria-hidden="true">
          {src ? <ImageOff className="h-8 w-8" /> : <Package className="h-8 w-8" />}
          <span className="text-xs">{src ? "Image unavailable" : "No photo"}</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
