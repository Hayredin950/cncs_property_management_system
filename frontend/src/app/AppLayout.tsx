import { LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AauFooter } from "../components/aau/AauFooter";
import { AauHeader } from "../components/aau/AauHeader";
import { Button } from "../components/Button";
import { HealthIndicator } from "../components/HealthIndicator";
import { Modal } from "../components/Modal";
import { RoleBadge } from "../components/StatusBadges";
import { usePendingCount } from "../hooks/useRequests";
import { cn } from "../lib/cn";
import { getSidebarCollapsed, setSidebarCollapsed } from "../lib/storage";
import { staffNav } from "./aauNav";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { useAuth } from "./AuthContext";
import { visibleNavItems, type NavItem } from "./navConfig";

/**
 * Shell B/C (frontend-design-system.md §5.5/§9): the authenticated "workbench".
 *
 * Three surfaces are stitched together here, each copied from a different
 * official AAU property because that is where the university itself uses it:
 *
 *   - **header** — `aau.edu.et`'s white sticky bar with the crest lockup and
 *     grouped drop-down menus (`components/aau/AauHeader`).
 *   - **sidebar** — `portal.aau.edu.et`'s "Navigation" panel: a blue-gradient
 *     title strip over a bordered white list, rows separated by hairlines and
 *     the current row tinted pale green. Same structure, our destinations.
 *   - **footer** — `aau.edu.et`'s navy footer (`components/aau/AauFooter`).
 *
 * One component still renders both the desktop sidebar (`lg`+) and the mobile
 * bottom tab bar (below `lg`) from the same `visibleNavItems()` list, so later
 * phases grow this by editing `navConfig.ts` alone.
 *
 * The sidebar **sticks** and **collapses** (§5.5): it is a `position: sticky`
 * column so a long register table never scrolls the destinations out of reach,
 * and a toggle folds it to an icon rail for the same reason. The collapse
 * preference is persisted (`lib/storage.ts`) because it is a working-style
 * choice, not a per-visit one.
 *
 * The mobile bar is deliberately capped at **five slots** (four destinations +
 * "More"), as the design doc requires: once there are seven destinations, seven
 * equal-width tabs would shrink every touch target below the 44px minimum
 * (§12). The overflow lives in a sheet instead.
 */
