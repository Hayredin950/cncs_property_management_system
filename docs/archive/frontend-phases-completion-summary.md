> **ARCHIVED 2026-10-14 — not the current truth. Read [`../monolithic-system-design.md`](../monolithic-system-design.md) instead.**
>
> Session summary written on `frontend/phase1-scaffold`, which is not the canonical branch.
>
> Kept as a record of what was decided at the time, nothing more. It is not maintained,
> and anything in it that disagrees with the source of truth is the old decision losing.

# Frontend Phases Completion Summary

**Date:** 2026-10-13
**Branch:** `frontend/phase1-scaffold`
**Target:** `personal/main`

## Overview

This session completed the role-based UI specification (Phase A) and implemented remaining items from Phases B and D of the roadmap.

## Phase A: Role-Based UI Specification (COMPLETED)

### Navigation Changes
Implemented role-specific navigation per `docs/role-based-ui-spec.md` for 5 roles (SYSTEM_ADMIN merged ACCOUNT_ADMIN per roadmap decision):

- **STAFF:** Removed "Scan", changed "Items" to "My Items", changed "Requests" to "My Requests"
- **PROPERTY_OFFICER:** Added "Buildings" and "Audits", renamed "Scan" to "Scan a Tag", renamed "Items" to "Browse Items"
- **DEPARTMENT_HEAD:** Changed "Browse Items" to "My Items", changed "Requests" to "Department Requests", removed "Reports"
- **AUDITOR:** Removed "Scan", "Browse Items", "Requests", "Reports", renamed "Audit" to "Active Audit"
- **SYSTEM_ADMIN:** Merged ACCOUNT_ADMIN functionality, changed "Accounts" to "Account Admins", added "System Config"

### Dashboard Widgets
Created 9 role-specific dashboard widgets with graceful backend fallbacks (widgets show empty/loading states if endpoints don't exist yet):

**PROPERTY_OFFICER:**
- RecentlyRegisteredItems - last 5 registered items
- OverdueLoans - count of overdue loans (only shows if > 0)

**DEPARTMENT_HEAD:**
- HeldItems - count of items held by user
- DepartmentRoster - staff count for department

**AUDITOR:**
- CurrentAuditProgress - active audit session progress or "Start new audit" prompt
- OpenFindings - count of MISSING items awaiting review (only shows if > 0)
- AuditHistoryQuickList - last 3 completed audits

**SYSTEM_ADMIN:**
- SystemStatus - environment, last deploy time, uptime
- RecentSystemEvents - failed logins, errors, migration events

### Data Hooks Created
All widget hooks gracefully handle 404 responses from missing backend endpoints:
- `useRecentItems()` (GET /items/recent)
- `useOverdueLoans()` (GET /loans/overdue)
- `useHeldItems()` (GET /items/held-by-me)
- `useDepartmentRoster()` (GET /departments/roster)
- `useActiveAudit()` (GET /audits/active)
- `useOpenFindings()` (GET /audits/findings?status=OPEN)
- `useAuditHistoryList()` (GET /audits?limit=3)
- `useSystemStatus()` (GET /system/status)
- `useRecentSystemEvents()` (GET /system/events)

## Phase B Refinements (COMPLETED)

### Notification Badge in Tab Title
Added browser tab title badge showing pending requests and unread notifications:
- Format: "(2 pending, 1 unread) CNCS Property Management"
- Updates dynamically as counts change
- Helps reviewers notice pending requests without checking the UI

### Request Detail itemChanges Display
After approve/reject, shows what changed on the request detail page:
- Displays edit log row count
- Displays cascaded accessories count
- Shows in a branded info card below the request details

## Phase D Polish (COMPLETED)

### Public Informational Page
Converted landing page from dynamic scan/search/browse to static informational page per spec §9:
- No item data, no building list, no "browse the register" link
- Hero section with system description and sign-in CTA
- Three info cards: Who can use this, How to get an account, Contact the Property Office
- Sign-in appears in hero, header bar, and drawer for anonymous visitors

## Already Complete (No Changes Needed)

### Phase C (Reports)
- Reports page (`/reports`) already exists with CSV/PDF exports for inventory, disposals, and audit
- All exports use authenticated blob downloads
- UTC date filters with validation

### Phase D Items
- Desktop QR scanner removal: QrScanner component is mobile-only (camera requires secure context)
- Phase 3 audit workflow already complete (start → scan → complete)
- PWA-lite already implemented (manifest, theme-color, apple-touch-icon)
- Health indicator already implemented
- Error boundary already implemented

## Backend Handoff

The following backend endpoints are needed for the dashboard widgets to fully function:

### Routes
- `/buildings` - Buildings management (nav item added for PROPERTY_OFFICER)
- `/admin/system` - System configuration (nav item added for SYSTEM_ADMIN)

### Widget Endpoints
- `GET /items/recent?limit=5` - Recently registered items
- `GET /loans/overdue` - Overdue loans count
- `GET /items/held-by-me?summary=true` - Items held by logged-in user
- `GET /departments/roster` - Department staff count
- `GET /audits/active` - Active audit session
- `GET /audits/findings?status=OPEN` - Open findings count
- `GET /audits?limit=3&sort=completedAt:desc` - Audit history quick list
- `GET /system/status` - System status
- `GET /system/events?limit=10` - Recent system events

All frontend widgets gracefully handle 404 responses from these endpoints, so the UI is ready to wire up immediately when the backend endpoints exist.

## Test Results

- Frontend tests: **192 passed**
- TypeScript build: **Passed**
- All Phase A, B, and D items completed and tested locally

## Commits

1. `d1771ff` - Implement role-based navigation and dashboard widgets per UI spec
2. `2cfc994` - Add role-specific dashboard widgets with graceful backend fallbacks
3. `f70a552` - Add Phase B refinements: tab title badge and request itemChanges display
4. `246e7b5` - Phase D: Convert landing page to static informational page per spec §9

## Open Questions / Conflicts

The role-based UI spec (`docs/role-based-ui-spec.md`) lists ACCOUNT_ADMIN as a separate role, but the roadmap (`docs/full-work-plan-and-roadmap.md`) states that ACCOUNT_ADMIN was merged into SYSTEM_ADMIN on 12 Oct. The implementation follows the roadmap's 5-role model. This should be resolved by:
- Either updating the UI spec to match the roadmap
- Or formally documenting the roadmap decision as authoritative

## Next Steps

1. Implement the 11 backend endpoints listed above
2. Implement the Buildings and System Config routes/pages
3. Deploy frontend and backend to production
4. Perform live role-by-role verification per the verification checklist in the UI spec
5. Resolve the ACCOUNT_ADMIN vs SYSTEM_ADMIN source-of-truth conflict
