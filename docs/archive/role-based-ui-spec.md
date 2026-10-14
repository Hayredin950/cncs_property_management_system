> **ARCHIVED 2026-10-14 — not the current truth. Read [`../monolithic-system-design.md`](../monolithic-system-design.md) instead.**
>
> Nav and widget spec. The source of truth's section 13 restates its lists and supersedes them where they differ.
>
> Kept as a record of what was decided at the time, nothing more. It is not maintained,
> and anything in it that disagrees with the source of truth is the old decision losing.

# Role-Based UI Specification

## Overview
This document defines the navigation, dashboard widgets, notification rules, and verification checklist for each of the 5 roles in the CNCS Property Management System.

## Roles
- SYSTEM_ADMIN
- PROPERTY_OFFICER
- DEPARTMENT_HEAD
- STAFF
- AUDITOR

---

## Navigation Per Role

### SYSTEM_ADMIN
**Navigation Items:**
- Dashboard
- Account Admins (`/admin/users`)
- Account Requests (`/admin/account-requests`)
- System Config (`/admin/system`)
- Notifications (`/notifications`)

**Purpose:** Account administration only — sees no asset data. Can approve/reject account requests, manage user accounts, and configure system settings.

---

### PROPERTY_OFFICER
**Navigation Items:**
- Dashboard
- Scan a Tag (`/scan`) [emphasized]
- Browse Items (`/items`)
- Requests (`/requests`) [badge: pending-count]
- Buildings (`/buildings`)
- Active Audit (`/audit/new`)
- Audit History (`/audits`)
- Reports (`/reports`)
- Categories (`/admin/categories`)
- Notifications (`/notifications`) [badge: unread-notifications]

**Purpose:** College-wide operational role. Sees all items, manages buildings, approves requests, runs audits, generates reports.

---

### DEPARTMENT_HEAD
**Navigation Items:**
- Dashboard
- My Items (`/items?mine=true`)
- Department Requests (`/requests`) [badge: pending-count]
- Account Requests (`/account-requests`) [badge: pending-count]
- Notifications (`/notifications`) [badge: unread-notifications]

**Purpose:** Department-level operational role. Sees their department's items, approves staff requests within their department, approves account requests for their department.

**Note:** "My Items" means items the Department Head personally holds (not all department items). Department items visible through Requests approval queue.

---

### STAFF
**Navigation Items:**
- Dashboard
- My Items (`/items?mine=true`)
- My Requests (`/requests?mine=true`)
- Notifications (`/notifications`) [badge: unread-notifications]

**Purpose:** Custodian role. Sees only items they hold, can file transfer/disposal/loan requests for items they hold.

---

### AUDITOR
**Navigation Items:**
- Dashboard
- Active Audit (`/audit/new`)
- Audit History (`/audits`)
- Notifications (`/notifications`) [badge: unread-notifications]

**Purpose:** Read-only audit role. Runs audits, reviews audit findings, accesses audit history. No item or request management.

---

## Dashboard Widgets Per Role

### SYSTEM_ADMIN Dashboard
**Widgets:**
1. **System Status Card**
   - Endpoint: `GET /admin/system/status`
   - Shows: environment (production/staging), last deploy time, uptime indicator
   - Always visible

2. **Recent System Events**
   - Endpoint: `GET /admin/system/events?limit=10`
   - Shows: failed logins, errors, migration events
   - Explicitly NOT asset/item/request activity
   - Always visible

---

### PROPERTY_OFFICER Dashboard
**Widgets:**
1. **Recently Registered Items**
   - Endpoint: `GET /items/recent?limit=5`
   - Shows: last 5 registered items with quick links
   - Always visible

2. **Overdue Loans Flag**
   - Endpoint: `GET /loans/overdue`
   - Shows: count of overdue loans
   - Hidden if count = 0
   - Shows warning styling when visible

---

### DEPARTMENT_HEAD Dashboard
**Widgets:**
1. **Their Own Held Items**
   - Endpoint: `GET /items/held-by-me?summary=true`
   - Shows: summary count of items they personally hold
   - Returns: count + link to filtered items view
   - Always visible

