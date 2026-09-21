import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ItemsBrowsePage } from "../features/items/ItemsBrowsePage";
import { StaffItemDetailPage } from "../features/items/StaffItemDetailPage";
import { ItemDetailPage } from "../features/public/ItemDetailPage";
import { LandingPage } from "../features/public/LandingPage";
import { NotFoundPage } from "../features/public/NotFoundPage";
import { ScanPage } from "../features/public/ScanPage";
import { RequestsListPage } from "../features/requests/RequestsListPage";
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
 * - **Shell B/C** (`AppLayout` behind `RequireAuth`) — `/dashboard`,
 *   `/items/:id`: staff/admin only.
 *
 * `*` lives under the public shell so an unknown path still gets a header and
 * footer rather than a bare error box. Route *ranking* (not array order) means
 * the specific authenticated paths win over the catch-all.
 *
 * Note `/item/:tagId` (singular, public, the QR destination) and `/items/:id`
 * (plural, staff detail) are different routes by design — see the plan's route
 * map. `qrGenerator.ts` encodes the singular form, so it must not change.
 *
 * Exported as `appRoutes` (the array) as well as the browser router, so the
 * test harness can mount the *production* tree inside `createMemoryRouter`
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
          { path: "/items/:id", element: <StaffItemDetailPage /> },
          { path: "/requests", element: <RequestsListPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
