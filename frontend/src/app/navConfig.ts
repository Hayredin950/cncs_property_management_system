import {
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  History,
  LayoutDashboard,
  Package,
  ScanLine,
  Settings,
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

/**
 * Role lists mirror the backend permission matrix (spec 2.2). The System Admin is
 * an account role and sees no asset data, so it only gets Dashboard,
 * Notifications and Accounts — not Items or Scan.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ["SYSTEM_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"], phase: 1 },
  { label: "Scan a Tag", to: "/scan", icon: ScanLine, roles: ["PROPERTY_OFFICER"], phase: 1, emphasized: true },
  { label: "Browse Items", to: "/items", icon: Package, roles: ["PROPERTY_OFFICER"], phase: 1 },
  { label: "My Items", to: "/items?mine=true", icon: Package, roles: ["STAFF", "DEPARTMENT_HEAD"], phase: 1 },
  { label: "Requests", to: "/requests", icon: ClipboardList, roles: ["PROPERTY_OFFICER"], phase: 2, badge: "pending-count" },
  { label: "Department Requests", to: "/requests", icon: ClipboardList, roles: ["DEPARTMENT_HEAD"], phase: 2, badge: "pending-count" },
  { label: "My Requests", to: "/requests?mine=true", icon: ClipboardList, roles: ["STAFF"], phase: 2 },
  { label: "Account Requests", to: "/account-requests", icon: ClipboardList, roles: ["DEPARTMENT_HEAD"], phase: 2, badge: "pending-count" },
  { label: "Notifications", to: "/notifications", icon: Bell, roles: ["SYSTEM_ADMIN", "PROPERTY_OFFICER", "DEPARTMENT_HEAD", "STAFF", "AUDITOR"], phase: 2, badge: "unread-notifications" },
  { label: "Buildings", to: "/buildings", icon: Building2, roles: ["PROPERTY_OFFICER"], phase: 2 },
  { label: "New item", to: "/items/new", icon: Tag, roles: ["PROPERTY_OFFICER"], phase: 2 },
  { label: "Active Audit", to: "/audit/new", icon: ClipboardCheck, roles: ["AUDITOR"], phase: 3 },
  { label: "Audit history", to: "/audits", icon: History, roles: ["PROPERTY_OFFICER", "AUDITOR"], phase: 3 },
  { label: "Reports", to: "/reports", icon: FileBarChart, roles: ["PROPERTY_OFFICER"], phase: 3 },
  { label: "Account Admins", to: "/admin/users", icon: ShieldCheck, roles: ["SYSTEM_ADMIN"], phase: 2 },
  { label: "Account Requests", to: "/admin/account-requests", icon: ClipboardList, roles: ["SYSTEM_ADMIN"], phase: 2, badge: "pending-count" },
  { label: "System Config", to: "/admin/system", icon: Settings, roles: ["SYSTEM_ADMIN"], phase: 2 },
  { label: "Categories", to: "/admin/categories", icon: Tag, roles: ["PROPERTY_OFFICER"], phase: 2 },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.phase <= CURRENT_PHASE && item.roles.includes(role));
}
