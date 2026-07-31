import { describe, it, expect } from "vitest";
import {
  availableLevels,
  embeddedRole,
  emailText,
  isValidEmail,
  mergeRoster,
  permissionLevel,
  resolveRoleId,
  roleRefId,
  type GuestRole,
  type GuestUser,
} from "./invitations";
import type { UserRef } from "./admin";

// Roster rows carry a grant per role now; most assertions only care about the
// text, so read it through one helper rather than restating the shape.
const labels = (entry: { roles: { label: string }[] }) => entry.roles.map((r) => r.label);

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

describe("emailText", () => {
  // Mycelium sends an Email as {username, domain}, not a string. Assuming the
  // string form crashed the whole Members screen with
  // "a.email.toLowerCase is not a function".
  it("renders the structured form mycelium actually sends", () => {
    expect(emailText({ username: "ana", domain: "x.com" })).toBe("ana@x.com");
  });

  it("still accepts a plain string", () => {
    expect(emailText("ana@x.com")).toBe("ana@x.com");
  });

  it("returns empty for anything unusable instead of throwing", () => {
    expect(emailText(undefined)).toBe("");
    expect(emailText(null)).toBe("");
    expect(emailText({})).toBe("");
    expect(emailText({ username: "ana" })).toBe("");
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
    expect(labels(roster[0])).toEqual(["alpha (write)"]);
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
    expect(labels(roster[0])).toEqual(["unknown"]);
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

  it("handles the structured email mycelium sends", () => {
    const roster = mergeRoster(
      [{ email: { username: "ana", domain: "x.com" }, guestRole: { id: "r-alpha-write" } }],
      [user("ana@x.com", "acc-9", "alpha")],
      ROLES,
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].email).toBe("ana@x.com");
    // And it still matches the workspace feed, which sends a plain string.
    expect(roster[0].active).toBe(true);
  });

  it("skips a guest row whose email cannot be read", () => {
    // One malformed row must not take the whole roster down with it.
    const roster = mergeRoster(
      [
        { email: {} as never, guestRole: { id: "r-alpha-write" } },
        guest("ok@x.com", "r-alpha-write"),
      ],
      [],
      ROLES,
    );
    expect(roster.map((r) => r.email)).toEqual(["ok@x.com"]);
  });

  it("collects several roles onto one person", () => {
    const roster = mergeRoster(
      [guest("multi@x.com", "r-alpha-write"), guest("multi@x.com", "r-beta-read")],
      [],
      ROLES,
    );
    expect(roster).toHaveLength(1);
    expect(labels(roster[0])).toEqual(["alpha (write)", "beta (read)"]);
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

// The shape `listGuestOnSubscriptionAccount` actually returns. `Parent<T, Id>` is
// an externally tagged enum, so the role arrives wrapped under its variant name —
// NOT as the flat {id, name} the reference TS types describe. Reading it flat
// yielded no name and no permission, every label came out "unknown", and because
// members-panel derives the revoke button from that label, the whole uninvite
// affordance disappeared. A silent wire-shape mismatch is exactly the failure
// these assertions exist to catch.
describe("guestRole wire shapes", () => {
  const record = (id: string, name: string, permission: number | string): GuestUser => ({
    email: "wire@x.com",
    guestRole: { record: { id, name, slug: name, permission } },
  });

  it("reads the embedded record mycelium actually sends", () => {
    expect(embeddedRole({ record: { id: "r", name: "alpha", slug: "alpha", permission: 1 } })?.name)
      .toBe("alpha");
    expect(roleRefId({ record: { id: "r-1", name: "alpha", slug: "alpha", permission: 1 } }))
      .toBe("r-1");
  });

  it("labels a guest from its own payload, with no roles list at all", () => {
    // A TenantManager profile can list guests but is refused by guestRoles.list,
    // and that list truncates at mycelium's default page size — so the label must
    // not depend on cross-referencing it.
    const roster = mergeRoster([record("r-x", "alpha", "write")], [], []);
    expect(labels(roster[0])).toEqual(["alpha (write)"]);
  });

  it("carries the role id on the grant, so revoking never re-parses the label", () => {
    // The revoke button used to recover (agent, level) from the badge text and
    // re-resolve it against the tenant roles list. That only worked while the
    // label had been BUILT from that list. Now that a guest's own embedded record
    // wins, a role absent from `roles` would re-resolve to null and the button
    // would silently do nothing. The id has to travel with the grant.
    const [entry] = mergeRoster([record("r-embedded", "Analyst", "write")], [], []);
    expect(entry.roles[0].roleId).toBe("r-embedded");
    expect(entry.roles[0].agentKey).toBe("Analyst");
    expect(entry.roles[0].level).toBe("write");
  });

  it("gives a workspace-only row no role id, because there is nothing to revoke", () => {
    const [entry] = mergeRoster([], [{ accId: "acc-1", email: "solo@x.com", role: "alpha" }], ROLES);
    expect(entry.roles[0].roleId).toBeNull();
    expect(entry.roles[0].level).toBeNull();
  });

  it("accepts the numeric permission form in the embedded record too", () => {
    const roster = mergeRoster([record("r-y", "beta", 0)], [], ROLES);
    expect(labels(roster[0])).toEqual(["beta (read)"]);
  });

  it("still reads the other Parent variant and the legacy shapes", () => {
    expect(roleRefId({ id: "r-alpha-write" })).toBe("r-alpha-write");
    expect(roleRefId("r-alpha-write")).toBe("r-alpha-write");
    expect(labels(mergeRoster([{ email: "a@x.com", guestRole: "r-alpha-write" }], [], ROLES)[0]))
      .toEqual(["alpha (write)"]);
  });

  it("returns null rather than a guess for a record it cannot read", () => {
    expect(embeddedRole({ record: null })).toBeNull();
    expect(embeddedRole({ id: "r-1" })).toBeNull();
    expect(embeddedRole(undefined)).toBeNull();
    expect(roleRefId({ record: null })).toBeNull();
    expect(roleRefId({ id: "   " })).toBeNull();
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
