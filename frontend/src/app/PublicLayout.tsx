import { LayoutDashboard, LogIn, LogOut } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AauFooter } from "../components/aau/AauFooter";
import { AauHeader } from "../components/aau/AauHeader";
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
 * The chrome is the official AAU chrome (`components/aau/*`): the white
 * `aau.edu.et` header, then the page, then the navy `blue-900` footer on the
 * landing page alone.
 *
 * ### The footer is homepage-only
 *
 * It used to sit above the newsletter on every anonymous page. The brief is now
 * that it belongs to `/` and nowhere else, so `isHome` gates it: a QR scan or a
 * register search ends on the content, not on twenty links out of the app. The
 * newsletter band that used to sit in front of it is gone entirely — the app has
 * no mailing list, and a subscribe box that quietly wrote to `localStorage` was
 * the one surface pretending to be a backend it did not have.
 *
 * ### The header's trailing controls
 *
 * The bar is a `justify-between` row whose left side is a fixed-width lockup, so
 * adding controls squeezes the university wordmark on a phone. The rule here is
 * therefore: one control in the bar, everything else in the mobile drawer. An
 * anonymous visitor gets a single, small **Sign in** button; a signed-in one
 * gets a Dashboard button, with the role chip and Sign out moved into the drawer
 * (`mobileActions`) instead of crowding the bar.
 */
export function PublicLayout() {
  const { user, status, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // A signed-in visitor who lands on a public page still gets the signed-in
  // menu, so the header never offers them "Sign in" while a session is live.
  const entries = user ? staffNav(user.role) : PUBLIC_NAV;
  const isHome = location.pathname === "/";
  // The sign-in CTA would navigate to the page it is already on, and a second
  // "Sign in" control next to the form's own submit button is just noise.
  const onLoginPage = location.pathname === "/login";

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
            <Button
              variant="outline"
              size="sm"
              leftIcon={<LayoutDashboard className="h-4 w-4" />}
              onClick={() => navigate("/dashboard")}
            >
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
          ) : onLoginPage ? null : (
            /*
              Shorter than the admission portal's "Student / Staff Sign In" and
              shaped like the site's own pill CTAs rather than the base rounded
              rectangle — on a phone this is the only trailing control, so it has
              to earn its width instead of elbowing the wordmark.
            */
            <Button
              size="sm"
              className="rounded-full px-5 shadow-sm"
              leftIcon={<LogIn className="h-4 w-4" />}
              onClick={() => navigate("/login")}
            >
              Sign in
            </Button>
          )
        }
        mobileActions={
          status === "loading" ? null : user ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-2">
                <span className="text-sm font-medium text-aau-gray-700">{user.fullName}</span>
                <RoleBadge role={user.role} />
              </div>
              <Button
                variant="outline"
                fullWidth
                leftIcon={<LayoutDashboard className="h-4 w-4" />}
                onClick={() => navigate("/dashboard")}
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                fullWidth
                leftIcon={<LogOut className="h-4 w-4" />}
                onClick={signOut}
              >
                Sign out
              </Button>
            </div>
          ) : onLoginPage ? null : (
            <Button
              fullWidth
              leftIcon={<LogIn className="h-4 w-4" />}
              onClick={() => navigate("/login")}
            >
              Sign in
            </Button>
          )
        }
      />

      <main id="main-content" tabIndex={-1} className="flex-1 bg-white focus:outline-none">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
          {/* Boundary lives inside the shell so a broken screen keeps the header/footer (§8). */}
          <AppErrorBoundary heading="Something went wrong on this page">
            <Outlet />
          </AppErrorBoundary>
        </div>
      </main>

      {isHome && <AauFooter />}
    </div>
  );
}
