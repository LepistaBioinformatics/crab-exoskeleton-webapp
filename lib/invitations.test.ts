import { describe, it, expect } from "vitest";
import {
  availableLevels,
  isValidEmail,
  mergeRoster,
  permissionLevel,
  resolveRoleId,
  type GuestRole,
  type GuestUser,
} from "./invitations";
import type { UserRef } from "./admin";

// A tenant whose gateway config declares alpha read+write and beta read only —
// the shape a real deployment produces, including the asymmetry.
const ROLES: GuestRole[] = [
  { id: "r-alpha-read", name: "alpha", slug: "alpha", permission: 0 },
  { id: "r-alpha-write", name: "alpha", slug: "alpha", permission: 1 },
  { id: "r-beta-read", name: "beta", slug: "beta", permission: "read" },
];

describe("permissionLevel", () => {
  it("normalizes the numeric enum", () => {
    expect(permissionLevel(0)).toBe("read");
    expect(permissionLevel(1)).toBe("write");
  });

  it("normalizes the string form, whatever its casing", () => {
    expect(permissionLevel("Write")).toBe("write");
    expect(permissionLevel("READ")).toBe("read");
  });

  it("returns null for a value it does not understand, rather than guessing", () => {
    expect(permissionLevel(42)).toBeNull();
    expect(permissionLevel("owner")).toBeNull();
  });

  it("never infers a level from a substring", () => {
    // "overwrite" contains "write" and "thread" contains "read". Reading either
    // as a grant would hand out an access level nobody declared.
    expect(permissionLevel("overwrite")).toBeNull();
    expect(permissionLevel("thread")).toBeNull();
    expect(permissionLevel("readonly")).toBeNull();
  });
});

describe("resolveRoleId", () => {
  it("picks the role matching both the agent and the access level", () => {
    expect(resolveRoleId(ROLES, "alpha", "write")).toBe("r-alpha-write");
    expect(resolveRoleId(ROLES, "alpha", "read")).toBe("r-alpha-read");
  });

  it("returns null when the tenant declares no such role", () => {
    // beta has no write path in this config — a real state, not an error.
    expect(resolveRoleId(ROLES, "beta", "write")).toBeNull();
    expect(resolveRoleId(ROLES, "gamma", "read")).toBeNull();
  });

  it("ignores a role with no id — it cannot be granted", () => {
    const roles: GuestRole[] = [{ id: null, name: "alpha", slug: "alpha", permission: 1 }];
    expect(resolveRoleId(roles, "alpha", "write")).toBeNull();
  });

  it("matches on the slug when the name differs", () => {
    const roles: GuestRole[] = [
      { id: "r", name: "Alpha Agent", slug: "alpha", permission: 1 },
    ];
    expect(resolveRoleId(roles, "alpha", "write")).toBe("r");
  });
});

describe("availableLevels", () => {
  it("offers only what the gateway declared", () => {
    expect(availableLevels(ROLES, "alpha")).toEqual(["read", "write"]);
    expect(availableLevels(ROLES, "beta")).toEqual(["read"]);
    expect(availableLevels(ROLES, "gamma")).toEqual([]);
  });
});

describe("mergeRoster", () => {
  const guest = (email: string, roleId: string, created?: string): GuestUser => ({
    email,
    guestRole: { id: roleId },
    created,
  });
  const user = (email: string, accId: string, role: string): UserRef => ({ accId, email, role });

  it("marks a guest with no workspace as not yet active", () => {
    const roster = mergeRoster([guest("new@x.com", "r-alpha-write")], [], ROLES);
    expect(roster).toHaveLength(1);
    expect(roster[0].active).toBe(false);
    expect(roster[0].roles).toEqual(["alpha (write)"]);
  });

  it("merges a guest and their workspace into one entry", () => {
    const roster = mergeRoster(
      [guest("used@x.com", "r-alpha-write")],
      [user("used@x.com", "acc-1", "alpha")],
      ROLES,
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].active).toBe(true);
    expect(roster[0].accId).toBe("acc-1");
  });

  it("matches case-insensitively — the two feeds do not agree on casing", () => {
    const roster = mergeRoster(
      [guest("Mixed@X.com", "r-alpha-write")],
      [user("mixed@x.com", "acc-2", "alpha")],
      ROLES,
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].active).toBe(true);
  });

  it("keeps a workspace with no matching guest row", () => {
    // Someone guested outside this UI, or whose guest row was revoked while the
    // workspace stayed. Dropping them would hide a real member.
    const roster = mergeRoster([], [user("legacy@x.com", "acc-3", "alpha")], ROLES);
    expect(roster).toHaveLength(1);
    expect(roster[0].active).toBe(true);
  });

  it("does not pair a guest with an unrelated role when the id is missing", () => {
    // Both the guest row and some role can lack an id; matching undefined to
    // undefined would label this guest with whatever role happened to be first.
    const roles: GuestRole[] = [
      { id: null, name: "beta", slug: "beta", permission: 1 },
      { id: "r-alpha-write", name: "alpha", slug: "alpha", permission: 1 },
    ];
    const roster = mergeRoster([{ email: "x@x.com", guestRole: { id: null } }], [], roles);
    expect(roster[0].roles).toEqual(["unknown"]);
  });

  it("carries the verification state through", () => {
    const roster = mergeRoster(
      [
        { email: "pending@x.com", guestRole: { id: "r-alpha-write" } },
        { email: "ok@x.com", guestRole: { id: "r-alpha-write" }, wasVerified: true },
      ],
      [],
      ROLES,
    );
    const byEmail = Object.fromEntries(roster.map((r) => [r.email, r]));
    expect(byEmail["ok@x.com"].verified).toBe(true);
    expect(byEmail["pending@x.com"].verified).toBe(false);
  });

  it("treats one verified grant as verifying the person", () => {
    // Several rows for one email are separate role grants, not separate people.
    const roster = mergeRoster(
      [
        { email: "multi@x.com", guestRole: { id: "r-alpha-read" } },
        { email: "multi@x.com", guestRole: { id: "r-alpha-write" }, wasVerified: true },
      ],
      [],
      ROLES,
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].verified).toBe(true);
  });

  it("collects several roles onto one person", () => {
    const roster = mergeRoster(
      [guest("multi@x.com", "r-alpha-write"), guest("multi@x.com", "r-beta-read")],
      [],
      ROLES,
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].roles).toEqual(["alpha (write)", "beta (read)"]);
  });

  it("sorts by email so the list does not reshuffle between loads", () => {
    const roster = mergeRoster(
      [guest("zoe@x.com", "r-alpha-read"), guest("amy@x.com", "r-alpha-read")],
      [],
      ROLES,
    );
    expect(roster.map((r) => r.email)).toEqual(["amy@x.com", "zoe@x.com"]);
  });
});

describe("isValidEmail", () => {
  it("accepts an ordinary address and trims it", () => {
    expect(isValidEmail("  a@b.co  ")).toBe(true);
  });

  it("rejects the half-typed states the form has to sit through", () => {
    for (const bad of ["", "a", "a@", "a@b", "a b@c.co"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});
