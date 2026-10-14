import { describe, expect, it } from "vitest";
import type { RouteObject } from "react-router-dom";
import { appRoutes } from "../app/router";
import { CURRENT_PHASE, NAV_ITEMS, visibleNavItems } from "../app/navConfig";
import type { Role } from "../types/enums";

/**
 * Every sidebar row must open a real page.
 *
 * The bug this exists to prevent (monolithic design §12): four nav rows —
 * `/account-requests`, `/buildings`, `/admin/account-requests` and
 * `/admin/system` — pointed at routes `app/router.tsx` never declared, so a
 * Department Head or System Admin clicking them landed on the shared 404. The
 * audit found them by clicking; a test can find them by reading, which is why
 * this runs on `NAV_ITEMS` and the exported route tree rather than on a
 * snapshot of either.
 *
 * It compares against `appRoutes` — the array the real `createBrowserRouter`
 * is built from — and not a hand-copied list, so a route added or renamed in
 * `router.tsx` is reflected here without editing this file.
 */

/** The `path` of every route in the tree, including nested and shell-less ones. */
function declaredPaths(routes: RouteObject[]): Set<string> {
  const paths = new Set<string>();
  const walk = (route: RouteObject): void => {
    if (typeof route.path === "string") paths.add(route.path);
    for (const child of route.children ?? []) walk(child);
  };
  for (const route of routes) walk(route);
  return paths;
}

/** `"/items?mine=true"` → `"/items"`; a sidebar row's query string is its own state, not its address. */
function pathnameOf(to: string): string {
  return to.split("?")[0] ?? to;
}

const DECLARED = declaredPaths(appRoutes);

const ALL_ROLES: Role[] = [
  "SYSTEM_ADMIN",
  "PROPERTY_OFFICER",
  "DEPARTMENT_HEAD",
  "STAFF",
  "AUDITOR",
];

describe("every nav destination has a declared route", () => {
  it("declares at least the routes the nav needs, so the check below is not vacuous", () => {
    // If `appRoutes` were ever emptied or restructured, the assertion below
    // would pass for the wrong reason. These four are load-bearing.
    expect(DECLARED.has("/dashboard")).toBe(true);
    expect(DECLARED.has("/items")).toBe(true);
    expect(DECLARED.has("/audit/:id/report")).toBe(true);
    expect(DECLARED.has("*")).toBe(true);
  });

  it.each(NAV_ITEMS.map((item) => [item.label, item.to] as const))(
    '"%s" (%s) resolves to a declared route',
    (_label, to) => {
      expect(DECLARED.has(pathnameOf(to))).toBe(true);
    },
  );

  it("gives every role at least one destination, and none of them a 404", () => {
    for (const role of ALL_ROLES) {
      const items = visibleNavItems(role);
      expect(items.length, `${role} has no nav at all`).toBeGreaterThan(0);
      for (const item of items) {
        expect(DECLARED.has(pathnameOf(item.to)), `${role} → ${item.to}`).toBe(true);
      }
    }
  });

  it("does not ship a nav row for a later phase", () => {
    expect(NAV_ITEMS.every((item) => item.phase <= CURRENT_PHASE)).toBe(true);
  });
});
