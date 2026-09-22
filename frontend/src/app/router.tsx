import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AdminCategoriesPage } from "../features/admin/AdminCategoriesPage";
import { AdminUsersPage } from "../features/admin/AdminUsersPage";
import { AuditNewPage } from "../features/audits/AuditNewPage";
import { AuditReportPage } from "../features/audits/AuditReportPage";
import { AuditScanPage } from "../features/audits/AuditScanPage";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ItemFormPage } from "../features/items/ItemFormPage";
import { ItemStaffPage } from "../features/items/ItemStaffPage";
import { ItemsBrowsePage } from "../features/items/ItemsBrowsePage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { RequestDetailPage } from "../features/requests/RequestDetailPage";
import { RequestFormPage } from "../features/requests/RequestFormPage";
import { RequestsListPage } from "../features/requests/RequestsListPage";
import { ItemDetailPage } from "../features/public/ItemDetailPage";
import { LandingPage } from "../features/public/LandingPage";
import { MapPage } from "../features/public/MapPage";
import { NotFoundPage } from "../features/public/NotFoundPage";
import { ScanPage } from "../features/public/ScanPage";
import { AppLayout } from "./AppLayout";
import { RootErrorElement } from "./AppErrorBoundary";
import { PublicLayout } from "./PublicLayout";
import { RequireAuth } from "./RequireAuth";
import { RootProviders } from "./RootProviders";
import { SmartLayout } from "./SmartLayout";

/**
 * The route map from `frontend-plan.md` §6. Two shells, exactly as
 * `frontend-design-system.md` §9 describes them:
 *
 * - **Shell A** (`PublicLayout`) — `/`, `/items`, `/scan`, `/item/:tagId`,
 *   `/login`: open to everyone, including anonymous visitors.
 * - **Shell B/C** (`AppLayout` behind `RequireAuth`) — everything staff/admin:
 *   dashboard, item management, requests, notifications, admin screens.
 * - **SmartLayout** — `/items` and `/scan` only. Both are staff sidebar entries
 *   *and* public surfaces, so the shell is chosen per request
 *   (signed in → workbench, anonymous → Shell A). See `SmartLayout.tsx` for the
 *   bug that made this necessary: without it, two sidebar links dropped the
 *   whole nav.
 *
 * `*` lives under the public shell so an unknown path still gets a header and
 * footer rather than a bare error box — and it's the same 404 a role-scoped
 * route renders for a viewer who can't use it (§9.1: no separate "forbidden"
 * page, ever).
 *
 * Note `/item/:tagId` (singular, public, the QR destination) and `/items/:id`
 * (plural, staff detail) are different routes by design — `qrGenerator.ts`
 * encodes the singular form, so it must not change.
 *
 * Exported as `appRoutes` (the array) as well as the browser router, so the
 * test harness mounts the *production* tree inside `createMemoryRouter`
 * rather than a hand-copied route list that would drift.
 */
export const appRoutes: RouteObject[] = [
  {
    // Only reached by a throw from a layout/provider itself, or a loader error —
    // a page-level crash is caught by each shell's own `AppErrorBoundary`, which
    // keeps the chrome. Without this, React Router substitutes its own bare
    // "Unexpected Application Error!" screen instead.
    errorElement: <RootErrorElement />,
    element: <RootProviders />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: "/", element: <LandingPage /> },
          { path: "/map", element: <MapPage /> },
          { path: "/item/:tagId", element: <ItemDetailPage /> },
          { path: "/login", element: <LoginPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      // Shared addresses: staff sidebar destinations that are also public
      // surfaces. Must not be duplicated in the Shell A block above — React
      // Router matches one route per path, so a second copy would be dead.
      {
        element: <SmartLayout />,
        children: [
          { path: "/items", element: <ItemsBrowsePage /> },
          { path: "/scan", element: <ScanPage /> },
        ],
      },
      {
        element: (
          <RequireAuth roles={["ADMIN", "STAFF"]}>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/items/new", element: <ItemFormPage mode="create" /> },
          { path: "/items/:id/edit", element: <ItemFormPage mode="edit" /> },
          { path: "/items/:id", element: <ItemStaffPage /> },
          { path: "/requests", element: <RequestsListPage /> },
          { path: "/requests/new", element: <RequestFormPage /> },
          { path: "/requests/:id", element: <RequestDetailPage /> },
          { path: "/notifications", element: <NotificationsPage /> },
          // Phase 3: audit walkthrough (F9) and the CSV exports (F10).
          { path: "/audit/new", element: <AuditNewPage /> },
          { path: "/audit/:id/scan", element: <AuditScanPage /> },
          { path: "/audit/:id/report", element: <AuditReportPage /> },
          { path: "/reports", element: <ReportsPage /> },
          // Admin-only screens still render behind the shared staff shell;
          // RequireAuth's roles check turns a staff deep-link into the same
          // 404 as any unknown path (frontend-plan.md §6, §9.1).
          { path: "/admin/users", element: <AdminUsersPage /> },
          { path: "/admin/categories", element: <AdminCategoriesPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
