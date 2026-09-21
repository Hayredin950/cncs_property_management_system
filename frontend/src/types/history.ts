import type { ItemStatus } from "./enums";

/**
 * Modeled from `GET /items/:id/history` in `backend/src/routes/itemHistory.ts`.
 * Rows written by one approval share an exact `editedAt` — that timestamp is
 * the correlation key (ItemEditLog has no requestId column), so the history UI
 * **groups by `editedAt`** to show one decision, cascaded accessories included,
 * as one event (frontend-plan.md §7).
 */
export interface EditLogEntry {
  id: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  editedAt: string;
  editedBy: { id: string; fullName: string };
}

/** Old/new values are tagged ids or plain strings depending on the field — rendered verbatim. */
export interface HistoryItemRef {
  id: string;
  tagId: string;
  name: string;
  status: ItemStatus;
}

/** `GET /items/:id/history` envelope — bare total/limit/offset again. */
export interface ItemsHistoryResponse {
  item: HistoryItemRef;
  entries: EditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}
