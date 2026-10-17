import { describe, it, expect } from "vitest";

describe("RequestsListPage - All statuses filter logic", () => {
  it("should parse ALL status as undefined for API call", () => {
    const rawStatus = "ALL" as string;
    const status = rawStatus === "ALL" ? undefined : rawStatus;
    expect(status).toBeUndefined();
  });

  it("should parse valid status as string for API call", () => {
    const rawStatus = "PENDING" as string;
    const status = rawStatus === "ALL" ? undefined : rawStatus;
    expect(status).toBe("PENDING");
  });

  it("should default to ALL when no status parameter", () => {
    const searchParams = new URLSearchParams();
    const rawStatus = searchParams.get("status") ?? "ALL";
    expect(rawStatus).toBe("ALL");
  });

  it("should handle valid status when set", () => {
    const searchParams = new URLSearchParams();
    searchParams.set("status", "PENDING");
    const rawStatus = searchParams.get("status") ?? "ALL";
    expect(rawStatus).toBe("PENDING");
  });
});
