import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets the viewport to the top of the new page on every navigation.
 *
 * React Router does not scroll for you, and the browser's own behaviour is to
 * keep the current offset — so following a link from a scrolled position (the
 * footer's "Items", say, or a link at the bottom of a long register page) landed
 * the new screen already scrolled down, with its `<h1>` off-screen. That is the
 * bug this closes.
 *
 * Two things happen on each path change:
 *
 *   1. `window.scrollTo(0, 0)` — the obvious half.
 *   2. focus moves to the `main` landmark (see `tabIndex={-1}` on each shell's
 *      `<main id="main-content">`). A sighted mouse user only needs the scroll,
 *      but a keyboard or screen-reader user is still parked on the old page's
 *      focus target; moving focus to the top makes the next Tab start from the
 *      new page. `preventScroll` keeps the focus move from fighting the scroll.
 *
 * Keyed on `pathname` only, not `search`: the register's filters are query
 * strings, and scrolling to the top on every keystroke-driven filter change
 * would be hostile.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const main = document.getElementById("main-content");
    main?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
