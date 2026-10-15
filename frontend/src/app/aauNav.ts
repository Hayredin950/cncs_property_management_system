import {
  Briefcase,
  ClipboardCheck,
  Info,
  Package,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  canCreateItems,
  canManageAccounts,
  canRunAudits,
  canViewAudits,
  canViewReports,
  hasCapability,
  seesAllItems,
} from "../lib/permissions";
import type { Role } from "../types/enums";

/**
 * The AAU header's navigation model.
 *
 * aau.edu.et drives its header from a Radix `NavigationMenu` whose top level is
 * eight drop-down triggers, each panel a two-or-three column grid of grouped
 * links. This file keeps that *shape* — grouped panels with small uppercase
 * headings — but fills it with this app's real destinations instead of AAU's
 * public pages, so nothing in the header dead-ends (see the note on
 * `PUBLIC_NAV`).
 *
 * Kept separate from `navConfig.ts` on purpose: that file is the portal
 * sidebar's flat, icon-bearing, role-filtered list (the `portal.aau.edu.et`
 * pattern), while this is the marketing header's grouped menu tree (the
 * `aau.edu.et` pattern). Same app, two different upstream nav idioms, and
 * conflating them would force one of the two to compromise its shape.
 */

export interface AauNavLink {
  label: string;
  to: string;
  /**
   * The drawer's leading icon, from the same `lucide` set the bottom tab bar and
   * the portal sidebar use.
   *
   * Optional, and read by the mobile drawer only: the desktop menu bar is a
   * deliberate class-for-class copy of `aau.edu.et`'s, which has no icons in its
   * top level, so adding one there would be the single detail announcing that the
   * header is not the official one.
   */
  icon?: LucideIcon;
}

export interface AauNavMenuSection {
  /** Renders as the small uppercase label above a column, e.g. "Find an asset". */
  heading: string;
  links: AauNavLink[];
}

export interface AauNavMenu {
  label: string;
  sections: AauNavMenuSection[];
  /** See `AauNavLink.icon` — drawer only, never the desktop bar. */
  icon?: LucideIcon;
}

export type AauNavEntry = AauNavLink | AauNavMenu;

/** Narrows an entry to the drop-down kind. `sections` is the discriminant. */
export function isNavMenu(entry: AauNavEntry): entry is AauNavMenu {
  return "sections" in entry;
}

/**
 * Header nav for visitors who are not signed in — every link resolves to a real
 * route in `app/router.tsx`.
 *
 * There is deliberately no seventh entry that mirrors AAU's "Admission",
 * "Academics" or "Research": those pages are on aau.edu.et, not here, and a
 * header that links into a different origin's IA is exactly the tell that a
 * clone was assembled from screenshots. Menu *labels* can differ; the point is
 * that this header sits on the same grid, in the same face, at the same
 * weights as the official one.
 */
export const PUBLIC_NAV: AauNavEntry[] = [
  {
    label: "Assets",
    icon: Package,
    sections: [
      {
        heading: "Find an asset",
        links: [
          { label: "All items", to: "/items" },
          { label: "Browse by building", to: "/map" },
        ],
      },
      {
        heading: "QR tags",
        links: [{ label: "Scan a tag", to: "/scan" }],
      },
    ],
  },
  {
    label: "About",
    icon: Info,
    sections: [
      {
        heading: "This system",
        links: [
          { label: "Property register home", to: "/" },
          { label: "Recently added", to: "/items" },
        ],
      },
      {
        heading: "For staff",
        links: [
          { label: "Staff sign in", to: "/login" },
          { label: "Staff portal", to: "/dashboard" },
        ],
      },
    ],
  },
];

/**
 * Header nav for a signed-in staff member or admin.
 *
 * Roles are filtered exactly like `navConfig.ts` does, and for the same reason:
 * a STAFF user deep-linking `/admin/users` already gets the shared 404
 * (`RequireAuth`), so showing the menu would advertise a door that does not
 * open for them.
 */
export function staffNav(role: Role): AauNavEntry[] {
  const entries: AauNavEntry[] = [];

  // A SYSTEM_ADMIN runs accounts, not assets (spec 2.1.1), so it gets the inbox
  // and the admin menu and nothing else.
  if (canManageAccounts(role)) {
    entries.push({
      label: "Admin",
      icon: ShieldCheck,
      sections: [
        {
          heading: "Access",
          links: [{ label: "Accounts", to: "/admin/users" }],
        },
        {
          heading: "Notifications",
          links: [{ label: "Inbox", to: "/notifications" }],
        },
      ],
    });
    return entries;
  }

  /**
   * "All items" is only true for a role that is given the college's register.
   *
   * `/items` is the same URL for every role — the server scopes it
   * (`services/itemScope.ts`) — so a Staff member following a link labelled "All
   * items" arrives at a list of only their own holdings and concludes the
   * register is empty. The label now says which of the two they are about to see,
   * and points at the sidebar's own "My Items" address so the two agree.
   */
  const assetLinks: AauNavLink[] = [
    seesAllItems(role)
      ? { label: "All items", to: "/items" }
      : { label: "My items", to: "/items?mine=true" },
  ];
  if (canCreateItems(role)) {
    assetLinks.push({ label: "Register new item", to: "/items/new" });
  }

  entries.push({
    label: "Work",
    icon: Briefcase,
    sections: [
      { heading: "Assets", links: assetLinks },
      {
        heading: "Requests",
        links: [
          { label: "All requests", to: "/requests" },
          { label: "File a request", to: "/requests/new" },
        ],
      },
      {
        heading: "Notifications",
        links: [{ label: "Inbox", to: "/notifications" }],
      },
    ],
  });

  const auditSections: AauNavMenuSection[] = [];
  if (canRunAudits(role)) {
    auditSections.push({
      heading: "Counting",
      links: [
        { label: "Start an audit", to: "/audit/new" },
        { label: "Scan an audit", to: "/scan" },
      ],
    });
  }
  if (canViewAudits(role) || canViewReports(role)) {
    const reportingLinks: AauNavLink[] = [];
    if (canViewAudits(role)) {
      // The history sits beside the reports because they answer the same
      // question — "what did we find last time?" — and neither is reachable
      // from the other without knowing a session id.
      reportingLinks.push({ label: "Past audits", to: "/audits" });
    }
    if (canViewReports(role)) {
      reportingLinks.push({ label: "Reports & exports", to: "/reports" });
    }
    auditSections.push({ heading: "Reporting", links: reportingLinks });
  }
  if (auditSections.length > 0) {
    entries.push({ label: "Audit", icon: ClipboardCheck, sections: auditSections });
  }

  if (hasCapability(role, "CATEGORY_MANAGE")) {
    entries.push({
      label: "Catalogue",
      icon: Package,
      sections: [
        { heading: "Categories", links: [{ label: "Categories", to: "/admin/categories" }] },
      ],
    });
  }

  return entries;
}
