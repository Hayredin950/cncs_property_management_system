/**
 * The three-way capability check.
 *
 * The permission matrix is written out three times by hand: once in the
 * backend (`backend/src/services/permissions.ts`), once in the web client
 * (`frontend/src/lib/permissions.ts`) and once in the mobile client
 * (`mobile/lib/models/permissions.dart`). Hand-copied matrices drift — and they
 * did: the web client was missing `SYSTEM_CONFIG` and `DISPOSAL_REVERSE`, and
 * both clients were missing a grant the server had. Nothing failed, because a
 * missing capability only ever *hides* something: a button that should have
 * appeared did not, and a screen that should have been openable was not.
 *
 * This test reads all three files and fails when they disagree. It is a static
 * check (no database, no server) so it can run in CI in a second.
 *
 * How it works
 * ------------
 * 1. The backend's `Capability` union gives the universe of capability names.
 * 2. Each client's grants are read as `ROLE: [ ... ]` blocks.
 * 3. The backend's grants are the reference; every client must grant a role
 *    exactly what the backend grants it, and must not invent a capability.
 * 4. The capability *names* must also match — the web uses SCREAMING_SNAKE
 *    and the mobile uses camelCase, so the names are compared after folding
 *    case and underscores.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..", "..");
const backendFile = join(repoRoot, "backend", "src", "services", "permissions.ts");
const webFile = join(repoRoot, "frontend", "src", "lib", "permissions.ts");
const mobileFile = join(repoRoot, "mobile", "lib", "models", "permissions.dart");

const ROLES = [
  "SYSTEM_ADMIN",
  "PROPERTY_OFFICER",
  "DEPARTMENT_HEAD",
  "STAFF",
  "AUDITOR",
] as const;
type Role = (typeof ROLES)[number];

/** `ITEM_READ_ALL` and `itemReadAll` are the same capability. */
function fold(name: string): string {
  return name.replace(/_/g, "").toLowerCase();
}

/** The capability universe the backend declares. */
function backendCapabilityNames(): Set<string> {
  const source = readFileSync(backendFile, "utf8");
  const union = source.slice(source.indexOf("Capability ="), source.indexOf(";>", source.indexOf("Capability =")));
  const names = new Set<string>();
  for (const match of union.matchAll(/"([A-Z][A-Z_0-9]*)"/g)) {
    names.add(match[1]!);
  }
  return names;
}

/** The backend's grants: the reference. */
function backendGrants(): Map<Role, Set<string>> {
  const source = readFileSync(backendFile, "utf8");
  const grants = new Map<Role, Set<string>>();
  const re = /(SYSTEM_ADMIN|PROPERTY_OFFICER|DEPARTMENT_HEAD|STAFF|AUDITOR):\s*\[([\s\S]*?)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const role = match[1] as Role;
    const names = new Set<string>();
    for (const name of match[2]!.matchAll(/"([A-Z][A-Z_0-9]*)"/g)) {
      names.add(name[1]!);
    }
    grants.set(role, names);
  }
  return grants;
}

/** The web client's grants. */
function webGrants(): Map<Role, Set<string>> {
  const source = readFileSync(webFile, "utf8");
  const grants = new Map<Role, Set<string>>();
  const re = /(SYSTEM_ADMIN|PROPERTY_OFFICER|DEPARTMENT_HEAD|STAFF|AUDITOR):\s*\[([\s\S]*?)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const role = match[1] as Role;
    const names = new Set<string>();
    for (const name of match[2]!.matchAll(/"([A-Z][A-Z_0-9]*)"/g)) {
      names.add(name[1]!);
    }
    grants.set(role, names);
  }
  return grants;
}

/** The mobile client's grants: `Role.systemAdmin: { Capability.x, ... }`. */
function mobileGrants(): Map<Role, Set<string>> {
  const source = readFileSync(mobileFile, "utf8");
  const roleMap: Record<string, Role> = {
    systemAdmin: "SYSTEM_ADMIN",
    propertyOfficer: "PROPERTY_OFFICER",
    departmentHead: "DEPARTMENT_HEAD",
    staff: "STAFF",
    auditor: "AUDITOR",
  };
  const grants = new Map<Role, Set<string>>();
  const re = /Role\.(\w+):\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const role = roleMap[match[1]!];
    if (!role) continue;
    const names = new Set<string>();
    for (const name of match[2]!.matchAll(/Capability\.(\w+)/g)) {
      names.add(name[1]!);
    }
    grants.set(role, names);
  }
  return grants;
}

/** What the mobile client's `enum Capability` declares. */
function mobileCapabilityNames(): Set<string> {
  const source = readFileSync(mobileFile, "utf8");
  const start = source.indexOf("enum Capability {");
  const end = source.indexOf("}", start);
  const names = new Set<string>();
  for (const match of source.slice(start, end).matchAll(/^\s*(\w+),/gm)) {
    names.add(match[1]!);
  }
  return names;
}

describe("the capability matrix is the same in the backend, the web client and the mobile client", () => {
  const backend = backendGrants();
  const web = webGrants();
  const mobile = mobileGrants();
  const universe = backendCapabilityNames();

  it("declares the same capability names everywhere", () => {
    const webNames = new Set([...universe].map(fold));
    const mobileNames = new Set([...mobileCapabilityNames()].map(fold));

    // Every capability the backend knows must exist in the web client.
    for (const name of universe) {
      expect(webNames, `the web client is missing the capability ${name}`).toContain(fold(name));
    }
    // ...and in the mobile client.
    for (const name of universe) {
      expect(mobileNames, `the mobile client is missing the capability ${name}`).toContain(fold(name));
    }
  });

  it("grants every role exactly what the backend grants it (web)", () => {
    for (const role of ROLES) {
      const expected = [...(backend.get(role) ?? [])].map(fold).sort();
      const actual = [...(web.get(role) ?? [])].map(fold).sort();
      expect(actual, `the web client's grants for ${role} differ from the backend's`).toEqual(expected);
    }
  });

  it("grants every role exactly what the backend grants it (mobile)", () => {
    for (const role of ROLES) {
      const expected = [...(backend.get(role) ?? [])].map(fold).sort();
      const actual = [...(mobile.get(role) ?? [])].map(fold).sort();
      expect(actual, `the mobile client's grants for ${role} differ from the backend's`).toEqual(expected);
    }
  });
});
