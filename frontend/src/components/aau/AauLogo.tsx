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
 *
 * At every width the lockup is the crest, the divider and the two-line wordmark
 * — never a truncated crest-only version. What changes on a phone is the
 * wordmark's *scale*, not its content: `tokens.css` steps the pair down below
 * `sm` and holds each line to one (`white-space: nowrap`), so the full Amharic
 * name sits above the full Latin one instead of reflowing into three lines.
 * "SINCE 1950" is the one thing that is genuinely dropped there — it is a third
 * line, and on a phone it costs more height than it earns.
 *
 * `shrink-0` on both the crest and the wordmark is load-bearing: the header is a
 * `justify-between` flex row, and without it the trailing controls squeeze the
 * lockup rather than the lockup pushing back.
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
        className="h-10 w-auto shrink-0 sm:h-12 md:h-[52px]"
      />

      <div className="flex min-h-8 shrink-0 flex-col justify-center border-l-2 border-brand-600 pl-2 sm:min-h-12 sm:pl-4">
        <div>
          {/* Sizes and tracking come from `tokens.css` — see the note there. */}
          <div className="aau-wordmark aau-wordmark-amharic text-brand-600">
            አዲስ አበባ ዩኒቨርሲቲ
          </div>
          <div className="aau-wordmark aau-wordmark-latin font-medium text-accent-600">
            ADDIS ABABA UNIVERSITY
          </div>
        </div>
        <div className="hidden text-[11px] text-aau-gray-900 md:flex">SINCE 1950</div>
      </div>
    </Link>
  );
}
