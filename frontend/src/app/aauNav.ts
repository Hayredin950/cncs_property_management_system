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
}

export interface AauNavMenuSection {
  /** Renders as the small uppercase label above a column, e.g. "Find an asset". */
  heading: string;
  links: AauNavLink[];
}

export interface AauNavMenu {
  label: string;
  sections: AauNavMenuSection[];
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
  const entries: AauNavEntry[] = [
    {
      label: "Work",
      sections: [
        {
          heading: "Assets",
          links: [
            { label: "All items", to: "/items" },
            { label: "Register new item", to: "/items/new" },
          ],
        },
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
    },
    {
      label: "Audit",
      sections: [
        {
          heading: "Counting",
          links: [
            { label: "Start an audit", to: "/audit/new" },
            { label: "Scan an audit", to: "/scan" },
          ],
        },
        {
          heading: "Reporting",
          links: [{ label: "Reports & exports", to: "/reports" }],
        },
      ],
    },
  ];

  if (role === "ADMIN") {
    entries.push({
      label: "Admin",
      sections: [
        {
          heading: "Access",
          links: [{ label: "Accounts", to: "/admin/users" }],
        },
        {
          heading: "Catalogue",
          links: [{ label: "Categories", to: "/admin/categories" }],
        },
      ],
    });
  }

  return entries;
}
