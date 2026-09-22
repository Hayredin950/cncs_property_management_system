import { AppLayout } from "./AppLayout";
import { useAuth } from "./AuthContext";
import { PublicLayout } from "./PublicLayout";

/**
 * The shell for a route that **both audiences use at the same address**.
 *
 * `/items` and `/scan` are staff sidebar destinations *and* the public surfaces a
 * visitor without an account uses (browse the register; scan a tag). Neither
 * shell is unconditionally right for them, and hard-wiring them to
 * `PublicLayout` was actively broken for the staff case: clicking "Scan" or
 * "Items" in the sidebar navigated out of the workbench entirely, so the nav,
 * the review-queue badge, the health indicator and Sign out all vanished and the
 * only way back was the browser's Back button.
 *
 * Deciding per *request* rather than per *route* keeps both contracts intact:
 *
 *   - signed in → the workbench shell, so the sidebar the user just clicked in
 *     is still there on arrival;
 *   - anonymous → Shell A, unchanged, because a member of the public has no
 *     sidebar to keep and must not be shown staff chrome;
 *   - the **page** is byte-for-byte the same in both cases. This wrapper chooses
 *     chrome only — it never branches on role for content, so it can't drift
 *     from the server-enforced field-visibility rule
 *     (docs/frontend-handoff.md).
 *
 * `status === "loading"` (a stored token mid-rehydration) renders Shell A for
 * the one frame it takes `/auth/me` to answer, which is what `PublicLayout`
 * already does for its header — guessing "staff" from the mere *presence* of a
 * token is the thing `AuthContext` exists to avoid.
 */
export function SmartLayout() {
  const { user } = useAuth();
  return user ? <AppLayout /> : <PublicLayout />;
}
