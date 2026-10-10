import type { Item } from "../types/item";
import type { Category } from "../types/category";
import type { AuthUser, LoginResponse, MeResponse, UserSummary } from "../types/user";
import type {
  PendingCountResponse,
  RequestDetail,
  RequestSummary,
  RequestsListResponse,
} from "../types/request";
import type { AppNotification, NotificationsListResponse } from "../types/notification";
import type {
  AuditCompletionResponse,
  AuditListResponse,
  AuditScanRow,
  AuditSession,
  AuditSessionReadback,
  AuditSessionSummary,
} from "../types/audit";
import type { ItemsHistoryResponse } from "../types/history";

/**
 * Fixtures shaped exactly like the backend's responses (docs/backend-handoff.md
 * is the contract). Two canonical items: one full Staff/Admin view, one exactly
 * the key set the server strips for the public — the field-visibility matrix
 * test asserts on the *absence* of the privileged keys, so the public fixture
 * must not merely null them but omit them entirely.
 */
export const ADMIN_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  fullName: "Abebe Admin",
  email: "admin@cncs.aau.edu.et",
  role: "ADMIN",
  createdAt: "2026-09-01T08:00:00.000Z",
};

export const STAFF_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000002",
  fullName: "Sara Staff",
  email: "staff@cncs.aau.edu.et",
  role: "STAFF",
  createdAt: "2026-09-01T08:00:00.000Z",
};

export const CATEGORY: Category = { id: "cat-1", name: "Laptops", itemCount: 2 };

/** Every privileged field present — what `sanitizeItem` returns for staff/admin. */
export const PRIVILEGED_ITEM: Item = {
  id: "item-1",
  tagId: "CNCS-AB12CD34",
  name: "Dell Latitude 5440",
  categoryId: CATEGORY.id,
  category: CATEGORY,
  department: "Computer Science",
  building: "Building 1",
  floor: "Floor 2",
  room: "Room 204",
  photoUrl: null,
  condition: "GOOD",
  status: "ACTIVE",
  registeredAt: "2026-09-10T09:00:00.000Z",
  ownerId: STAFF_USER.id,
  owner: { id: STAFF_USER.id, fullName: STAFF_USER.fullName, email: STAFF_USER.email },
  purchaseCost: "45000",
  currentValue: null,
  brand: "Dell",
  model: "Latitude 5440",
  serialNumber: "DL5440-0092",
  notes: "Charger kept in the drawer.",
  accessories: [],
  parentItemId: null,
  disposalReason: null,
  disposedAt: null,
  lastAuditedAt: null,
};

/** Key-for-key what `sanitizeItem` leaves for an anonymous viewer. */
export const PUBLIC_ITEM: Item = {
  id: "item-1",
  tagId: "CNCS-AB12CD34",
  name: "Dell Latitude 5440",
  categoryId: CATEGORY.id,
  category: CATEGORY,
  department: "Computer Science",
  building: "Building 1",
  floor: "Floor 2",
  room: "Room 204",
  photoUrl: null,
  condition: "GOOD",
  status: "ACTIVE",
  registeredAt: "2026-09-10T09:00:00.000Z",
};

export const DISPOSED_ITEM: Item = {
  ...PUBLIC_ITEM,
  tagId: "CNCS-DEAD0000",
  name: "Old projector",
  condition: "BEYOND_REPAIR",
};

export const ITEMS_LIST = (items: Item[], page = 1, total = items.length) => ({
  data: items,
  pagination: { page, limit: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) },
});

export const LOGIN_RESPONSE: LoginResponse = { token: "test-token", user: ADMIN_USER };
export const ME_RESPONSE: MeResponse = { user: ADMIN_USER };

/** `GET /users` — the admin accounts list. Counts differ so the screen's rendering of them is observable. */
export const ADMIN_ACCOUNT: UserSummary = { ...ADMIN_USER, itemCount: 3 };
export const STAFF_ACCOUNT: UserSummary = { ...STAFF_USER, itemCount: 0 };
export const ACCOUNTS: UserSummary[] = [ADMIN_ACCOUNT, STAFF_ACCOUNT];

export const PENDING_COUNT: PendingCountResponse = { pendingCount: 2 };

