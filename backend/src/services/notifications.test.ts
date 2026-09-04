import { describe, expect, it, vi } from "vitest";
import {
  emailSubjectFor,
  NOTIFICATION_CODES,
  notifyRequesterOfDecision,
  notifyReviewersOfNewRequest,
  parseNotificationMessage,
  renderRequestDecided,
  renderRequestSubmitted,
  reviewerRecipientsWhere,
} from "./notifications.js";

/**
 * Decision D3: `Notification` has no `type` column and Phase 2 adds no migration,
 * so the code the frontend branches on is stored as a `[CODE]` prefix inside
 * `message` and stripped again before the API responds. The round trip and the
 * unprefixed fallback are what make that safe with no backfill.
 */

describe("renderRequestSubmitted", () => {
  it("names the requester, the type, the tagId and the item", () => {
    expect(
      renderRequestSubmitted({
        requesterName: "Demo Staff",
        requestType: "TRANSFER",
        itemTagId: "CNCS-DEMO-0001",
        itemName: "Dell Latitude Laptop",
      }),
    ).toBe(
      "[REQUEST_SUBMITTED] Demo Staff requested a TRANSFER for item CNCS-DEMO-0001 " +
        "(Dell Latitude Laptop) and it needs your review.",
    );
  });
});

describe("renderRequestDecided", () => {
  it("renders an approval", () => {
    expect(
      renderRequestDecided({
        decision: "APPROVED",
        requestType: "TRANSFER",
        itemTagId: "CNCS-DEMO-0001",
        itemName: "Dell Latitude Laptop",
        reviewerName: "System Admin",
      }),
    ).toBe(
      "[REQUEST_APPROVED] Your TRANSFER request for item CNCS-DEMO-0001 " +
        "(Dell Latitude Laptop) was approved by System Admin.",
    );
  });

  it("renders a rejection with its reason", () => {
    expect(
      renderRequestDecided({
        decision: "REJECTED",
        requestType: "DISPOSAL",
        itemTagId: "CNCS-DEMO-0003",
        itemName: "Microscope",
        reviewerName: "System Admin",
        rejectionReason: "Item is still serviceable",
      }),
    ).toBe(
      "[REQUEST_REJECTED] Your DISPOSAL request for item CNCS-DEMO-0003 (Microscope) " +
        "was rejected by System Admin. Reason: Item is still serviceable",
    );
  });

  it("omits the reason on an approval, and when a rejection has only whitespace", () => {
    expect(
      renderRequestDecided({
        decision: "APPROVED",
        requestType: "TRANSFER",
        itemTagId: "CNCS-DEMO-0001",
        itemName: "Dell Latitude Laptop",
        reviewerName: "System Admin",
        rejectionReason: "ignored on an approval",
      }),
    ).not.toContain("Reason:");

    expect(
      renderRequestDecided({
        decision: "REJECTED",
        requestType: "TRANSFER",
        itemTagId: "CNCS-DEMO-0001",
        itemName: "Dell Latitude Laptop",
        reviewerName: "System Admin",
        rejectionReason: "   ",
      }),
    ).not.toContain("Reason:");
  });

  it("caps a long rejection reason at 500 characters", () => {
    const message = renderRequestDecided({
      decision: "REJECTED",
      requestType: "TRANSFER",
      itemTagId: "CNCS-DEMO-0001",
      itemName: "Dell Latitude Laptop",
      reviewerName: "System Admin",
      rejectionReason: "x".repeat(900),
    });
    expect(message).toContain(`Reason: ${"x".repeat(500)}`);
    expect(message).not.toContain("x".repeat(501));
  });
});

