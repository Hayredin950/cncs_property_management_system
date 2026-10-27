import { createBrowserRouter, Outlet, type RouteObject } from "react-router-dom";
import { AdminBuildingsPage } from "../features/admin/AdminBuildingsPage";
import { AdminCategoriesPage } from "../features/admin/AdminCategoriesPage";
import { AdminUsersPage } from "../features/admin/AdminUsersPage";
import { DepartmentsPage } from "../features/admin/DepartmentsPage";
import { SystemEventsPage } from "../features/admin/SystemEventsPage";
import { SystemStatusPage } from "../features/admin/SystemStatusPage";
import { AuditListPage } from "../features/audits/AuditListPage";
import { AuditNewPage } from "../features/audits/AuditNewPage";
import { AuditReportPage } from "../features/audits/AuditReportPage";
import { AuditScanPage } from "../features/audits/AuditScanPage";
import { AcceptInvitePage } from "../features/auth/AcceptInvitePage";
import { ChangePasswordPage } from "../features/auth/ChangePasswordPage";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RequestAccountPage } from "../features/auth/RequestAccountPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
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
import { DepartmentDetailPage } from "../features/departments/DepartmentDetailPage";
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
 * - **SmartLayout** — `/items`, `/map`, `/scan` and `/item/:tagId`. Each is a
 *   staff destination *and* a public surface, so the shell is chosen per request
 *   (signed in → workbench, anonymous → Shell A). See `SmartLayout.tsx` for the
 *   bug that made this necessary: without it, following a sidebar link — or
 *   landing on the QR destination after a save — dropped the whole nav. Only
 *   `/scan` is actually reachable anonymously; the other three read the register
 *   and are behind `RequireAuth`.
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
          { path: "/login", element: <LoginPage /> },
          { path: "/request-account", element: <RequestAccountPage /> },
          // The invited person is not signed in and has no account to sign in
          // with — the invitation is what creates one (T6), so this belongs to
          // the public shell rather than behind `RequireAuth`.
          { path: "/accept-invite", element: <AcceptInvitePage /> },
          // The reset link lands here from an email, so it is public for the
          // same reason: the person cannot sign in — that is the problem.
          { path: "/forgot-password", element: <ForgotPasswordPage /> },
          { path: "/reset-password", element: <ResetPasswordPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      // Shared addresses: destinations a signed-in user reaches from the
      // workbench that are also public surfaces. Must not be duplicated in the
      // Shell A block above — React Router matches one route per path, so a
      // second copy would be dead.
      //
      // `/scan` is the only one a visitor may use without a token: the camera
      // reads nothing from the API. Every item read is `authenticate`-only
      // (`GET /items`, `/items/:tagId`), so `/items`, `/map` and the tag page
      // sit behind the same guard as the rest of the asset screens. Without
      // that guard, signing out of `/items` left the browse screen mounted with
      // no token and the browser fetching the register anonymously — a 401 and
      // an error toast on what should be a login form. The guard sends the
      // visitor to `/login?next=…`, which is also what makes a scanned tag
      // survive sign-in and land back on `/item/<tag>` (P6-3).
      {
        element: <SmartLayout />,
        children: [
          { path: "/scan", element: <ScanPage /> },
          {
            path: "/items",
            element: (
              <RequireAuth roles={ASSET_ROLES}>
                <ItemsBrowsePage />
              </RequireAuth>
            ),
          },
          {
            path: "/map",
            element: (
              <RequireAuth roles={ASSET_ROLES}>
                <MapPage />
              </RequireAuth>
            ),
          },
          // The QR destination. It is public in the sense that the sticker is
          // printed for anyone to scan, but the record behind it needs an
          // account — so the guard turns a scan into a sign-in prompt and then
          // returns the reader to the tag.
          {
            path: "/item/:tagId",
            element: (
              <RequireAuth roles={ASSET_ROLES}>
                <ItemDetailPage />
              </RequireAuth>
            ),
          },
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
          // Department detail page (DEPARTMENT_HEAD only)
          {
            element: <RequireAuth roles={["DEPARTMENT_HEAD"]}><Outlet /></RequireAuth>,
            children: [{ path: "/departments/:id", element: <DepartmentDetailPage /> }],
          },

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

          // The college's buildings. The endpoint existed and nothing reached
          // it, so the register's building filter could not be spelled one way
          // — see `AdminBuildingsPage.tsx`. The list is the administrator's
          // (27 Oct); the office only reads it, through the item form.
          {
            element: (
              <RequireAuth roles={["SYSTEM_ADMIN"]}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              { path: "/admin/buildings", element: <AdminBuildingsPage /> },
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
              <RequireAuth roles={["SYSTEM_ADMIN", "DEPARTMENT_HEAD"]}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              { path: "/admin/users", element: <AdminUsersPage /> },
              { path: "/admin/system", element: <SystemStatusPage /> },
              { path: "/admin/events", element: <SystemEventsPage /> },
              { path: "/admin/departments", element: <DepartmentsPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
