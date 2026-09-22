import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isNavMenu, type AauNavEntry, type AauNavMenu } from "../../app/aauNav";
import { cn } from "../../lib/cn";
import { AauHomeIcon, AauSearchIcon } from "./aauIcons";
import { AauLogo } from "./AauLogo";

/**
 * The AAU official-site header.
 *
 * Rebuilt from the real thing: `aau.edu.et`'s own `app/(landing)/layout` renders
 * a sticky white bar on a `shadow-md` with a `gray-line` hairline bottom border,
 * `px-5 py-2 md:py-[7px]`, the logo lockup on the left, and on the right a home
 * icon, then the drop-down triggers, then a divider and a search toggle.
 * Class-for-class the same here.
 *
 * Behaviour that upstream gets from Radix is hand-rolled (adding Radix for one
 * header would be a dependency nothing else in the app uses):
 *
 *   - hover opens a panel, click toggles it, `Escape` and outside-clicks close;
 *   - opening one panel closes the others (Radix's default "single value" mode);
 *   - a route change closes everything.
 *
 * That last one is worth explaining, because the obvious implementation is the
 * one thing here that is *not* copied from upstream. aau.edu.et resets its menu
 * state from `useEffect(..., [pathname])`; this header instead tags its panel
 * state with the route it was recorded on and derives "closed" from a path
 * mismatch (`stale` below). Same observable behaviour, no setState-in-effect
 * cascade, and — the reason it matters — no `key={pathname}` remount, which
 * would drop keyboard focus out of the header on every navigation.
 */
export interface AauHeaderProps {
  entries: AauNavEntry[];
  /** Where the home icon points. Defaults to the public landing page. */
  home?: string;
  /** Where the header search sends its query. Defaults to the public item register. */
  onSearch?: (query: string) => void;
  /** Trailing controls: sign-in button, user chip, sign-out. */
  actions?: ReactNode;
  /** Optional count badge shown on the home button — the pending-review queue. */
  homeBadge?: number;
}

const SEARCH_PLACEHOLDER = "Search the property register…";

interface PanelState {
  /** The route this panel state belongs to. */
  path: string;
  menu: string | null;
  search: boolean;
  mobile: boolean;
}

type PanelFlags = Pick<PanelState, "menu" | "search" | "mobile">;

/** The all-closed default, for the three flags a caller ever updates. */
const CLOSED_PANEL: PanelFlags = { menu: null, search: false, mobile: false };

