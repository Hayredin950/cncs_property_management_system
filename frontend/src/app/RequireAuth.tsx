import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { NotFoundPage } from "../features/public/NotFoundPage";
import type { Role } from "../types/enums";
import { useAuth } from "./AuthContext";

export interface RequireAuthProps {
  children: ReactNode;
  roles?: Role[];
}

/**
 * Route guard (frontend-plan.md §8): "nav renders only routes the role can use;
 * unknown routes 404." This is UX, not security — the API enforces the real
 * boundary (`requireRole` in the backend). If the API ever answers 403/404,
 * that is the truth; this component only avoids showing a logged-out visitor a
 * staff-only screen that would just bounce off the server anyway.
 */
export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return null;
  }

  if (status === "anonymous" || !user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