describe("parseNotificationMessage", () => {
  it("round-trips every rendered template", () => {
    const submitted = renderRequestSubmitted({
      requesterName: "Demo Staff",
      requestType: "TRANSFER",
      itemTagId: "CNCS-DEMO-0001",
      itemName: "Dell Latitude Laptop",
    });
    const parsed = parseNotificationMessage(submitted);

    expect(parsed.code).toBe(NOTIFICATION_CODES.REQUEST_SUBMITTED);
    expect(parsed.message).toBe(
      "Demo Staff requested a TRANSFER for item CNCS-DEMO-0001 " +
        "(Dell Latitude Laptop) and it needs your review.",
    );
    expect(parsed.message).not.toContain("[");
  });

  it("falls back to { code: null, message: raw } for a row nothing here wrote", () => {
    // This fallback is the whole reason the prefix needs no schema change and no
    // backfill: a hand-inserted row still displays, just without a code.
    expect(parseNotificationMessage("Server maintenance on Saturday")).toEqual({
      code: null,
      message: "Server maintenance on Saturday",
    });
    // A bracketed prefix that isn't one of ours is not treated as a code either.
    expect(parseNotificationMessage("[SOMETHING_ELSE] hello")).toEqual({
      code: null,
      message: "[SOMETHING_ELSE] hello",
    });
  });

  it("survives a multi-line message", () => {
    expect(parseNotificationMessage("[REQUEST_APPROVED] line one\nline two")).toEqual({
      code: "REQUEST_APPROVED",
      message: "line one\nline two",
    });
  });
});

describe("emailSubjectFor", () => {
  it("has a subject per code and a generic fallback", () => {
    expect(emailSubjectFor("REQUEST_SUBMITTED")).toBe(
      "CNCS Property: a request needs your review",
    );
    expect(emailSubjectFor("REQUEST_APPROVED")).toBe("CNCS Property: your request was approved");
    expect(emailSubjectFor("REQUEST_REJECTED")).toBe("CNCS Property: your request was rejected");
    expect(emailSubjectFor(null)).toBe("CNCS Property: notification");
  });
});

describe("reviewerRecipientsWhere", () => {
  it("targets admins and excludes the requester (D2)", () => {
    // `Request.reviewedById` is null at submit time, so there is nobody specific
    // to notify — fan out to everyone allowed to decide it. An admin who filed the
    // request already knows, and assertDecidable() bars them from deciding it.
    expect(reviewerRecipientsWhere("admin-1")).toEqual({
      role: "ADMIN",
      id: { not: "admin-1" },
    });
  });
});

describe("notifyReviewersOfNewRequest", () => {
  const input = {
    requestId: "req-1",
    requesterId: "staff-1",
    requesterName: "Demo Staff",
    requestType: "TRANSFER" as const,
    itemTagId: "CNCS-DEMO-0001",
    itemName: "Dell Latitude Laptop",
    createdAt: new Date("2026-09-02T08:00:00.000Z"),
  };

  it("writes one row per eligible reviewer in a single createMany", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "admin-1", email: "admin@cncs.aau.edu.et", fullName: "System Admin" },
      { id: "admin-2", email: "second@cncs.aau.edu.et", fullName: "Second Admin" },
    ]);
    const createMany = vi.fn().mockResolvedValue({ count: 2 });

    const recipients = await notifyReviewersOfNewRequest(
      { user: { findMany }, notification: { createMany } } as never,
      input,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { role: "ADMIN", id: { not: "staff-1" } },
      select: { id: true, email: true, fullName: true },
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "admin-1",
          message: renderRequestSubmitted(input),
          relatedRequestId: "req-1",
          createdAt: input.createdAt,
        },
        {
          userId: "admin-2",
          message: renderRequestSubmitted(input),
          relatedRequestId: "req-1",
          createdAt: input.createdAt,
        },
      ],
    });
    expect(recipients).toHaveLength(2);
  });

  it("warns and writes nothing when no admin other than the requester exists", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const createMany = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const recipients = await notifyReviewersOfNewRequest(
      { user: { findMany }, notification: { createMany } } as never,
      input,
    );

    // The request is still created — a request nobody can see is an operational
    // hazard, not a validation error — but it must be loud in the logs.
    expect(recipients).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("req-1");
    warn.mockRestore();
  });
});

describe("notifyRequesterOfDecision", () => {
  it("writes one row back to the requester and returns the stored message", async () => {
    const create = vi.fn().mockResolvedValue({ id: "notif-1" });
    const decidedAt = new Date("2026-09-03T10:00:00.000Z");

    const message = await notifyRequesterOfDecision({ notification: { create } } as never, {
      requestId: "req-1",
      requesterId: "staff-1",
      decision: "APPROVED",
      requestType: "TRANSFER",
      itemTagId: "CNCS-DEMO-0001",
      itemName: "Dell Latitude Laptop",
      reviewerName: "System Admin",
      decidedAt,
    });

    expect(message).toContain("[REQUEST_APPROVED]");
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "staff-1",
        message,
        relatedRequestId: "req-1",
        createdAt: decidedAt,
      },
    });
  });
});

