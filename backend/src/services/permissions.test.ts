import { describe, expect, it } from "vitest";
import {
  allow,
  hasCapability,
  capabilitiesFor,
  assertOfficerAuditorExclusion,
  type BaseRole,
  type Capability,
} from "./permissions.js";
import {
  hasCapability as frontendHasCapability,
  ASSET_ROLES,
} from "../../../frontend/src/lib/permissions.js";
import { ROLES } from "../../../frontend/src/types/enums.js";

describe("Permissions Matrix & Central Capability Layer (Plan v3 Phase 1)", () => {
  const allSixRoles: BaseRole[] = [
    "SYSTEM_ADMIN",
    "ACCOUNT_ADMIN",
    "PROPERTY_OFFICER",
    "DEPARTMENT_HEAD",
    "STAFF",
    "AUDITOR",
  ];

  it("defines all six roles consistently across backend and frontend", () => {
    expect(allSixRoles).toEqual([
      "SYSTEM_ADMIN",
      "ACCOUNT_ADMIN",
      "PROPERTY_OFFICER",
      "DEPARTMENT_HEAD",
      "STAFF",
      "AUDITOR",
    ]);
    expect(ROLES).toEqual(allSixRoles);
  });

  it("strictly excludes SYSTEM_ADMIN and ACCOUNT_ADMIN from asset roles", () => {
    expect(ASSET_ROLES).not.toContain("SYSTEM_ADMIN");
    expect(ASSET_ROLES).not.toContain("ACCOUNT_ADMIN");
    expect(ASSET_ROLES).toContain("PROPERTY_OFFICER");
    expect(ASSET_ROLES).toContain("DEPARTMENT_HEAD");
    expect(ASSET_ROLES).toContain("STAFF");
    expect(ASSET_ROLES).toContain("AUDITOR");
  });

  it("strictly enforces Property Officer and Auditor mutual exclusion (Section 2.1)", () => {
    expect(() => assertOfficerAuditorExclusion("PROPERTY_OFFICER", "AUDITOR")).toThrow(
      "Property Officer and Auditor cannot be the same person",
    );
    expect(() => assertOfficerAuditorExclusion("AUDITOR", "PROPERTY_OFFICER")).toThrow(
      "Property Officer and Auditor cannot be the same person",
    );
    expect(() => assertOfficerAuditorExclusion("STAFF", "PROPERTY_OFFICER")).not.toThrow();
    expect(() => assertOfficerAuditorExclusion("STAFF", "AUDITOR")).not.toThrow();
  });

  describe("Central allow() scope evaluation", () => {
    it("System Admin is strictly forbidden from registration approvals", () => {
      const allowed = allow(
        { id: "sys-1", role: "SYSTEM_ADMIN" },
        "ACCOUNT_APPROVE",
        { orgUnitId: "unit-1" },
      );
      expect(allowed).toBe(false);
    });

    it("Department Head can approve registrations in own department only", () => {
      const headUser = { id: "head-1", role: "DEPARTMENT_HEAD" as const, orgUnitId: "unit-cs" };

      expect(
        allow(headUser, "ACCOUNT_APPROVE", { orgUnitId: "unit-cs" }),
      ).toBe(true);

      expect(
        allow(headUser, "ACCOUNT_APPROVE", { orgUnitId: "unit-math" }),
      ).toBe(false);
    });

    it("Account Admin can approve registrations ONLY when fallback trigger is met", () => {
      const accountAdminUser = { id: "admin-1", role: "ACCOUNT_ADMIN" as const };

      // Normal pending request under active head: false
      expect(
        allow(accountAdminUser, "ACCOUNT_APPROVE", {
          orgUnitId: "unit-cs",
          fallbackTriggerMet: false,
        }),
      ).toBe(false);

      // Fallback trigger met (vacant head or pending > 5 days): true
      expect(
        allow(accountAdminUser, "ACCOUNT_APPROVE", {
          orgUnitId: "unit-cs",
          fallbackTriggerMet: true,
        }),
      ).toBe(true);
    });

    it("Department Head can deactivate only staff in own department", () => {
      const headUser = { id: "head-1", role: "DEPARTMENT_HEAD" as const, orgUnitId: "unit-cs" };

      expect(
        allow(headUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "staff-1",
          targetUserRole: "STAFF",
          targetUserUnitId: "unit-cs",
        }),
      ).toBe(true);

      expect(
        allow(headUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "staff-2",
          targetUserRole: "STAFF",
          targetUserUnitId: "unit-math",
        }),
      ).toBe(false);

      expect(
        allow(headUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "auditor-1",
          targetUserRole: "AUDITOR",
          targetUserUnitId: "unit-cs",
        }),
      ).toBe(false);
    });

    it("Account Admin can deactivate Heads and Auditors, but not System Admin", () => {
      const adminUser = { id: "admin-1", role: "ACCOUNT_ADMIN" as const };

      expect(
        allow(adminUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "head-1",
          targetUserRole: "DEPARTMENT_HEAD",
        }),
      ).toBe(true);

      expect(
        allow(adminUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "auditor-1",
          targetUserRole: "AUDITOR",
        }),
      ).toBe(true);

      expect(
        allow(adminUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "sys-1",
          targetUserRole: "SYSTEM_ADMIN",
        }),
      ).toBe(false);
    });

    it("System Admin can deactivate Account Admins", () => {
      const sysUser = { id: "sys-1", role: "SYSTEM_ADMIN" as const };

      expect(
        allow(sysUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "admin-1",
          targetUserRole: "ACCOUNT_ADMIN",
        }),
      ).toBe(true);
    });

    it("prevents self-deactivation", () => {
      const headUser = { id: "head-1", role: "DEPARTMENT_HEAD" as const, orgUnitId: "unit-cs" };

      expect(
        allow(headUser, "ACCOUNT_DEACTIVATE", {
          targetUserId: "head-1",
          targetUserRole: "DEPARTMENT_HEAD",
          targetUserUnitId: "unit-cs",
        }),
      ).toBe(false);
    });
  });

  describe("Designations functionality (Section 2.3)", () => {
    it("DEPARTMENT_CUSTODIAN designation grants department claiming and loan approval", () => {
      const staffWithDesignation = {
        id: "staff-tech-1",
        role: "STAFF" as const,
        orgUnitId: "unit-chem",
        designations: [
          {
            designation: "DEPARTMENT_CUSTODIAN",
            orgUnitId: "unit-chem",
            expiresAt: null,
            revokedAt: null,
          },
        ],
      };

      // Plain staff without designation cannot approve loans or claim department items
      const plainStaff = {
        id: "staff-2",
        role: "STAFF" as const,
        orgUnitId: "unit-chem",
      };
      expect(allow(plainStaff, "ITEM_CLAIM", { isOwnUnitItem: true })).toBe(false);
      expect(allow(plainStaff, "LOAN_APPROVE", { isOwnUnitItem: true })).toBe(false);

      // Staff with active designation can claim department items and approve department loans
      expect(
        allow(staffWithDesignation, "ITEM_CLAIM", {
          orgUnitId: "unit-chem",
          isOwnUnitItem: true,
        }),
      ).toBe(true);

      expect(
        allow(staffWithDesignation, "LOAN_APPROVE", {
          orgUnitId: "unit-chem",
          isOwnUnitItem: true,
        }),
      ).toBe(true);

      // But designation CANNOT approve transfers or registrations!
      expect(
        allow(staffWithDesignation, "TRANSFER_APPROVE", { orgUnitId: "unit-chem" }),
      ).toBe(false);
      expect(
        allow(staffWithDesignation, "ACCOUNT_APPROVE", { orgUnitId: "unit-chem" }),
      ).toBe(false);
    });

    it("expired or revoked designation loses its granted capabilities", () => {
      const staffExpired = {
        id: "staff-tech-2",
        role: "STAFF" as const,
        orgUnitId: "unit-chem",
        designations: [
          {
            designation: "DEPARTMENT_CUSTODIAN",
            orgUnitId: "unit-chem",
            expiresAt: new Date(Date.now() - 1000), // expired
            revokedAt: null,
          },
        ],
      };

      expect(allow(staffExpired, "LOAN_APPROVE", { isOwnUnitItem: true })).toBe(false);

      const staffRevoked = {
        id: "staff-tech-3",
        role: "STAFF" as const,
        orgUnitId: "unit-chem",
        designations: [
          {
            designation: "DEPARTMENT_CUSTODIAN",
            orgUnitId: "unit-chem",
            expiresAt: null,
            revokedAt: new Date(), // revoked
          },
        ],
      };

      expect(allow(staffRevoked, "LOAN_APPROVE", { isOwnUnitItem: true })).toBe(false);
    });
  });

  describe("Backend and Frontend permission list parity", () => {
    it("backend and frontend capability grants match for all roles", () => {
      for (const role of allSixRoles) {
        const backendCaps = capabilitiesFor(role);
        for (const cap of backendCaps) {
          expect(frontendHasCapability(role, cap as any)).toBe(true);
        }
      }
    });
  });
});
