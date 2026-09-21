import { LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { RoleBadge } from "../components/StatusBadges";
import { cn } from "../lib/cn";
import { useAuth } from "./AuthContext";
import { visibleNavItems } from "./navConfig";

/**
 * Shell B/C (frontend-design-system.md §5.5/§9): the "workbench" for
 * authenticated management screens. One component renders both the desktop
 * sidebar (`lg`+) and the mobile bottom tab bar (below `lg`) from the same
 * `visibleNavItems()` list, so Phase 2/3 grow this by editing `navConfig.ts`
 * alone.
 */
export function AppLayout() {
  const { user, signOut } = useAuth();
  // RequireAuth already guarantees a user here; this just narrows the type.
  if (!user) return null;

  const items = visibleNavItems(user.role);

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
          {items.map((item) => (
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
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
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
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white lg:hidden"
      >
        {items.map((item) => (
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
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    item.emphasized && "bg-accent-600 text-white",
                    item.emphasized && isActive && "ring-2 ring-accent-200",
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
