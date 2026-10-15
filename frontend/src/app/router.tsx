import { createBrowserRouter, Outlet, type RouteObject } from "react-router-dom";
import { AdminCategoriesPage } from "../features/admin/AdminCategoriesPage";
import { AdminUsersPage } from "../features/admin/AdminUsersPage";
import { AuditListPage } from "../features/audits/AuditListPage";
import { AuditNewPage } from "../features/audits/AuditNewPage";
import { AuditReportPage } from "../features/audits/AuditReportPage";
import { AuditScanPage } from "../features/audits/AuditScanPage";
import { AcceptInvitePage } from "../features/auth/AcceptInvitePage";
import { ChangePasswordPage } from "../features/auth/ChangePasswordPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RequestAccountPage } from "../features/auth/RequestAccountPage";
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
import type { Role } from "../types/enums";
import { ASSET_ROLES } from "../lib/permissions";
import { SmartLayout } from "./SmartLayout";

/**
 * The route map from `frontend-plan.md` §6. Two shells, exactly as
 * `frontend-design-system.md` §9 describes them:
 *
 * - **Shell A** (`PublicLayout`) — `/`, `/map`, `/login`, `/request-account` and
 *   `*`: open to everyone, including anonymous visitors.
 * - **Shell B/C** (`AppLayout` behind `RequireAuth`) — everything staff/admin:
 *   dashboard, item management, requests, notifications, and a nested
 *   ADMIN-only guard for the `/admin/*` screens.
 * - **SmartLayout** — `/items`, `/scan` and `/item/:tagId`. Each is a staff
 *   destination *and* a public surface, so the shell is chosen per request
 *   (signed in → workbench, anonymous → Shell A). See `SmartLayout.tsx` for the
 *   bug that made this necessary: without it, following a sidebar link — or
 *   landing on the QR destination after a save — dropped the whole nav.
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
/** Every signed-in role. The shell itself admits all five; each screen guards
 * itself below, because the roles have genuinely different jobs now. */
const ALL_ROLES: Role[] = [
  "SYSTEM_ADMIN",
  "PROPERTY_OFFICER",
  "DEPARTMENT_HEAD",
  "STAFF",
  "AUDITOR",
];
/*
 * `ASSET_ROLES` — everyone except the SYSTEM_ADMIN — is imported from
 * `lib/permissions.ts` rather than declared here, so the guard below and the
 * dashboard's tile gate share one list. It was local to this file, which is
 * exactly why the dashboard could not reference it and wrote `!isAuditor`
 * instead. A single source also means a future sixth role is added once.
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
          { path: "/login", element: <LoginPage /> },
          { path: "/request-account", element: <RequestAccountPage /> },
          // The invited person is not signed in and has no account to sign in
          // with — the invitation is what creates one (T6), so this belongs to
          // the public shell rather than behind `RequireAuth`.
          { path: "/accept-invite", element: <AcceptInvitePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      // Shared addresses: destinations a signed-in user reaches from the
      // workbench that are also public surfaces. Must not be duplicated in the
      // Shell A block above — React Router matches one route per path, so a
      // second copy would be dead.
      {
        element: <SmartLayout />,
        children: [
          { path: "/items", element: <ItemsBrowsePage /> },
          { path: "/scan", element: <ScanPage /> },
          // The QR destination. It is public, but it is also where the item
          // form lands after a save, where `ItemFormPage`'s and
          // `ItemStaffPage`'s "public page" links point, and where a staff
          // scan ends up — so a signed-in user must arrive with the nav they
          // left from rather than losing it. See `SmartLayout.tsx`.
          { path: "/item/:tagId", element: <ItemDetailPage /> },
        ],
      },
      {
        element: (
          <RequireAuth roles={ALL_ROLES}>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          // Reachable by any signed-in role; `RequireAuth` funnels a forced
          // password change here from every other screen.
          { path: "/change-password", element: <ChangePasswordPage /> },
          { path: "/notifications", element: <NotificationsPage /> },

          // Asset screens. The SYSTEM_ADMIN is an account role and sees no
          // asset data (spec 2.1.1), so it is the one role these guards keep
          // out — the reverse of the old ADMIN-only admin screens.
          {
            element: (
              <RequireAuth roles={ASSET_ROLES}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              { path: "/items/:id/edit", element: <ItemFormPage mode="edit" /> },
              { path: "/items/:id", element: <ItemStaffPage /> },
              { path: "/requests", element: <RequestsListPage /> },
              { path: "/requests/new", element: <RequestFormPage /> },
              { path: "/requests/:id", element: <RequestDetailPage /> },
            ],
          },

          // Registering an item is the Property Officer's alone (spec 4.3).
          {
            element: (
              <RequireAuth roles={["PROPERTY_OFFICER"]}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              { path: "/items/new", element: <ItemFormPage mode="create" /> },
              { path: "/admin/categories", element: <AdminCategoriesPage /> },
            ],
          },

          // Phase 3: audit walkthrough (F9) and the CSV exports (F10).
          // `/audits` (plural) is the history; `/audit/...` (singular) is one
          // session. Running one is AUDITOR-only (spec 8.1); the officer reads the
          // history and reports to act on the findings.
          {
            element: (
              <RequireAuth roles={["PROPERTY_OFFICER", "AUDITOR"]}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              { path: "/audits", element: <AuditListPage /> },
              { path: "/audit/:id/report", element: <AuditReportPage /> },
              { path: "/reports", element: <ReportsPage /> },
            ],
          },
          {
            element: (
              <RequireAuth roles={["AUDITOR"]}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              { path: "/audit/new", element: <AuditNewPage /> },
              { path: "/audit/:id/scan", element: <AuditScanPage /> },
            ],
          },

          // Account administration is the System Admin's (the Account Admin was
          // merged into it on 12 Oct). A failed role check renders the same 404
          // as any unknown path (frontend-plan.md §6, §9.1).
          {
            element: (
              <RequireAuth roles={["SYSTEM_ADMIN"]}>
                <Outlet />
              </RequireAuth>
            ),
            children: [{ path: "/admin/users", element: <AdminUsersPage /> }],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