const MOBILE_SLOT_COUNT = 4;

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  // Lazy initializer, not an effect: the stored preference is knowable
  // synchronously at first render, so the rail must not paint expanded and then
  // snap shut (the same rule `AuthContext` follows for the token).
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);
  const shellRef = useRef<HTMLDivElement | null>(null);

  /**
   * Publish the header's real height as `--app-header-h`, which is what the
   * sidebar's `sticky top-…` is offset by.
   *
   * The header is itself `sticky top-0 z-50` and its height is content-driven
   * (logo height + `py-2` / `md:py-[7px]`), so a hardcoded `top-16` would be a
   * guess that silently buries the top of the nav behind an opaque bar the day
   * the logo or padding changes. Measuring writes the value to a CSS custom
   * property on the shell instead of React state, so a resize costs no render.
   */
  useEffect(() => {
    const shell = shellRef.current;
    const header = shell?.querySelector("header");
    if (!shell || !header) return;

    const sync = () => {
      const { height } = header.getBoundingClientRect();
      shell.style.setProperty("--app-header-h", `${Math.round(height)}px`);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // One poll for the review-queue badge, shared by the sidebar, the tab bar, and
  // the header's home button. Called unconditionally (hooks can't be conditional)
  // but only *shown* to an admin, who is the person the queue belongs to.
  const pendingQuery = usePendingCount();
  const pendingCount = user?.role === "ADMIN" ? (pendingQuery.data?.pendingCount ?? 0) : 0;

  // RequireAuth already guarantees a user here; this just narrows the type.
  if (!user) return null;

  const items = visibleNavItems(user.role);
  const mobilePrimary = items.slice(0, MOBILE_SLOT_COUNT);
  const mobileOverflow = items.slice(MOBILE_SLOT_COUNT);
  const overflowActive = mobileOverflow.some((item) => location.pathname.startsWith(item.to));

  function badgeFor(item: NavItem) {
    if (item.badge === "pending-count" && user?.role === "ADMIN" && pendingCount > 0) {
      return pendingCount;
    }
    return null;
  }

  function toggleSidebar() {
    setCollapsed((previous) => {
      setSidebarCollapsed(!previous);
      return !previous;
    });
  }

  return (
    <div
      ref={shellRef}
      // The SSR/no-JS default the measuring effect above overwrites on mount.
      style={{ "--app-header-h": "64px" } as CSSProperties}
      className="flex min-h-screen flex-col bg-aau-gray-50"
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <AauHeader
        entries={staffNav(user.role)}
        home="/dashboard"
        homeBadge={pendingCount}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-medium text-aau-gray-700 sm:inline">
              {user.fullName}
            </span>
            <RoleBadge role={user.role} />
          </div>
        }
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Desktop sidebar — the portal's "Navigation" panel */}
        {/*
          `self-start` is load-bearing: a flex child stretches to the row's full
          height by default, and a stretched box has nowhere to stick within its
          own containing block. The width transition is what makes collapsing
          read as folding the rail rather than the page reflowing.
        */}
        <aside
          className={cn(
            "hidden shrink-0 self-start transition-[width] duration-200 lg:block",
            collapsed ? "w-[4.5rem]" : "w-64",
          )}
        >
          <div className="sticky top-[var(--app-header-h)] max-h-[calc(100vh-var(--app-header-h))] overflow-y-auto pb-2">
            <div className="border border-aau-gray-300 bg-white">
              <div
                className={cn(
                  "flex items-center gap-2 bg-gradient-to-r from-brand-700 to-brand-500 py-2.5",
                  collapsed ? "justify-center px-2" : "px-4",
                )}
              >
                {!collapsed && (
                  <span className="text-[15px] font-semibold text-white">Navigation</span>
                )}
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                  title={collapsed ? "Expand navigation" : "Collapse navigation"}
                  className={cn(
                    "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-white/90 transition-colors hover:bg-white/20 hover:text-white",
                    !collapsed && "ml-auto",
                  )}
                >
                  {collapsed ? (
                    <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <nav aria-label="Primary">
                <ul className="m-0 list-none p-0">
                {items.map((item) => {
                  const badge = badgeFor(item);
                  return (
                    <li key={item.to} className="border-b border-aau-gray-200 last:border-b-0">
                      <NavLink
                        to={item.to}
                        // The label is still the accessible name when the rail is
                        // folded (`sr-only`, below) — `title` is only the hover
                        // tooltip for a sighted user, never the name.
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            "relative flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                            collapsed && "justify-center gap-0 px-0",
                            isActive
                              ? "bg-aau-portal-active font-semibold text-brand-700"
                              : "text-aau-gray-700 hover:bg-aau-gray-100",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* The portal marks each row with a blue circled
                                +/− control; the destination's own icon carries
                                the same weight here and is more useful. */}
                            <item.icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isActive ? "text-brand-600" : "text-brand-500",
                              )}
                              aria-hidden="true"
                            />
                            {/* `sr-only` rather than a conditional render: the
                                link keeps its accessible name (and its test
                                query) while the rail is folded. */}
                            <span className={cn(collapsed && "sr-only")}>{item.label}</span>
                            {badge !== null &&
                              (collapsed ? (
                                <span
                                  aria-label={`${badge} pending requests`}
                                  className="absolute right-2 top-2 h-2 w-2 rounded-full bg-warning-600"
                                />
                              ) : (
                                <span
                                  aria-label={`${badge} pending requests`}
                                  className="ml-auto rounded-full bg-warning-100 px-2 py-0.5 text-xs font-semibold text-warning-700"
                                >
                                  {badge}
                                </span>
                              ))}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}                </ul>
              </nav>
            </div>

            <div
              className={cn(
                "mt-3 border border-aau-gray-300 bg-white",
                collapsed ? "p-2" : "p-3",
              )}
            >
              <HealthIndicator
                className={cn("mb-2", collapsed ? "justify-center" : "justify-start")}
              />
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                leftIcon={<LogOut className="h-4 w-4" />}
                onClick={signOut}
              >
                <span className={cn(collapsed && "sr-only")}>Sign out</span>
              </Button>
            </div>
          </div>
        </aside>

        <main id="main-content" className="flex-1 px-4 py-6 pb-24 lg:px-6 lg:pb-8">
          {/* Boundary lives inside the shell so a broken screen keeps the nav (§8). */}
          <AppErrorBoundary heading="Something went wrong on this screen">
            <Outlet />
          </AppErrorBoundary>
        </main>
      </div>

      <AauFooter />

      {/* Mobile bottom tab bar — four destinations + More */}
      <nav
        // Distinct from the sidebar's "Primary": both landmarks exist in the
        // DOM at once (one is only CSS-hidden per breakpoint), and two landmarks
        // with the same accessible name are ambiguous to assistive tech.
        aria-label="Mobile primary"
        className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-aau-gray-300 bg-white lg:hidden"
      >
        {mobilePrimary.map((item) => {
          const badge = badgeFor(item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium",
                  isActive ? "text-brand-700" : "text-aau-gray-500",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "relative flex h-8 w-8 items-center justify-center rounded-full",
                      item.emphasized && "bg-brand-600 text-white",
                      item.emphasized && isActive && "ring-2 ring-brand-200",
                    )}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                    {badge !== null && (
                      <span
                        aria-label={`${badge} pending requests`}
                        className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-600 px-1 text-[10px] font-bold text-white"
                      >
                        {badge}
                      </span>
                    )}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium",
            overflowActive ? "text-brand-700" : "text-aau-gray-500",
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full">
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </span>
          More
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <nav aria-label="More" className="flex flex-col gap-1">
          {mobileOverflow.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium",
                  isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-aau-gray-700 hover:bg-aau-gray-100",
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
          <Button
            variant="ghost"
            fullWidth
            className="mt-1 justify-start"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={() => {
              setMoreOpen(false);
              signOut();
            }}
          >
            Sign out
          </Button>
        </nav>
      </Modal>
    </div>
  );
}
