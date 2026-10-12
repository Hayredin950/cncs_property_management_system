import jwt from "jsonwebtoken";

/**
 * Shared fixtures for route and service tests.
 *
 * What is deliberately NOT here: the `vi.mock("../lib/prisma.js", ...)` factory.
 * Vitest hoists `vi.mock` above the imports, so its factory cannot reference
 * anything imported — it has to be copy-pasted into each test file. Only plain
 * builders live here.
 *
 * None of these fixtures carry `purchaseCost`/`currentValue`. Phase 2 selects no
 * Decimal column anywhere, which sidesteps Decimal-to-JSON serialization
 * entirely; keeping the fixtures cost-free keeps that invariant visible.
 */

export type TestRole =
  | "SYSTEM_ADMIN"
  | "ACCOUNT_ADMIN"
  | "PROPERTY_OFFICER"
  | "DEPARTMENT_HEAD"
  | "STAFF"
  | "AUDITOR";

/**
 * Signs a JWT with the same `{ id, role }` payload routes/auth.ts issues.
 *
 * `ver` is optional and deliberately omitted by most tests: a token with no
 * `ver` takes `authenticate`'s legacy signature-only path and costs no database
 * read, which is what keeps the route suites unchanged. Pass `ver` when the test
 * is specifically about revocation.
 */
export function createToken(payload: {
  id: string;
  role: TestRole;
  departmentId?: string | null;
  ver?: number;
}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Set process.env.JWT_SECRET at the top of the test file before createToken()");
  }
  return jwt.sign(payload, secret);
}

export interface TestUser {
  id: string;
  fullName: string;
  email: string;
  role: TestRole;
  departmentId?: string | null;
  createdAt: Date;
}

export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: "staff-1",
    fullName: "Demo Staff",
    email: "staff@cncs.aau.edu.et",
    role: "STAFF",
    departmentId: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

/**
 * The college-level operational fixture — registers items, manages buildings,
 * tags and categories, records transfers and finalises disposals. This is what
 * used to be `makeAdmin`; read the diff as "the operational role, not the
 * account role", which is the whole point of the 12 Oct merge.
 */
export function makeOfficer(overrides: Partial<TestUser> = {}): TestUser {
  return makeUser({
    id: "officer-1",
    fullName: "Property Officer",
    email: "officer@cncs.aau.edu.et",
    role: "PROPERTY_OFFICER",
    ...overrides,
  });
}

/** Account administration only — invites, approvals, deactivation, resets. */
export function makeAdmin(overrides: Partial<TestUser> = {}): TestUser {
  return makeUser({
    id: "admin-1",
    fullName: "Account Admin",
    email: "admin@cncs.aau.edu.et",
    role: "ACCOUNT_ADMIN",
    ...overrides,
  });
}

export function makeHead(overrides: Partial<TestUser> = {}): TestUser {
  return makeUser({
    id: "head-1",
    fullName: "Department Head",
    email: "head@cncs.aau.edu.et",
    role: "DEPARTMENT_HEAD",
    ...overrides,
  });
}

export function makeAuditor(overrides: Partial<TestUser> = {}): TestUser {
  return makeUser({
    id: "auditor-1",
    fullName: "Auditor",
    email: "auditor@cncs.aau.edu.et",
    role: "AUDITOR",
    ...overrides,
  });
}

export interface TestItem {
  id: string;
  tagId: string;
  name: string;
  status: "ACTIVE" | "DISPOSED";
  categoryId: string;
  department: string;
  building: string;
  floor: string;
  room: string;
  ownerId: string;
  owner: { id: string; fullName: string };
  parentItemId: string | null;
  disposalReason: string | null;
  disposedAt: Date | null;
  version: number;
}

export function makeItem(overrides: Partial<TestItem> = {}): TestItem {
  return {
    id: "item-1",
    tagId: "CNCS-DEMO-0001",
    name: "Dell Latitude Laptop",
    status: "ACTIVE",
    categoryId: "cat-electronics",
    department: "Computer Science",
    building: "CNCS Building",
    floor: "3",
    room: "312",
    ownerId: "staff-1",
    owner: { id: "staff-1", fullName: "Demo Staff" },
    parentItemId: null,
    disposalReason: null,
    disposedAt: null,
    version: 0,
    ...overrides,
  };
}

export interface TestRequest {
  id: string;
  type: "TRANSFER" | "DISPOSAL" | "LOAN";
  status: "PENDING" | "PENDING_STAGE1" | "PENDING_STAGE2" | "APPROVED" | "REJECTED" | "WAITLISTED";
  reason: string;
  rejectionReason: string | null;
  itemId: string;
  requestedById: string;
  reviewedById: string | null;
  newLocationBuilding: string | null;
  newLocationFloor: string | null;
  newLocationRoom: string | null;
  newOwnerId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  item: TestItem;
  requestedBy: { id: string; fullName: string; email: string };
  reviewedBy: { id: string; fullName: string; email: string } | null;
  stage1ApprovedById: string | null;
  stage1ApprovedAt: Date | null;
  stage2ApprovedById: string | null;
  stage2ApprovedAt: Date | null;
  loanReturnedAt: Date | null;
  loanReturnedById: string | null;
}

export function makeRequest(overrides: Partial<TestRequest> = {}): TestRequest {
  const item = overrides.item ?? makeItem();
  return {
    id: "req-1",
    type: "TRANSFER",
    status: "PENDING",
    reason: "Moving to the new staff office",
    rejectionReason: null,
    itemId: item.id,
    requestedById: "staff-1",
    reviewedById: null,
    newLocationBuilding: null,
    newLocationFloor: "1",
    newLocationRoom: "101",
    newOwnerId: null,
    createdAt: new Date("2026-09-02T08:00:00.000Z"),
    decidedAt: null,
    requestedBy: { id: "staff-1", fullName: "Demo Staff", email: "staff@cncs.aau.edu.et" },
    reviewedBy: null,
    stage1ApprovedById: null,
    stage1ApprovedAt: null,
    stage2ApprovedById: null,
    stage2ApprovedAt: null,
    loanReturnedAt: null,
    loanReturnedById: null,
    ...overrides,
    item,
  };
}

export interface TestNotification {
  id: string;
  userId: string;
  message: string;
  relatedRequestId: string | null;
  isRead: boolean;
  createdAt: Date;
}

export function makeNotification(overrides: Partial<TestNotification> = {}): TestNotification {
  return {
    id: "notif-1",
    userId: "admin-1",
    message:
      "[REQUEST_SUBMITTED] Demo Staff requested a TRANSFER for item CNCS-DEMO-0001 " +
      "(Dell Latitude Laptop) and it needs your review.",
    relatedRequestId: "req-1",
    isRead: false,
    createdAt: new Date("2026-09-02T08:00:00.000Z"),
    ...overrides,
  };
}
