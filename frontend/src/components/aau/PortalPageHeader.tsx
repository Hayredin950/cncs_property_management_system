import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

/**
 * The page-title banner the AAU student portal puts at the top of every screen
 * ("Welcome to AAU Student Portal!! Entry Students"): a bordered box on a light
 * grey-blue wash, the page's own title set large and bold in AAU blue, and a
 * short supporting line beneath it.
 *
 * It is a separate component from `Card` because the two are structurally
 * different, not cosmetically: this is a *header*, so it owns the page's `<h1>`
 * and must render exactly one. Keeping the title in its own element (rather than
 * letting callers pass a block) is what guarantees the accessible name of that
 * heading stays the title alone — which the route-level tests assert on.
 */
export interface PortalPageHeaderProps {
  /** The page's `<h1>`. Rendered verbatim as the heading's accessible name. */
  title: string;
  description?: string;
  /** Right-aligned actions, wrapped onto their own line on narrow screens. */
  actions?: ReactNode;
  className?: string;
}

export function PortalPageHeader({ title, description, actions, className }: PortalPageHeaderProps) {
  return (
    <div
      className={cn(
        "rounded-sm border border-aau-gray-300 bg-gradient-to-b from-white via-aau-gray-50 to-aau-gray-200 px-4 py-3 shadow-sm sm:px-5 sm:py-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-brand-800 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-aau-gray-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * One of the portal's action tiles: a saturated blue card with a circular icon
 * well and a gold heading over white supporting text. Used for the dashboard's
 * "where do I go next" row, which is the same job the portal's Student Profile /
 * My Dormitory / My Section / Registration Procedure tiles do.
 *
 * A link-shaped tile rather than a `<Card>` with a link inside: the whole tile is
 * the target, which is the point of the pattern — these are the biggest touch
 * targets on the screen (§12). Routed through `Link`, not a raw `<a href>`: a
 * bare anchor would take a full page reload and throw away the query cache.
 */
export interface PortalTileProps {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
}

export function PortalTile({ to, icon, title, description }: PortalTileProps) {
  return (
    <Link
      to={to}
      className="flex items-start gap-4 rounded-md bg-brand-400 p-4 shadow-md transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-700"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/25 text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-aau-yellow">{title}</span>
        <span className="mt-0.5 block text-sm text-white">{description}</span>
      </span>
    </Link>
  );
}
