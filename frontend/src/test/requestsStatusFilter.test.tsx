import { describe, expect, it } from "vitest";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, type RequestStatus } from "../types/enums";

describe("Requests Status Filter", () => {
  it("includes all valid status values from the backend enum", () => {
    const expectedStatuses = [
      "PENDING",
      "PENDING_STAGE1",
      "PENDING_STAGE2",
      "APPROVED",
      "REJECTED",
      "WAITLISTED",
      "WITHDRAWN",
      "INVALIDATED",
      "RETURN_PENDING_CONFIRMATION",
    ] as const;

    expect(REQUEST_STATUSES).toEqual(expectedStatuses);
  });

  it("provides human-readable labels for all statuses", () => {
    for (const status of REQUEST_STATUSES) {
      expect(REQUEST_STATUS_LABELS[status]).toBeDefined();
      expect(typeof REQUEST_STATUS_LABELS[status]).toBe("string");
      expect(REQUEST_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("has a label for PENDING that indicates it needs review", () => {
    expect(REQUEST_STATUS_LABELS.PENDING).toBe("Pending review");
  });

  it("defaults to PENDING when no status is provided", () => {
    const defaultStatus = "PENDING";
    expect(REQUEST_STATUSES.includes(defaultStatus as RequestStatus)).toBe(true);
  });
});
