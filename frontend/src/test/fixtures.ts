import type { Item } from "../types/item";
import type { Category } from "../types/category";
import type { AuthUser, LoginResponse, MeResponse } from "../types/user";
import type { PendingCountResponse, RequestSummary, RequestsListResponse } from "../types/request";

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

export const CATEGORY: Category = { id: "cat-1", name: "Laptops" };

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

export const PENDING_COUNT: PendingCountResponse = { pendingCount: 2 };

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