export const NOTIFICATIONS_LIST: NotificationsListResponse = {
  notifications: [
    {
      id: "n-1",
      code: "REQUEST_SUBMITTED",
      message: 'Transfer request for "Dell Latitude 5440" needs review.',
      relatedRequestId: "req-1",
      isRead: false,
      createdAt: "2026-09-20T10:00:00.000Z",
    },
    {
      id: "n-2",
      code: "REQUEST_APPROVED",
      message: 'Your transfer request for "Old projector" was approved.',
      relatedRequestId: null,
      isRead: true,
      createdAt: "2026-09-19T08:00:00.000Z",
    },
  ] as AppNotification[],
  unreadCount: 1,
  limit: 50,
  offset: 0,
};

export const REQUEST_FIXTURE: RequestSummary = {
  id: "req-1",
  type: "TRANSFER",
  status: "PENDING",
  reason: "Moving the lab to a different room this semester.",
  rejectionReason: null,
  createdAt: "2026-09-20T10:00:00.000Z",
  decidedAt: null,
  newLocationBuilding: "Building 3",
  newLocationFloor: "Floor 1",
  newLocationRoom: "Room 105",
  newOwnerId: null,
  requestedById: STAFF_USER.id,
  reviewedById: null,
  item: { id: "item-1", tagId: "CNCS-AB12CD34", name: "Dell Latitude 5440", status: "ACTIVE" },
  requestedBy: { id: STAFF_USER.id, fullName: STAFF_USER.fullName, email: STAFF_USER.email },
};

export const REQUESTS_LIST: RequestsListResponse = {
  requests: [REQUEST_FIXTURE],
  total: 1,
  limit: 20,
  offset: 0,
};

/**
 * Audit fixtures. The counts are deliberately all-different (3/2/1) so a report
 * test can tell which number belongs to which card instead of matching any
 * digit on the page.
 */
export const AUDIT_SESSION: AuditSession = {
  id: "audit-1",
  scopeType: "DEPARTMENT",
  scopeValue: "Computer Science",
  runById: ADMIN_USER.id,
  startedAt: "2026-09-22T08:00:00.000Z",
  completedAt: null,
  runBy: { id: ADMIN_USER.id, fullName: ADMIN_USER.fullName, email: ADMIN_USER.email },
};

export const AUDIT_SCAN_ROW: AuditScanRow = {
  id: "scan-1",
  auditSessionId: AUDIT_SESSION.id,
  itemId: PRIVILEGED_ITEM.id,
  // Always FOUND on this endpoint — the classification happens at completion.
  result: "FOUND",
  scannedAt: "2026-09-22T08:05:00.000Z",
  item: PRIVILEGED_ITEM,
};

export const AUDIT_COMPLETION: AuditCompletionResponse = {
  auditSessionId: AUDIT_SESSION.id,
  completedAt: "2026-09-22T08:30:00.000Z",
  counts: { found: 3, missing: 2, locationMismatch: 1 },
  found: [PRIVILEGED_ITEM.id, "item-2", "item-3"],
  missing: ["item-4", "item-5"],
  locationMismatch: ["item-6"],
};

/**
 * `GET /audits` — the history. Two sessions, one finished and one still open, so a
 * test can tell the two status treatments apart; their counts differ for the same
 * reason the completion fixture's do.
 */
export const AUDIT_SESSION_SUMMARY: AuditSessionSummary = {
  ...AUDIT_SESSION,
  completedAt: "2026-09-22T08:30:00.000Z",
  completed: true,
  counts: { found: 3, missing: 2, locationMismatch: 1 },
};

export const OPEN_AUDIT_SESSION_SUMMARY: AuditSessionSummary = {
  id: "audit-2",
  scopeType: "DEPARTMENT",
  scopeValue: "Biology",
  runById: STAFF_USER.id,
  startedAt: "2026-09-23T09:00:00.000Z",
  completedAt: null,
  completed: false,
  counts: { found: 1, missing: 0, locationMismatch: 0 },
  runBy: { id: STAFF_USER.id, fullName: STAFF_USER.fullName, email: STAFF_USER.email },
};

export const AUDITS_LIST: AuditListResponse = {
  audits: [OPEN_AUDIT_SESSION_SUMMARY, AUDIT_SESSION_SUMMARY],
  total: 2,
  limit: 20,
  offset: 0,
};

