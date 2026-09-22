import { LogOut, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { HealthIndicator } from "../components/HealthIndicator";
import { Modal } from "../components/Modal";
import { RoleBadge } from "../components/StatusBadges";
import { usePendingCount } from "../hooks/useRequests";
import { cn } from "../lib/cn";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { useAuth } from "./AuthContext";
import { visibleNavItems, type NavItem } from "./navConfig";

/**
 * Shell B/C (frontend-design-system.md §5.5/§9): the "workbench" for
 * authenticated management screens. One component renders both the desktop
 * sidebar (`lg`+) and the mobile bottom tab bar (below `lg`) from the same
 * `visibleNavItems()` list, so later phases grow this by editing `navConfig.ts`
 * alone.
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

  // One poll for the review-queue badge, shared by the sidebar and the tab bar.
  // Called unconditionally (hooks can't be conditional) but only *rendered* for
  // an admin, who is the person the queue belongs to.
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-4">
          <BrandMark />
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const badge = badgeFor(item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100",
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
                {badge !== null && (
                  <span
                    aria-label={`${badge} pending requests`}
                    className="ml-auto rounded-full bg-warning-100 px-2 py-0.5 text-xs font-semibold text-warning-700"
                  >
                    {badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <HealthIndicator className="mb-2 justify-start" />
          <Button variant="ghost" fullWidth leftIcon={<LogOut className="h-4 w-4" />} onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">{user.fullName}</span>
            <RoleBadge role={user.role} />
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">
          <div className="mx-auto w-full max-w-7xl">
            {/* Boundary lives inside the shell so a broken screen keeps the nav (§8). */}
            <AppErrorBoundary heading="Something went wrong on this screen">
              <Outlet />
            </AppErrorBoundary>
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar — four destinations + More */}
      <nav
        // Distinct from the sidebar's "Primary": both landmarks exist in the
        // DOM at once (one is only CSS-hidden per breakpoint), and two landmarks
        // with the same accessible name are ambiguous to assistive tech.
        aria-label="Mobile primary"
        className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white lg:hidden"
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
                  isActive ? "text-brand-700" : "text-slate-500",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "relative flex h-8 w-8 items-center justify-center rounded-full",
                      item.emphasized && "bg-accent-600 text-white",
                      item.emphasized && isActive && "ring-2 ring-accent-200",
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
            overflowActive ? "text-brand-700" : "text-slate-500",
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
                  isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-100",
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
