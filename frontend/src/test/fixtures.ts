import type { Item } from "../types/item";
import type { Category } from "../types/category";
import type {
  AuthUser,
  DepartmentOption,
  LoginResponse,
  MeResponse,
  UserSummary,
} from "../types/user";
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
import type { SystemEvent, SystemStatus } from "../api/system";
import type { DepartmentRoster, InvitableUnit } from "../api/departments";
import type { ActiveAuditResponse } from "../api/audits";
import type { RecentItem } from "../api/items";

/**
 * Fixtures shaped exactly like the backend's responses (docs/backend-handoff.md
 * is the contract). Two canonical items: one full Staff/Admin view, one exactly
 * the key set the server strips for the public — the field-visibility matrix
 * test asserts on the *absence* of the privileged keys, so the public fixture
 * must not merely null them but omit them entirely.
 */
export const SYSTEM_ADMIN_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  fullName: "Abebe Admin",
  email: "admin@cncs.aau.edu.et",
  role: "SYSTEM_ADMIN",
  createdAt: "2026-09-01T08:00:00.000Z",
};

/**
 * The asset-side power user (spec 2.2): registers items, decides requests, reads
 * the account list, reads every audit. It is the default session in the fixtures
 * because it is the role a walkthrough of the workbench is run as — the System
 * Admin sees no asset data at all, by design.
 */
export const OFFICER_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000003",
  fullName: "Abdi Officer",
  email: "officer@cncs.aau.edu.et",
  role: "PROPERTY_OFFICER",
  createdAt: "2026-09-01T08:00:00.000Z",
};

export const STAFF_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000002",
  fullName: "Sara Staff",
  email: "staff@cncs.aau.edu.et",
  role: "STAFF",
  createdAt: "2026-09-01T08:00:00.000Z",
};

/**
 * The Auditor (spec 8.1): runs a session end to end, reads items, reports.
 *
 * Running an audit and registering an item are different roles now, and no single
 * account holds both — which is why the walkthrough tests that touch `/audit/...`
 * sign in as this user rather than as the Property Officer the rest of the suite
 * uses.
 */
export const AUDITOR_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000004",
  fullName: "Almaz Auditor",
  email: "auditor@cncs.aau.edu.et",
  role: "AUDITOR",
  createdAt: "2026-09-01T08:00:00.000Z",
};

/**
 * The Department Head (spec 2.2): sees its own department's held items, the roster,
 * and the requests it may decide. It is the only role whose dashboard renders the
 * "Your held items" tile, which is why the tile's tests sign in as this account.
 */
export const HEAD_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000005",
  fullName: "Hana Head",
  email: "head@cncs.aau.edu.et",
  role: "DEPARTMENT_HEAD",
  /** Computer Science — the unit its roster tile and its `/departments/:id/roster` call use. */
  departmentId: "unit-cs",
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

export const LOGIN_RESPONSE: LoginResponse = { token: "test-token", user: OFFICER_USER };
export const ME_RESPONSE: MeResponse = { user: OFFICER_USER };

/**
 * `GET /users` — the accounts list. Counts differ so the screen's rendering of
 * them is observable: one account that is part of the record, one that is not.
 *
 * The acting administrator is in the list too, because the server returns every
 * account — and the "you cannot do this to yourself" affordances only exist when
 * its own row is rendered.
 */
const ACTIVE_ACCOUNT_FIELDS = {
  accountStatus: "ACTIVE" as const,
  reviewedAt: null,
  reviewNote: null,
};

export const OFFICER_ACCOUNT: UserSummary = {
  ...OFFICER_USER,
  itemCount: 3,
  ...ACTIVE_ACCOUNT_FIELDS,
};
export const STAFF_ACCOUNT: UserSummary = {
  ...STAFF_USER,
  itemCount: 0,
  ...ACTIVE_ACCOUNT_FIELDS,
};
export const SYSTEM_ADMIN_ACCOUNT: UserSummary = {
  ...SYSTEM_ADMIN_USER,
  itemCount: 0,
  ...ACTIVE_ACCOUNT_FIELDS,
};
export const ACCOUNTS: UserSummary[] = [OFFICER_ACCOUNT, STAFF_ACCOUNT, SYSTEM_ADMIN_ACCOUNT];