2. **Department Roster Snapshot** (optional)
   - Endpoint: `GET /departments/:id/roster`
   - Shows: staff count for their department
   - Department Head only (for their own department)

---

### AUDITOR Dashboard
**Widgets:**
1. **Current Audit Progress**
   - Endpoint: `GET /audits/active`
   - Shows: active audit session with scope, items scanned vs. remaining count
   - If no audit open: shows "Start new audit" prompt instead of empty card
   - Always visible

2. **Open Findings Needing Follow-Up**
   - Endpoint: `GET /audits/findings?status=OPEN`
   - Shows: count of items marked MISSING awaiting review
   - Hidden if count = 0
   - Shows warning styling when visible

3. **Audit History Quick List**
   - Endpoint: `GET /audits?limit=3&sort=completedAt:desc`
   - Shows: last 3 completed audits with quick links
   - Always visible

---

### STAFF Dashboard
**Widgets:**
- No specialized widgets (simplified view)
- Shows general notifications and quick links to My Items/My Requests

---

## Notification Rules (§9)

### General Principles
- Notifications are only generated for users who hold the specific capability
- "Needs your review" notifications → only for approvers with the exact capability (e.g., `TRANSFER_APPROVE_STAGE1` for stage-1 approver)
- "Your request was approved/rejected" → only to the original requester
- System/account notifications → never reference item names, tag IDs, or asset actions
- Fix must be at generation time, not display-time filtering

### Capability-Based Notification Targets

**Transfer Requests:**
- Stage 1 approval notification → only users with `TRANSFER_APPROVE_STAGE1` (releasing head)
- Stage 2 approval notification → only users with `TRANSFER_APPROVE_STAGE2` (receiving head)
- Approval/rejection notification → only to original requester

**Disposal Requests:**
- Approval notification → only users with `DISPOSAL_APPROVE` (Property Officer)
- Approval/rejection notification → only to original requester

**Loan Requests:**
- Approval notification → only users with `LOAN_APPROVE` (approving head)
- Due date reminder → only to borrower
- Approval/rejection notification → only to original requester

**Account Requests:**
- Department-level approval → only users with `ACCOUNT_APPROVE_DEPARTMENT` (department head)
- System-level approval → only users with `ACCOUNT_APPROVE_SYSTEM` (SYSTEM_ADMIN)
- Approval/rejection notification → only to account requester

**Audit Events:**
- Audit completion notification → only to audit requester and SYSTEM_ADMIN
- Missing item findings → only to Auditor and item's holding department head

---

## Verification Checklist Per Role

### SYSTEM_ADMIN Verification
- [ ] Can access Dashboard
- [ ] Can access Account Admins page
- [ ] Can access Account Requests page with pending-count badge
- [ ] Can access System Config page
- [ ] Can access Notifications with unread-notifications badge
- [ ] Cannot see Items, Scan, Requests, Reports, Buildings, Audits navigation
- [ ] Dashboard shows System Status card
- [ ] Dashboard shows Recent System Events
- [ ] Cannot see any asset data in dashboard widgets
- [ ] Can approve/reject account requests
- [ ] Cannot approve item transfer/disposal/loan requests

### PROPERTY_OFFICER Verification
- [ ] Can access Dashboard
- [ ] Can access Scan a Tag (emphasized in nav)
- [ ] Can access Browse Items
- [ ] Can access Requests with pending-count badge
- [ ] Can access Buildings
- [ ] Can access Active Audit
- [ ] Can access Audit History
- [ ] Can access Reports
- [ ] Can access Categories
- [ ] Can access Notifications with unread-notifications badge
- [ ] Dashboard shows Recently Registered Items widget
- [ ] Dashboard shows Overdue Loans widget (hidden if zero)
- [ ] Can see all items in Browse Items
- [ ] Can approve transfer/disposal/loan requests
- [ ] Can manage buildings (CRUD)
- [ ] Can run audits
- [ ] Can generate reports

