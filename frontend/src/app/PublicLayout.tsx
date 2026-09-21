import { LayoutDashboard, LogOut } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { RoleBadge } from "../components/StatusBadges";
import { useAuth } from "./AuthContext";

/**
 * Shell A (frontend-design-system.md §9.2 / §5.5): minimal chrome for the
 * read/discover surfaces open to everyone — `/`, `/items`, `/scan`,
 * `/item/:tagId`, `/login` — regardless of auth state. Role only changes the
 * top-right control, never the layout shape.
 */
export function PublicLayout() {
  const { user, status, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link to="/" aria-label="CNCS Property — home">
            <BrandMark />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {status === "loading" ? null : user ? (
              <>
                <RoleBadge role={user.role} className="hidden sm:inline-flex" />
                <Link to="/dashboard">
                  <Button variant="outline" size="sm" leftIcon={<LayoutDashboard className="h-4 w-4" />}>
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" leftIcon={<LogOut className="h-4 w-4" />} onClick={signOut}>
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </>
            ) : (
              <Link to="/login">
                <Button variant="outline" size="sm">
                  Staff Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        CNCS Property Management System — College of Natural and Computational Sciences
      </footer>
    </div>
  );
}
