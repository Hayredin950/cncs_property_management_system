import { LayoutDashboard, Package, ScanLine, type LucideIcon } from "lucide-react";
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
   * exist yet — Phase 2/3 append entries here instead of restructuring the
   * shell (see docs/frontend-phase-1.md).
   */
  phase: 1 | 2 | 3;
}

export const CURRENT_PHASE = 1;

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN", "STAFF"], phase: 1 },
  { label: "Scan", to: "/scan", icon: ScanLine, roles: ["ADMIN", "STAFF"], phase: 1, emphasized: true },
  { label: "Items", to: "/items", icon: Package, roles: ["ADMIN", "STAFF"], phase: 1 },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.phase <= CURRENT_PHASE && item.roles.includes(role));
}
