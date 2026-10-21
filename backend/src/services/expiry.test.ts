import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkExpiredApprovals } from "./expiry.js";
import { prisma } from "../lib/prisma.js";

/**
 * The escalation of a request that has waited too long.
 *
 * The rule that matters: a request is handed to the person who can act on it,
 * whatever state it is in. The case this file exists for is the one that used
 * to be skipped — a request with **nobody holding it** (a request on an item
 * in a unit with no head lands that way). It could not escalate, nobody was
 * told, and it sat in the queue forever.
 */

vi.mock("../lib/prisma.js", () => {
  const client = {
    request: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    orgUnit: { findUnique: vi.fn() },
    item: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(client)
        : await Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return { prisma: client };
});

const OFFICER = { id: "officer-1", role: "PROPERTY_OFFICER" };

/** A request old enough to be past the threshold. */
function staleRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    type: "DISPOSAL",
    status: "PENDING",
    reason: "The shelf is broken.",
    itemId: "item-1",
    requestedById: "staff-1",
    reviewedById: "head-1",
    rejectionReason: null,
    item: { tagId: "CNCS-1", name: "Shelf", orgUnitId: "unit-1" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.request.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(OFFICER as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "head-1" } as never);
  vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue({ headId: "head-2" } as never);
  vi.mocked(prisma.request.findUnique).mockResolvedValue({ rejectionReason: null } as never);
});

describe("checkExpiredApprovals", () => {
  it("does nothing when nothing has waited too long", async () => {
    await expect(checkExpiredApprovals()).resolves.toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("hands a stale disposal to the property officer and tells them", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([staleRequest()] as never);

    await expect(checkExpiredApprovals()).resolves.toBe(1);

    expect(prisma.request.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({ reviewedById: "officer-1" }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "officer-1",
        relatedRequestId: "req-1",
        message: expect.stringContaining("[ESCALATED]"),
      }),
    });
  });

  /**
   * The case that used to be skipped: nobody holds the request, so there is
   * no reviewer to read and no `continue` to save it. It still has a
   * destination, and the person who can act on it is told.
   */
  it("escalates a request that nobody holds", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([
      staleRequest({ reviewedById: null }),
    ] as never);

    await expect(checkExpiredApprovals()).resolves.toBe(1);

    expect(prisma.request.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({ reviewedById: "officer-1" }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it("marks the request as escalated rather than merely moving it", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([staleRequest()] as never);

    await checkExpiredApprovals();

    const update = vi.mocked(prisma.request.update).mock.calls[0]?.[0] as {
      data: { rejectionReason: string };
    };
    expect(update.data.rejectionReason).toContain("[ESCALATED]");
  });

  it("sends a stale transfer to the head of the receiving unit", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([
      staleRequest({ type: "TRANSFER", status: "PENDING" }),
    ] as never);
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue({ headId: "head-2" } as never);

    await expect(checkExpiredApprovals()).resolves.toBe(1);

    expect(prisma.request.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewedById: "head-2" }),
      }),
    );
  });

  it("leaves a request alone when no one can act on it", async () => {
    vi.mocked(prisma.request.findMany).mockResolvedValue([
      staleRequest({ type: "TRANSFER", status: "PENDING" }),
    ] as never);
    vi.mocked(prisma.orgUnit.findUnique).mockResolvedValue({ headId: null } as never);

    await expect(checkExpiredApprovals()).resolves.toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
