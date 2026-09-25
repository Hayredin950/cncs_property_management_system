import { Outlet, useLocation } from "react-router-dom";
import { AauFooter } from "../components/aau/AauFooter";
import { AauHeader } from "../components/aau/AauHeader";
import { HeaderAccountBlock } from "../components/aau/HeaderAccountBlock";
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
 * therefore: one control in the bar, everything else in the mobile drawer — and it
 * is implemented once, in `components/aau/HeaderAccountBlock`, so this shell and the
 * authenticated one cannot drift apart again.
 */
export function PublicLayout() {
  const { user } = useAuth();
  const location = useLocation();

  // A signed-in visitor who lands on a public page still gets the signed-in
  // menu, so the header never offers them "Sign in" while a session is live.
  const entries = user ? staffNav(user.role) : PUBLIC_NAV;
  const isHome = location.pathname === "/";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/*
        Both account surfaces come from one component, the same one `AppLayout`
        uses — the drawer used to differ between the two shells for no better
        reason than that it was written twice (`HeaderAccountBlock`).
      */}
      <AauHeader
        entries={entries}
        home={user ? "/dashboard" : "/"}
        actions={<HeaderAccountBlock variant="bar" />}
        mobileActions={<HeaderAccountBlock variant="drawer" />}
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
