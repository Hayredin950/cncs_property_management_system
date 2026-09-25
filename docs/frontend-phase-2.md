# Frontend — Phase 2: Staff & Admin Workflows

**Status: core shipped; a few refinements outstanding** (see §Remaining). Days 9–10 of
[`Frontend_Three_Phase_Plan.md`](Frontend_Three_Phase_Plan.md) §3. Builds entirely on Phase 1's
client, auth shell, and layouts — see [`frontend-phase-1.md`](frontend-phase-1.md) first.

## What shipped

| Feature | Route | Files |
| --- | --- | --- |
| Dashboard (pending stat, shortcuts, queue preview) | `/dashboard` | `features/dashboard/DashboardPage.tsx` |
| Item registration | `/items/new` | `features/items/ItemFormPage.tsx` |
| Item editing (read-only when disposed) | `/items/:id/edit` | `features/items/ItemFormPage.tsx` |
| Staff item workbench (tag, accessories, history) | `/items/:id` | `features/items/ItemStaffPage.tsx` |
| Requests queue | `/requests` | `features/requests/RequestsListPage.tsx` |
| File a transfer / disposal | `/requests/new` | `features/requests/RequestFormPage.tsx` |
| Request detail + approve/reject | `/requests/:id` | `features/requests/RequestDetailPage.tsx` |
| Notifications inbox + mark-as-read | `/notifications` | `features/notifications/NotificationsPage.tsx` |
| Create accounts (G2-limited at the time — since closed) | `/admin/users` | `features/admin/AdminUsersPage.tsx` |
| Create categories | `/admin/categories` | `features/admin/AdminCategoriesPage.tsx` |
| Edit-history list (grouped by `editedAt`) | in `/items/:id` | `components/HistoryList.tsx` |
| Dialogs | — | `components/Modal.tsx`, `components/ConfirmDialog.tsx` |

Supporting layer: `api/requests.ts`, `api/notifications.ts`, `api/items.ts` (CRUD, history,
accessories, regenerate), `hooks/useRequestMutations.ts`, `hooks/useItemMutations.ts`,
`hooks/useNotifications.ts`, `hooks/useAuthMutations.ts`, and the matching
`types/request.ts` / `types/history.ts` / `types/notification.ts`.

## Decisions worth knowing

### Field visibility is still only in one place

Every new screen renders items through the same `ItemDetailView`. No Phase 2 screen added a
"hide this if not admin" branch — the register, detail, and request screens all show what the
API sends and nothing more. If you are adding a screen over an item, reuse `ItemDetailView`
rather than writing a new field list.

### `parentItemId` is never sent from the client

`POST` / `PUT /items` reject it with a 400 pointing at the accessories endpoint, so
`CreateItemPayload` (`api/items.ts`) omits the field entirely — bundling is only possible
through `POST /items/:id/accessories`. Making it unwritable in the type is the point.

### Photo is an upload, a camera shot, or a URL (G3 — closed)

This section used to say the photo field was a URL text box because there was no upload
endpoint. There is one now (`POST /uploads/photo`, backed by Cloudinary; see
`docs/backend-handoff.md`), so the field is `components/PhotoField.tsx`: three sources —
**camera** (`capture="environment"`), **gallery**, and a pasted **URL** — in both create and edit
mode, with a live `PhotoFrame` preview. Uploading is item-less on purpose, since the create form
has no item id yet: the file is stored the moment it is picked and the returned URL becomes the
form's `photoUrl`, so Save is still what commits it.

### Disposed items open read-only

Disposal is terminal (`PUT /items/:id` answers 409), so the edit form disables its fields and
explains why instead of letting someone fill in a form that cannot save.

### An item's location and custodian are transfer-only

`PUT /items/:id` refuses `building`, `floor`, `room` and `ownerId` for every role — they are
written only by an approved TRANSFER. The edit form renders them read-only and links to
`/requests/new?item=<tagId>`; leaving them editable would have invited a save the server rejects.
`POST /items` still sets all four, and an Admin's "Owner (custodian)" picker is why registration
is the moment to get the custodian right.

### One shared vocabulary

Status/type/condition chips come from `components/StatusBadges.tsx` and `types/enums.ts` —
`RequestStatusBadge`, `RequestTypeBadge`, `ConditionBadge`, `ItemStatusBadge`, `RoleBadge`.
A `code` of `null` on a notification still renders its message; the icon map is a lookup, not
an exhaustive switch.

### Requests are scoped server-side

`GET /requests` returns a staff member's own filings and an admin's full queue — the client
sends no user id and never re-implements the rule. The dashboard's wording ("Pending review"
vs "Pending requests") is the only thing that changes by role.

### One nav, two shells, five mobile slots

`navConfig.ts` is the single source of nav truth; `AppLayout` renders it as a desktop sidebar
and a mobile bar capped at **five slots** (four destinations + "More"), because seven
equal-width tabs would shrink touch targets below 44px (`frontend-design-system.md` §12). The
overflow destinations and Sign out live in the More sheet.

## Testing

Phase 1's suite still runs unchanged (`Test Files 5 passed, Tests 31 passed`), now alongside
the Phase 2 screens. The highest-value existing tests remain the field-visibility matrix, the
`401`/`404`/`410` failure states, and the notification/request query hooks' cache behaviour.

## Remaining (not yet done)

- **`ResponsiveList`**: the requests queue and item table render as card lists today; the
  design doc's table ⇄ card component is not built yet.
- **Request-detail confirmation copy / `itemChanges` display**: approve/reject work and state
  the consequence, but the "what changed" list from the API response is not yet surfaced.
- **Notification badge in the tab title** and end-to-end tests for the approve/reject and
  bundle flows.
- **`docs/frontend-handoff.md`** lands with Phase 3.

## Known spec-vs-backend gaps this phase runs into

- **G2 — no user list/manage endpoints.** `/admin/users` creates accounts and says so; it
  cannot list or edit them. `/admin/categories` is likewise create-only. *(Both screens and both
  sets of endpoints have since grown full management — see `frontend-handoff.md` G2.)*
- **G1 / audit & reports** and **G9 / department lookup** are Phase 3 and the audit picker
  respectively — both still open.
