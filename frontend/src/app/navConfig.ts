import {
  Bell,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  History,
  LayoutDashboard,
  Package,
  ScanLine,
  ShieldCheck,
  Tag,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "../types/enums";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: Role[];
  /** Highlighted with the `accent` treatment as the flagship action (§9 of the design doc). */
  emphasized?: boolean;
  /**
   * Which phase introduced this destination. The shell filters to
   * `phase <= CURRENT_PHASE` so the nav never links to a route that doesn't
   * exist yet — Phase 3 appends entries here instead of restructuring the
   * shell (see docs/frontend-phase-1.md).
   */
  phase: 1 | 2 | 3;
  /**
   * Renders a live count next to the label. Two kinds, and they are measured in
   * different things — see `badgeFor` in `AppLayout.tsx`:
   *
   *   - `pending-count` — the review queue's size, shown to an admin only, since
   *     the queue is theirs.
   *   - `approvals-count` — the account approval queue size, shown to SYSTEM_ADMIN and DEPARTMENT_HEAD.
   *   - `unread-notifications` — the signed-in user's own unread inbox, shown to
   *     whoever is signed in, because everyone has one.
   */
  badge?: "pending-count" | "approvals-count" | "unread-notifications";
}

/** Phase 3: the last of the plan's destinations — audit and reports — is now in the nav. */
export const CURRENT_PHASE = 3;

/**
 * Role lists mirror the backend permission matrix (spec 2.2). The System Admin is
 * an account role and sees no asset data, so it only gets Dashboard,
 * Notifications and Accounts — not Items or Scan.
 *
 * ── Every `to` here must resolve to a route `app/router.tsx` declares ──────
 * A sidebar row that opens the 404 page is worse than no row at all: it tells the
 * user the feature exists and then denies it, and it hides the real answer
 * ("not built yet"). Four rows were removed for exactly that reason —
 * `/account-requests`, `/buildings`, `/admin/account-requests` and
 * `/admin/system` were declared in neither `appRoutes` nor any spec deliverable
 * (monolithic design §12, "No route declared — fix routing"), and the screens
 * they promise (the T5 approval queue, building management, system config) are
 * still `[BUILD]` in §5.1/§12. They come back one at a time, each in the same
 * commit as its route; `test/navRoutes.test.tsx` fails the build if one returns
 * ahead of its page.
 *
 * The System Admin's pending-approval queue is not lost with those rows: it is
 * the "Waiting for approval" panel on `/admin/users`, which is why that row
 * carries the same `pending-count` badge the removed row had.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ["SYSTEM_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"], phase: 1 },
  { label: "Scan a Tag", to: "/scan", icon: ScanLine, roles: ["PROPERTY_OFFICER"], phase: 1, emphasized: true },
  { label: "Browse Items", to: "/items", icon: Package, roles: ["PROPERTY_OFFICER"], phase: 1 },
  { label: "Browse Items", to: "/items?scope=all", icon: Package, roles: ["DEPARTMENT_HEAD"], phase: 1 },
  { label: "Browse Items", to: "/items?scope=mine", icon: Package, roles: ["STAFF"], phase: 1 },
  { label: "Requests", to: "/requests", icon: ClipboardList, roles: ["PROPERTY_OFFICER"], phase: 2, badge: "pending-count" },
  { label: "Department Requests", to: "/requests", icon: ClipboardList, roles: ["DEPARTMENT_HEAD"], phase: 2, badge: "pending-count" },
  { label: "My Requests", to: "/requests?mine=true", icon: ClipboardList, roles: ["STAFF"], phase: 2 },
  { label: "Notifications", to: "/notifications", icon: Bell, roles: ["SYSTEM_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"], phase: 2, badge: "unread-notifications" },
  { label: "New item", to: "/items/new", icon: Tag, roles: ["PROPERTY_OFFICER"], phase: 2 },
  { label: "Active Audit", to: "/audit/new", icon: ClipboardCheck, roles: ["AUDITOR"], phase: 3 },
  { label: "Audit history", to: "/audits", icon: History, roles: ["PROPERTY_OFFICER", "AUDITOR"], phase: 3 },
  { label: "Reports", to: "/reports", icon: FileBarChart, roles: ["PROPERTY_OFFICER", "AUDITOR"], phase: 3 },
  // The queue and the account list are one screen, so they are one row: the
  // "Waiting for approval" panel sits above "Create an account" on `/admin/users`.
  { label: "Accounts", to: "/admin/users", icon: ShieldCheck, roles: ["SYSTEM_ADMIN", "DEPARTMENT_HEAD"], phase: 2, badge: "approvals-count" },
  { label: "System Status", to: "/admin/system", icon: LayoutDashboard, roles: ["SYSTEM_ADMIN"], phase: 3 },
  // The account log, in full. The dashboard shows the last few; this is the rest.
  { label: "System Events", to: "/admin/events", icon: ScrollText, roles: ["SYSTEM_ADMIN"], phase: 3 },
  { label: "Categories", to: "/admin/categories", icon: Tag, roles: ["PROPERTY_OFFICER"], phase: 2 },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.phase <= CURRENT_PHASE && item.roles.includes(role));
}