/**
 * `GET /audits/:id` — the read-back, **empty by default**.
 *
 * Empty is the right default because the walkthrough tests scan `PRIVILEGED_ITEM`
 * by hand: a default read-back that already listed it would answer "already
 * scanned" and no scan request would ever leave the page, which is a test failing
 * for the fixture's sake rather than the code's. Tests that are *about* stored rows
 * pass them in.
 */
export const AUDIT_READBACK = (
  id: string,
  overrides: Partial<AuditSessionReadback> = {},
): AuditSessionReadback => ({
  id,
  scopeType: AUDIT_SESSION.scopeType,
  scopeValue: AUDIT_SESSION.scopeValue,
  runById: AUDIT_SESSION.runById,
  startedAt: AUDIT_SESSION.startedAt,
  completedAt: null,
  completed: false,
  counts: { found: 0, missing: 0, locationMismatch: 0 },
  found: [],
  missing: [],
  locationMismatch: [],
  rows: [],
  ...overrides,
});

/**
 * The read-back of a session that already has rows: one scan this walk made, plus
 * the two classifications completion writes about items it did not. The walkthrough
 * has to show the first and hide the other two — a `MISSING` row has no `scannedAt`
 * and was never scanned.
 */
export const AUDIT_STORED_ROWS = [
  {
    itemId: PRIVILEGED_ITEM.id,
    result: "FOUND" as const,
    scannedAt: "2026-09-22T08:05:00.000Z",
    item: {
      tagId: PRIVILEGED_ITEM.tagId,
      name: PRIVILEGED_ITEM.name,
      department: PRIVILEGED_ITEM.department,
      building: PRIVILEGED_ITEM.building,
      floor: PRIVILEGED_ITEM.floor,
      room: PRIVILEGED_ITEM.room,
    },
  },
  {
    itemId: "item-4",
    result: "MISSING" as const,
    scannedAt: null,
    item: {
      tagId: "CNCS-MISS0000",
      name: "Missing Monitor",
      department: "Computer Science",
      building: "Building 1",
      floor: "Floor 2",
      room: "Room 210",
    },
  },
  {
    itemId: "item-6",
    result: "LOCATION_MISMATCH" as const,
    scannedAt: "2026-09-22T08:20:00.000Z",
    item: {
      tagId: "CNCS-ELSE0000",
      name: "Misplaced Projector",
      department: "Biology",
      building: "Building 2",
      floor: "Floor 1",
      room: "Room 105",
    },
  },
];

/** The completion summary's JSON body, for tests that override the complete handler. */
export const AUDIT_COMPLETION_BODY = (auditSessionId: string): AuditCompletionResponse => ({
  ...AUDIT_COMPLETION,
  auditSessionId,
});

/**
 * `GET /items/:id/history`. One row is enough: the grouping rule (rows sharing an
 * exact `editedAt` are one decision) is the backend's, and the UI renders what it
 * receives.
 */
export const HISTORY_FIXTURE: ItemsHistoryResponse = {
  item: {
    id: PRIVILEGED_ITEM.id,
    tagId: PRIVILEGED_ITEM.tagId,
    name: PRIVILEGED_ITEM.name,
    status: "ACTIVE",
  },
  entries: [
    {
      id: "log-1",
      fieldChanged: "room",
      oldValue: "Room 101",
      newValue: "Room 204",
      editedAt: "2026-09-21T12:00:00.000Z",
      editedBy: { id: ADMIN_USER.id, fullName: ADMIN_USER.fullName },
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
};

/** A minimal CSV body — enough for the download tests to prove a blob came back. */
export const CSV_BODY = "tagId,name\nCNCS-AB12CD34,Dell Latitude 5440\n";

/**
 * `GET /requests/:id` returns a richer shape than the list (`REQUEST_DETAIL_SELECT`
 * in the backend): the item row carries its location fields, and `reviewedBy`
 * appears (null while pending).
 */
export const REQUEST_DETAIL_FIXTURE: RequestDetail = {
  ...REQUEST_FIXTURE,
  item: {
    ...REQUEST_FIXTURE.item,
    department: "Computer Science",
    building: "Building 1",
    floor: "Floor 2",
    room: "Room 204",
    parentItemId: null,
  },
  reviewedBy: null,
};
