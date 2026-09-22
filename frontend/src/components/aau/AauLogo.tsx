import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

/**
 * The AAU header lockup: crest, then a hairline divider, then the two-line
 * wordmark the official site sets in Amharic + Latin, with "SINCE 1950" beneath
 * at `md` and up.
 *
 * Copied from `app/(landing)/layout` on aau.edu.et, including the details that
 * are easy to get subtly wrong and are therefore spelled out in `tokens.css`
 * rather than inlined here:
 *
 *   - the divider is `border-l-2` in AAU blue, not a grey rule;
 *   - the Amharic line is tracked out to `3px` and the Latin line pulled back up
 *     with a negative margin so the two lines read as one lockup at 13–18px;
 *   - the crest is 40px on the smallest screens, 48px at `sm`, 52px at `md`.
 *
 * The crest is the university's real asset (`public/aau/aau-logo.png`, served
 * from aau.edu.et), not a redraw — a redrawn seal is exactly the thing that
 * makes a clone recognisable.
 */
export function AauLogo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="Addis Ababa University — home"
      className={cn("flex items-center gap-2 sm:gap-4", className)}
    >
      <img
        src="/aau/aau-logo.png"
        alt=""
        width={400}
        height={400}
        /* The mark is decorative here: the wrapping link already carries the
           accessible name, so a second announcement of "Addis Ababa University"
           would just be noise. */
        className="h-10 w-auto sm:h-12 md:h-[52px]"
      />

      <div className="flex min-h-8 flex-col justify-center border-l-2 border-brand-600 pl-2 sm:min-h-12 sm:pl-4">
        <div>
          <div className="aau-wordmark aau-wordmark-amharic text-[17px] text-brand-600 sm:text-[18px]">
            አዲስ አበባ ዩኒቨርሲቲ
          </div>
          <div className="aau-wordmark aau-wordmark-latin text-[13px] font-medium text-accent-600 sm:text-[13.5px]">
            ADDIS ABABA UNIVERSITY
          </div>
        </div>
        <div className="hidden text-[11px] text-aau-gray-900 md:flex">SINCE 1950</div>
      </div>
    </Link>
  );
}