### DEPARTMENT_HEAD Verification
- [ ] Can access Dashboard
- [ ] Can access My Items (items they personally hold)
- [ ] Can access Department Requests with pending-count badge
- [ ] Can access Account Requests with pending-count badge
- [ ] Can access Notifications with unread-notifications badge
- [ ] Cannot see Scan, Browse Items, Reports, Buildings, Audits navigation
- [ ] Cannot see "Department Items" in nav (removed per spec)
- [ ] Dashboard shows Their Own Held Items widget
- [ ] Dashboard shows Department Roster Snapshot (optional)
- [ ] "My Items" shows only items they personally hold (not all department items)
- [ ] Can approve transfer/disposal/loan requests within their department
- [ ] Can approve account requests for their department
- [ ] Cannot see items outside their department in Browse Items

### STAFF Verification
- [ ] Can access Dashboard
- [ ] Can access My Items
- [ ] Can access My Requests
- [ ] Can access Notifications with unread-notifications badge
- [ ] Cannot see Scan, Browse Items, Requests (without mine=true), Reports, Buildings, Audits, Account Admins navigation
- [ ] "My Items" shows only items they hold
- [ ] "My Requests" shows only their own requests
- [ ] Can file transfer/disposal/loan requests for items they hold
- [ ] Cannot see items held by others
- [ ] Cannot approve any requests

### AUDITOR Verification
- [ ] Can access Dashboard
- [ ] Can access Active Audit
- [ ] Can access Audit History
- [ ] Can access Notifications with unread-notifications badge
- [ ] Cannot see Scan, Browse Items, Requests, Reports, Buildings, Categories, Account Admins navigation
- [ ] Dashboard shows Current Audit Progress widget
- [ ] Dashboard shows Open Findings widget (hidden if zero)
- [ ] Dashboard shows Audit History Quick List
- [ ] Can start new audit session
- [ ] Can scan items during audit
- [ ] Can complete audit and generate findings
- [ ] Cannot edit items or approve requests
- [ ] Read-only access to audit data only

---

## Collapsed Sidebar Behavior

### Desktop
- Sidebar collapses to icon-only view on narrow screens
- Navigation items show tooltips on hover
- Badge counts remain visible as small indicators
- Collapsed state persists per user

### Mobile
- Sidebar hidden by default
- Hamburger menu triggers drawer overlay
- Full navigation shown in drawer
- Swipe gesture to close drawer

### Transition
- Smooth animation between expanded/collapsed states
- Badge counts animate when updating
- No layout shift during transition

---

## Role-Specific Styling

### Navigation Emphasis
- "Scan a Tag" emphasized with accent treatment for PROPERTY_OFFICER and DEPARTMENT_HEAD
- This is the flagship action for operational roles

### Badge Behavior
- `pending-count`: shown to approvers only (Property Officer, Department Head, System Admin)
- `unread-notifications`: shown to all roles
- Badges animate when count changes
- Zero-count badges hidden

### Empty States
- Dashboard widgets show meaningful empty states when no data
- Empty states include action prompts (e.g., "Start new audit")
- Empty states are role-appropriate and actionable

---

## Implementation Notes

### Nav Configuration
- All navigation defined in `frontend/src/app/navConfig.ts`
- Role filtering implemented in `visibleNavItems()` function
- Phase gating via `phase` field on nav items
- Badge types: `pending-count`, `unread-notifications`

### Dashboard Widgets
- All widgets in `frontend/src/features/dashboard/widgets/`
- Graceful fallbacks for missing backend endpoints
- Widget visibility controlled by role and data availability
- Widgets use TanStack Query for data fetching

### Permissions
- Backend capability checks in `backend/src/services/permissions.ts`
- Frontend permission checks in `frontend/src/lib/permissions.ts`
- Middleware enforces capability requirements on routes
- Notification generation respects capability-based targeting

### Testing
- Frontend: role-based navigation tests in `frontend/src/test/`
- Backend: permission tests in `backend/src/routes/*.test.ts`
- Integration: end-to-end workflow tests for approval flows
