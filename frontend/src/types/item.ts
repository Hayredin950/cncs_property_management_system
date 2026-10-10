import type { Condition, ItemStatus } from "./enums";

export interface ItemOwnerSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface ItemCategorySummary {
  id: string;
  name: string;
}

/**
 * Fields SRS 3.4 grants to *every* viewer, public included. Always present in a
 * `GET /items` or `GET /items/:tagId` response, whoever's asking.
 */
export interface PublicItemFields {
  id: string;
  tagId: string;
  name: string;
  categoryId: string;
  category: ItemCategorySummary;
  department: string;
  building: string;
  floor: string;
  room: string;
  photoUrl?: string | null;
  condition: Condition;
  status: ItemStatus;
  registeredAt: string;
}

/**
 * Fields `utils/filterItemFields.ts` (`sanitizeItem`) includes only for the item's
 * owner or a Staff/Admin viewer. Modeled as optional, not as a separate
 * discriminated type: the frontend never decides in advance which shape a response
 * has, it renders whatever keys the API actually sent
 * (frontend-plan.md §5 — "render only what the response contains").
 */
export interface PrivilegedItemFields {
  ownerId: string;
  owner: ItemOwnerSummary;
  /** `Prisma.Decimal` serialized as a string (e.g. `"45000"`) — see lib/formatters.ts. */
  purchaseCost: string;
  currentValue?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  notes?: string | null;
  /** Full nested `Item` rows — only ever present alongside the rest of this interface. */
  accessories?: Item[];
  parentItemId?: string | null;
  disposalReason?: string | null;
  disposedAt?: string | null;
  lastAuditedAt?: string | null;
}

export type Item = PublicItemFields & Partial<PrivilegedItemFields>;

/** `true` once any privileged-only key is present — i.e. this viewer is the owner or Staff/Admin. */
export function isPrivilegedItemView(item: Item): item is Item & PrivilegedItemFields {
  return "ownerId" in item;
}

export interface ItemsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** `GET /items` envelope. */
export interface ItemsListResponse {
  data: Item[];
  pagination: ItemsPagination;
}

export interface ItemsListQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  department?: string;
}
