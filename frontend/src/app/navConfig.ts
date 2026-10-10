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
   *   - `unread-notifications` — the signed-in user's own unread inbox, shown to
   *     whoever is signed in, because everyone has one.
   */
  badge?: "pending-count" | "unread-notifications";
}

/** Phase 3: the last of the plan's destinations — audit and reports — is now in the nav. */
export const CURRENT_PHASE = 3;

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN", "STAFF"], phase: 1 },
  { label: "Scan", to: "/scan", icon: ScanLine, roles: ["ADMIN", "STAFF"], phase: 1, emphasized: true },
  { label: "Items", to: "/items", icon: Package, roles: ["ADMIN", "STAFF"], phase: 1 },
  { label: "Requests", to: "/requests", icon: ClipboardList, roles: ["ADMIN", "STAFF"], phase: 2, badge: "pending-count" },
  { label: "Notifications", to: "/notifications", icon: Bell, roles: ["ADMIN", "STAFF"], phase: 2, badge: "unread-notifications" },
  { label: "New item", to: "/items/new", icon: Tag, roles: ["ADMIN", "STAFF"], phase: 2 },
  { label: "Audit", to: "/audit/new", icon: ClipboardCheck, roles: ["ADMIN", "STAFF"], phase: 3 },
  { label: "Audit history", to: "/audits", icon: History, roles: ["ADMIN", "STAFF"], phase: 3 },
  { label: "Reports", to: "/reports", icon: FileBarChart, roles: ["ADMIN", "STAFF"], phase: 3 },
  { label: "Accounts", to: "/admin/users", icon: ShieldCheck, roles: ["ADMIN"], phase: 2 },
  { label: "Categories", to: "/admin/categories", icon: Tag, roles: ["ADMIN"], phase: 2 },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.phase <= CURRENT_PHASE && item.roles.includes(role));
}
