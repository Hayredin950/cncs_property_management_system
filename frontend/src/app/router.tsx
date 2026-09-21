import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AdminCategoriesPage } from "../features/admin/AdminCategoriesPage";
import { AdminUsersPage } from "../features/admin/AdminUsersPage";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ItemFormPage } from "../features/items/ItemFormPage";
import { ItemStaffPage } from "../features/items/ItemStaffPage";
import { ItemsBrowsePage } from "../features/items/ItemsBrowsePage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { RequestDetailPage } from "../features/requests/RequestDetailPage";
import { RequestFormPage } from "../features/requests/RequestFormPage";
import { RequestsListPage } from "../features/requests/RequestsListPage";
import { ItemDetailPage } from "../features/public/ItemDetailPage";
import { LandingPage } from "../features/public/LandingPage";
import { NotFoundPage } from "../features/public/NotFoundPage";
import { ScanPage } from "../features/public/ScanPage";
import { AppLayout } from "./AppLayout";
import { PublicLayout } from "./PublicLayout";
import { RequireAuth } from "./RequireAuth";
import { RootProviders } from "./RootProviders";

/**
 * The route map from `frontend-plan.md` §6. Two shells, exactly as
 * `frontend-design-system.md` §9 describes them:
 *
 * - **Shell A** (`PublicLayout`) — `/`, `/items`, `/scan`, `/item/:tagId`,
 *   `/login`: open to everyone, including anonymous visitors.
 * - **Shell B/C** (`AppLayout` behind `RequireAuth`) — everything staff/admin:
 *   dashboard, item management, requests, notifications, admin screens.
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
    element: <RootProviders />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: "/", element: <LandingPage /> },
          { path: "/items", element: <ItemsBrowsePage /> },
          { path: "/scan", element: <ScanPage /> },
          { path: "/item/:tagId", element: <ItemDetailPage /> },
          { path: "/login", element: <LoginPage /> },
          { path: "*", element: <NotFoundPage /> },
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