/**
 * `GET /users/approvals` — a row waiting for a decision. Oldest-first ordering is
 * the API's job; a single fixture is enough for the queue screen's rendering.
 */
export const PENDING_ACCOUNT: UserSummary = {
  id: "00000000-0000-4000-8000-000000000099",
  fullName: "Pending Person",
  email: "pending@cncs.aau.edu.et",
  role: "STAFF",
  createdAt: "2026-09-15T10:00:00.000Z",
  itemCount: 0,
  accountStatus: "PENDING_APPROVAL",
  reviewedAt: null,
  reviewNote: null,
};

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
  newLocationDepartment: null,
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
  status: "IN_PROGRESS",
  scopeType: "DEPARTMENT",
  scopeValue: "Computer Science",
  runById: OFFICER_USER.id,
  startedAt: "2026-09-22T08:00:00.000Z",
  completedAt: null,
  runBy: { id: OFFICER_USER.id, fullName: OFFICER_USER.fullName, email: OFFICER_USER.email },
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
  abandoned: false,
  abandonedAt: null,
  abandonReason: null,
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
  abandoned: false,
  abandonedAt: null,
  abandonReason: null,
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
 * `GET /audits/active` — the server's own discriminated shape (`active` plus two
 * objects), not the flat one the tile renders. `fetchActiveAudit` is the mapping
 * between them, so the fixture has to be the server side of it or the mapping is
 * the one thing the tests never exercise.
 */
export const ACTIVE_AUDIT: ActiveAuditResponse = {
  active: true,
  session: {
    id: AUDIT_SESSION.id,
    scopeType: AUDIT_SESSION.scopeType,
    scopeValue: AUDIT_SESSION.scopeValue,
  },
  progress: { scanned: 2, total: 5, remaining: 3 },
};

/** `GET /audits/findings?status=OPEN` — the count alone, which is all the tile shows. */
export const OPEN_FINDINGS_COUNT = { count: 4 };

/**
 * `GET /items/recent?limit=` — `registeredAt`, the field the handler selects. A
 * fixture with `createdAt` would have hidden the tile's wrong-field bug.
 *
 * Its own item, not a copy of `PRIVILEGED_ITEM`: the officer's dashboard renders
 * this row *and* a request preview that names `PRIVILEGED_ITEM`, so sharing a name
 * made a page-wide query on the dashboard ambiguous.
 */
export const RECENT_ITEMS: RecentItem[] = [
  {
    id: "item-recent-1",
    name: "Epson Projector EB-970",
    tagId: "CNCS-RECENT01",
    registeredAt: "2026-09-20T10:00:00.000Z",
  },
];

/** `GET /items/held-by-me?summary=true` — the count, not the rows. */
export const HELD_ITEMS_SUMMARY = { count: 3 };

/** `GET /loans/overdue` — the Property Officer's overdue-loan count. */
export const OVERDUE_LOANS = { count: 2 };

/**
 * `GET /departments/:id/roster` — the Department Head's roster snapshot, for the
 * head's own unit (`HEAD_USER.departmentId`).
 */
export const DEPARTMENT_ROSTER: DepartmentRoster = {
  id: "unit-cs",
  name: "Computer Science",
  department: { id: "unit-cs", name: "Computer Science" },
  staffCount: 5,
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
): AuditSessionReadback => {
  const defaults: AuditSessionReadback = {
    id,
    status: "IN_PROGRESS",
    scopeType: AUDIT_SESSION.scopeType,
    scopeValue: AUDIT_SESSION.scopeValue,
    runById: AUDIT_SESSION.runById,
    startedAt: AUDIT_SESSION.startedAt,
    completedAt: null,
    completed: false,
  abandoned: false,
  abandonedAt: null,
  abandonReason: null,
    counts: { found: 0, missing: 0, locationMismatch: 0 },
    found: [],
    missing: [],
    locationMismatch: [],
    rows: [],
  };
  return { ...defaults, ...overrides };
};

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
      editedBy: { id: OFFICER_USER.id, fullName: OFFICER_USER.fullName },
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
};