export function AauHeader({
  entries,
  home = "/",
  onSearch,
  actions,
  homeBadge,
}: AauHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<PanelState>({
    path: location.pathname,
    ...CLOSED_PANEL,
  });
  const [query, setQuery] = useState("");
  const headerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const panelIdBase = useId();

  // See the file comment: a panel recorded on a previous route reads as closed.
  const stale = panel.path !== location.pathname;
  const openMenu = stale ? null : panel.menu;
  const searchOpen = !stale && panel.search;
  const mobileOpen = !stale && panel.mobile;

  function updatePanel(next: Partial<PanelFlags>) {
    setPanel((previous) => ({
      ...(previous.path === location.pathname ? previous : { path: location.pathname, ...CLOSED_PANEL }),
      ...next,
      path: location.pathname,
    }));
  }

  // Outside-click close. Bound to the whole header rather than only the open
  // panel so clicking a *different* trigger is handled by that trigger's own
  // onClick (toggle) instead of being swallowed here. The functional setter
  // keeps this effect's dependency list to the two booleans it actually reads.
  useEffect(() => {
    if (!openMenu && !searchOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (headerRef.current?.contains(event.target as Node)) return;
      setPanel((previous) => ({ ...previous, menu: null, search: false }));
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu, searchOpen]);

  useEffect(() => {
    if (!openMenu && !searchOpen && !mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPanel((previous) => ({ ...previous, ...CLOSED_PANEL }));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openMenu, searchOpen, mobileOpen]);

  // Focus the field once the panel is in the DOM — otherwise the toggle costs a
  // user an extra click and the panel reads as inert to a keyboard user.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // The mobile drawer is a full-screen overlay; lock the page behind it the same
  // way upstream does (`document.body.style.overflow = "hidden"`).
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (onSearch) {
      onSearch(trimmed);
    } else {
      // Same destination the public browse page's own search box uses, so a
      // header search and an in-page search produce the same URL.
      navigate(`/items?search=${encodeURIComponent(trimmed)}`);
    }
    setQuery("");
    updatePanel({ search: false });
  }

  return (
    <header ref={headerRef} className="sticky top-0 z-50">
      <nav
        aria-label="University"
        className="flex items-center justify-between gap-3 border-b border-aau-gray-line bg-white px-3 py-2 text-[14px] shadow-md sm:px-5 md:py-[7px]"
      >
        <AauLogo />

        {/* ---------- Desktop: home, menus, search toggle ---------- */}
        <div className="hidden w-max items-center gap-x-[5px] lg:flex">
          <Link to={home} aria-label="Home" className="flex flex-row items-center">
            <span
              className={cn(
                "relative cursor-pointer rounded-lg px-2 py-2 hover:bg-aau-gray-100",
                location.pathname === home && "bg-aau-gray-100",
              )}
            >
              <AauHomeIcon className="h-6 w-6 text-aau-gray-500" />
              {homeBadge !== undefined && homeBadge > 0 && (
                <span
                  aria-label={`${homeBadge} pending requests`}
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white"
                >
                  {homeBadge}
                </span>
              )}
            </span>
          </Link>

          {/* Upstream fades the menu list out while the search bar is open. */}
          {!searchOpen && (
            <ul className="m-0 flex list-none items-center p-0">
              {entries.map((entry) =>
                isNavMenu(entry) ? (
                  <li key={entry.label}>
                    <DesktopMenu
                      menu={entry}
                      panelId={`${panelIdBase}-${entry.label}`}
                      open={openMenu === entry.label}
                      onToggle={() =>
                        updatePanel({ menu: openMenu === entry.label ? null : entry.label })
                      }
                      onHover={() => {
                        if (openMenu !== entry.label) updatePanel({ menu: entry.label });
                      }}
                    />
                  </li>
                ) : (
                  <li key={entry.label}>
                    <Link
                      to={entry.to}
                      className="block px-4 py-2 text-aau-gray-800 transition-colors hover:bg-brand-50"
                    >
                      {entry.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}

          <button
            type="button"
            onClick={() => updatePanel({ search: !searchOpen })}
            aria-expanded={searchOpen}
            aria-label={searchOpen ? "Close search" : "Search the property register"}
            className={cn(
              "flex cursor-pointer items-center justify-center border-l-2 border-aau-gray-line p-2 transition-all duration-150 ease-in-out hover:bg-aau-gray-100",
              searchOpen ? "opacity-0" : "opacity-100",
            )}
          >
            <AauSearchIcon className="h-6 w-6 text-aau-gray-600" />
          </button>
        </div>

        {/* ---------- Right-hand controls ---------- */}
        <div className="flex items-center gap-2">
          {actions}

          <button
            type="button"
            onClick={() => updatePanel({ mobile: true })}
            aria-expanded={mobileOpen}
            aria-label="Open menu"
            className="flex items-center rounded-lg p-2 text-aau-gray-600 hover:bg-aau-gray-100 lg:hidden"
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {/*
          Sliding search panel, positioned as upstream does. Rendered only while
          open: leaving it mounted at `w-0 opacity-0` would keep a width-less
          input in the accessibility tree and the tab order on every page — the
          animation is not worth a phantom search field.
        */}
        {searchOpen && (
          <div className="absolute right-5 z-10 flex w-[738px] max-w-[calc(100%-2.5rem)] items-center gap-2 overflow-hidden rounded-sm border border-aau-gray-line bg-aau-gray-100">
            <div className="flex w-full items-center gap-2">
              <span className="p-2 pl-3">
                <AauSearchIcon className="h-6 w-6 flex-shrink-0 text-aau-gray-600" />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                }}
                placeholder={SEARCH_PLACEHOLDER}
                aria-label={SEARCH_PLACEHOLDER}
                className="w-full border-none bg-transparent text-[17px] leading-6 outline-none focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => updatePanel({ search: false })}
              aria-label="Close search"
              className="flex items-center justify-center p-2 text-aau-gray-600 transition-all duration-150 ease-in-out hover:bg-aau-gray-100"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        )}
      </nav>

      {/* ---------- Mobile drawer ---------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-white lg:hidden">
          <div className="flex items-center justify-between border-b border-aau-gray-line px-3 py-2">
            <AauLogo />
            <button
              type="button"
              onClick={() => updatePanel({ mobile: false })}
              aria-label="Close menu"
              className="rounded-lg p-2 text-aau-gray-600 hover:bg-aau-gray-100"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="h-[calc(100%-64px)] overflow-y-auto px-4 pb-16 pt-4">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label={SEARCH_PLACEHOLDER}
              className="h-12 w-full rounded-sm border border-aau-gray-300 px-3 text-base focus:border-brand-600 focus:outline-none"
            />

            <nav aria-label="Mobile" className="mt-4 flex flex-col gap-1">
              <Link
                to={home}
                className="flex items-center gap-2 rounded-sm px-2 py-3 font-medium text-aau-gray-800 hover:bg-brand-50"
              >
                <AauHomeIcon className="h-5 w-5" /> Home
              </Link>

              {entries.map((entry) =>
                isNavMenu(entry) ? (
                  <MobileMenu key={entry.label} menu={entry} />
                ) : (
                  <Link
                    key={entry.label}
                    to={entry.to}
                    className="rounded-sm px-2 py-3 font-medium text-aau-gray-800 hover:bg-brand-50"
                  >
                    {entry.label}
                  </Link>
                ),
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

interface DesktopMenuProps {
  menu: AauNavMenu;
  panelId: string;
  open: boolean;
  onToggle: () => void;
  onHover: () => void;
}

function DesktopMenu({ menu, panelId, open, onToggle, onHover }: DesktopMenuProps) {
  return (
    <div className="relative" onMouseEnter={onHover}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex items-center gap-1 px-4 py-2 font-normal transition-colors hover:bg-brand-50",
          open ? "bg-brand-50 text-black" : "text-aau-gray-800",
        )}
      >
        {menu.label}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute left-0 top-full z-50 mt-2 w-[min(90vw,44rem)] rounded-sm border border-aau-gray-line bg-white p-4 shadow-lg"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {menu.sections.map((section) => (
              <div key={section.heading} className="space-y-2">
                {/* Upstream's group label: 12px, uppercase, semibold, in
                    `customBlue-main` — a slightly darker blue than their
                    `blue-600`, which is why it is its own token. */}
                <div className="mb-[9px] ml-2 text-xs font-semibold uppercase text-aau-custom-blue">
                  {section.heading}
                </div>
                <ul className="m-0 flex list-none flex-col gap-0 p-0">
                  {section.links.map((link) => (
                    <li key={`${section.heading}-${link.to}-${link.label}`}>
                      <Link
                        to={link.to}
                        className="block rounded-sm p-2 text-sm text-aau-gray-700 hover:bg-brand-50 focus:text-brand-700"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Accordion entry inside the mobile drawer — upstream flattens the same tree. */
function MobileMenu({ menu }: { menu: AauNavMenu }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-b border-aau-gray-200 pb-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between rounded-sm px-2 py-3 font-medium text-aau-gray-800 hover:bg-brand-50"
      >
        {menu.label}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={panelId} className="pb-2">
          {menu.sections.map((section) => (
            <div key={section.heading} className="mt-2">
              <div className="mb-1 ml-2 text-xs font-semibold uppercase text-aau-custom-blue">
                {section.heading}
              </div>
              {section.links.map((link) => (
                <Link
                  key={`${section.heading}-${link.to}-${link.label}`}
                  to={link.to}
                  className="block rounded-sm px-2 py-2 text-sm text-aau-gray-700 hover:bg-brand-50"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
