# Role-Based UI Implementation - Backend Handoff

## What Was Implemented (Frontend)

The role-based UI specification (docs/role-based-ui-spec.md) has been implemented at the navigation and dashboard conditional rendering level for all 5 roles:

- **STAFF**: Removed "Scan" nav, changed "Items" to "My Items", changed "Requests" to "My Requests"
- **PROPERTY_OFFICER**: Added "Buildings" and "Audits" nav items, renamed "Scan" to "Scan a Tag", renamed "Items" to "Browse Items"
- **DEPARTMENT_HEAD**: Changed "Browse Items" to "My Items", changed "Requests" to "Department Requests", removed "Reports"
- **AUDITOR**: Removed "Scan", "Browse Items", "Requests", and "Reports" nav items, renamed "Audit" to "Active Audit", removed Scan/Browse tiles from dashboard
- **SYSTEM_ADMIN**: Merged ACCOUNT_ADMIN into SYSTEM_ADMIN (per roadmap 12 Oct decision), changed "Accounts" to "Account Admins", added "System Config" nav item, updated dashboard to show "System Administration" section

All frontend tests pass (191 tests), all backend tests pass (460 tests).

## What Still Needs Backend Implementation

The following backend endpoints are needed to complete the role-based dashboard widgets. These are data endpoints; the UI scaffolding is already in place.

### 1. Buildings Route
**Nav item added for PROPERTY_OFFICER:** `/buildings`
- Route to manage/view buildings
- CRUD operations for building entities
- Property Officer only

### 2. System Config Route
**Nav item added for SYSTEM_ADMIN:** `/admin/system`
- Route for system configuration (environment settings, deploy info, etc.)
- System Admin only

### 3. Recently Registered Items Widget
**Needed for PROPERTY_OFFICER dashboard:**
- Endpoint: `GET /items/recent?limit=5`
- Returns last 5 registered items with quick links
- Property Officer only

### 4. Overdue Loans Flag Widget
**Needed for PROPERTY_OFFICER dashboard:**
- Endpoint: `GET /loans/overdue`
- Returns count of overdue loans
- Widget should only render if count > 0 (hide at zero)
- Property Officer only

### 5. Their Own Held Items Widget
**Needed for DEPARTMENT_HEAD dashboard:**
- Endpoint: `GET /items/held-by-me?summary=true`
- Returns summary count of items held by the logged-in user
- Department Heads can hold property like staff, so they need this visibility
- Returns count + link to filtered items view

### 6. Department Roster Snapshot Widget
**Needed for DEPARTMENT_HEAD dashboard (optional per spec):**
- Endpoint: `GET /departments/:id/roster`
- Returns staff count for the department
- Department Head only (for their own department)

### 7. Current Audit Progress Widget
**Needed for AUDITOR dashboard:**
- Endpoint: `GET /audits/active`
- Returns active audit session with: scope, items scanned vs. remaining count
- If no audit is open, returns a flag to show "Start new audit" prompt instead of an empty card
- Auditor only

### 8. Open Findings Needing Follow-Up Widget
**Needed for AUDITOR dashboard:**
- Endpoint: `GET /audits/findings?status=OPEN`
- Returns count of items marked MISSING awaiting review
- Auditor only

### 9. Audit History Quick List Widget
**Needed for AUDITOR dashboard:**
- Endpoint: `GET /audits?limit=3&sort=completedAt:desc`
- Returns last 3 completed audits with quick links
- Auditor only

### 10. System Status Card
**Needed for SYSTEM_ADMIN dashboard:**
- Endpoint: `GET /system/status`
- Returns: environment (production/staging), last deploy time, uptime indicator
- System Admin only

### 11. Recent System Events
**Needed for SYSTEM_ADMIN dashboard:**
- Endpoint: `GET /system/events?limit=10`
- Returns: failed logins, errors, migration events
- Explicitly NOT asset/item/request activity of any kind
- System Admin only

## Implementation Notes

- All routes should follow the existing permission pattern: check capabilities using `requireCapability()` in the backend
- Widget endpoints should return minimal data needed for display (e.g., count + link, not full object graphs)
- The System Config route should be a configuration page for system-wide settings
- The Buildings route should integrate with the existing Building model in the Prisma schema

## Notification Rules (§9 of UI Spec)

The spec requires that notifications are only generated for users who hold the specific capability:
- "Needs your review" notifications → only for approvers with the exact capability (e.g., `TRANSFER_APPROVE_STAGE1` for stage-1 approver)
- "Your request was approved/rejected" → only to the original requester
- System/account notifications → never reference item names, tag IDs, or asset actions

**Action needed:** Check existing notifications in the database for violations and perform a cleanup/backfill pass if needed. The fix must be at generation time, not just display-time filtering.

## Next Steps

1. Implement the 11 backend endpoints listed above
2. Implement the Buildings and System Config pages/routes
3. Add the dashboard widgets to consume these endpoints
4. Perform notification cleanup/backfill if violations found
5. Deploy and verify live on production
