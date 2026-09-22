import { LayoutDashboard, LogOut } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";
import { AauFooter } from "../components/aau/AauFooter";
import { AauHeader } from "../components/aau/AauHeader";
import { AauNewsletter } from "../components/aau/AauNewsletter";
import { Button } from "../components/Button";
import { RoleBadge } from "../components/StatusBadges";
import { PUBLIC_NAV, staffNav } from "./aauNav";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { useAuth } from "./AuthContext";

/**
 * Shell A (frontend-design-system.md §9.2 / §5.5): the read/discover surfaces
 * open to everyone — `/`, `/map`, `/login`, and `*`. The three addresses that
 * are also staff destinations (`/items`, `/scan`, `/item/:tagId`) render this
 * shell only for an anonymous visitor; a signed-in one gets the workbench via
 * `SmartLayout`.
 *
 * The chrome is now the official AAU chrome (`components/aau/*`): the white
 * `aau.edu.et` header, then the page, then the "Subscribe to our Newsletter."
 * band, then the navy `blue-900` footer — the same three bands, in the same
 * order, as the university's own pages. Role only changes the header's trailing
 * control and which menu tree it renders, never the layout shape.
 *
 * The inner `max-w-7xl` container is deliberately *not* part of the AAU shell:
 * the header, newsletter and footer are full-bleed on aau.edu.et, so they sit
 * outside this wrapper while the page content stays readable at 1280px.
 */
export function PublicLayout() {
  const { user, status, signOut } = useAuth();
  const navigate = useNavigate();

  // A signed-in visitor who lands on a public page still gets the signed-in
  // menu, so the header never offers them "Sign in" while a session is live.
  const entries = user ? staffNav(user.role) : PUBLIC_NAV;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <AauHeader
        entries={entries}
        home={user ? "/dashboard" : "/"}
        actions={
          status === "loading" ? null : user ? (
            <div className="flex items-center gap-2">
              <RoleBadge role={user.role} className="hidden sm:inline-flex" />
              <Button
                variant="outline"
                size="sm"
                leftIcon={<LayoutDashboard className="h-4 w-4" />}
                onClick={() => navigate("/dashboard")}
              >
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<LogOut className="h-4 w-4" />}
                onClick={signOut}
              >
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          ) : (
            // The label mirrors the admission portal's own footer entry,
            // "Student / Staff Sign In" — this app only has staff accounts, so
            // it names just the one that exists.
            <Button size="sm" className="rounded-sm px-4" onClick={() => navigate("/login")}>
              Staff Sign In
            </Button>
          )
        }
      />

      <main id="main-content" className="flex-1 bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
          {/* Boundary lives inside the shell so a broken screen keeps the header/footer (§8). */}
          <AppErrorBoundary heading="Something went wrong on this page">
            <Outlet />
          </AppErrorBoundary>
        </div>
      </main>

      <AauNewsletter />
      <AauFooter />
    </div>
  );
}