/** A minimal CSV body — enough for the download tests to prove a blob came back. */
export const CSV_BODY = "tagId,name\nCNCS-AB12CD34,Dell Latitude 5440\n";

/**
 * `GET /departments` — the public list the request-account form loads, in the
 * live shape (`[{ id, name, code }]`, verified against the deployed API). The ids
 * are readable slugs rather than uuids so a test that selects "Biology" can assert
 * on the value the form actually submits instead of on an opaque identifier.
 *
 * Physics is present and headless on purpose: it is the unit the vacant-head
 * fallback is tested against.
 */
export const DEPARTMENTS: DepartmentOption[] = [
  { id: "unit-bio", name: "Biology", code: "BIO" },
  { id: "unit-chem", name: "Chemistry", code: "CHEM" },
  { id: "unit-cs", name: "Computer Science", code: "CS" },
  { id: "unit-phys", name: "Physics", code: "PHYS" },
];

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
    holderType: "USER",
    holderId: "user-123",
  },
  reviewedBy: null,
  stage1ApprovedBy: null,
  stage2ApprovedBy: null,
  withdrawnBy: null,
  fromHolderType: null,
  fromHolderId: null,
  toHolderType: null,
  toHolderId: null,
  fromHolderName: null,
  toHolderName: null,
  stage1ApprovedAt: null,
  stage2ApprovedAt: null,
  withdrawnAt: null,
  invalidatedAt: null,
  invalidatedReason: null,
  // The loan's own bookkeeping — null on everything that is not a loan.
  loanDueDate: null,
  loanReturnedAt: null,
  loanReturnedBy: null,
};

/** `GET /system/status` — the build facts the System Admin's dashboard shows. */
export const SYSTEM_STATUS: SystemStatus = {
  environment: "production",
  version: "1.0.0",
  uptime: 4321,
  lastDeploy: "2026-10-13T06:00:00.000Z",
  database: "connected",
};

/**
 * `GET /system/events` — rows of the account log (§10.4). Two of them, both
 * account-level, because that is the whole point of the endpoint now: it cannot
 * carry an audit session, a tag id or a room. There is no asset-shaped fixture
 * here to accidentally assert against.
 */
/**
 * `GET /departments/invitable` — the head-appointment picker (T6).
 *
 * Deliberately not the same list as `DEPARTMENTS`: that one is the units open to
 * *self-registration*, and an invite is most needed where a unit has no working
 * head. Chemistry carries `hasActiveHead: true` so a test can assert the picker
 * marks the unit the server will refuse, and Physics — headless by design — is the
 * one a head is actually appointed into.
 */
export const INVITABLE_UNITS: InvitableUnit[] = [
  { id: "unit-chem", name: "Chemistry", code: "CHEM", hasActiveHead: true },
  { id: "unit-cs", name: "Computer Science", code: "CS", hasActiveHead: true },
  { id: "unit-phys", name: "Physics", code: "PHYS", hasActiveHead: false },
];

/**
 * `POST /auth/accept-invite` — the session an invitee gets back after choosing
 * their own password. A Department Head, because that is the case with the most
 * moving parts (the unit it heads is returned too).
 */
export const ACCEPTED_INVITE_USER: AuthUser = {
  id: "invitee-1",
  fullName: "New Head",
  email: "newhead@cncs.aau.edu.et",
  role: "DEPARTMENT_HEAD",
  createdAt: "2026-10-14T08:00:00.000Z",
};

export const SYSTEM_EVENTS: SystemEvent[] = [
  {
    id: "log-1",
    type: "ACCOUNT_APPROVED",
    message: "account approved — Sara Staff",
    timestamp: "2026-10-10T09:00:00.000Z",
  },
  {
    id: "log-2",
    type: "ACCOUNT_DEACTIVATED",
    message: "account deactivated — Sara Staff",
    timestamp: "2026-10-09T09:00:00.000Z",
  },
];
