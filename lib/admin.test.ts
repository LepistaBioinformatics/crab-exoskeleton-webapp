// NOTE: reconstructed from a partial capture after this file was deleted by an
// out-of-band rollback. The last case was completed by inference — verify this
// matches your original intent (there may have been additional cases below).
import { describe, it, expect } from "vitest";
import { ALL_AGENTS, canManageWorkspaceScope, picoclawAgentKeys, scopeKey } from "./admin";
import type { AdminScope } from "./admin";
import { SECRET_FORMATS, USER_SECRET_FORMATS } from "./secrets";

const T = "tenant-1";
const S = "sub-1";

describe("canManageWorkspaceScope", () => {
  it("denies when the caller has no scopes", () => {
    expect(canManageWorkspaceScope([], T, S)).toBe(false);
  });

  it("allows when the caller holds the tenant scope (any subscription under it)", () => {
    const scopes: AdminScope[] = [{ kind: "tenant", tenantId: T }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(true);
    expect(canManageWorkspaceScope(scopes, T, "other-sub")).toBe(true);
  });

  it("allows when the caller holds the matching subscription scope", () => {
    const scopes: AdminScope[] = [{ kind: "subscription", tenantId: T, subsAccId: S }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(true);
  });

  it("denies a subscription scope for a different subscription", () => {
    const scopes: AdminScope[] = [{ kind: "subscription", tenantId: T, subsAccId: "sub-2" }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(false);
  });

  it("denies a tenant scope for a different tenant", () => {
    const scopes: AdminScope[] = [{ kind: "tenant", tenantId: "tenant-2" }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(false);
  });
});

// The agent target has to be part of the scope identity: the panels key their
// reloads on it, so a scopeKey that ignored it would serve one agent's listing
// while another agent is selected.
describe("scopeKey with an agent target", () => {
  it("keeps the agent-less key unchanged", () => {
    expect(scopeKey({ kind: "tenant", tenantId: T })).toBe(`t:${T}`);
    expect(scopeKey({ kind: "subscription", tenantId: T, subsAccId: S })).toBe(`s:${T}:${S}`);
  });

  it("distinguishes agent targets at the same scope", () => {
    const base = { kind: "subscription" as const, tenantId: T, subsAccId: S };
    const all = scopeKey({ ...base, agent: ALL_AGENTS });
    const alpha = scopeKey({ ...base, agent: "alpha" });
    const beta = scopeKey({ ...base, agent: "beta" });
    expect(new Set([all, alpha, beta]).size).toBe(3);
  });
});

describe("USER_SECRET_FORMATS", () => {
  it("excludes native (moved to the admin surface) and keeps the rest", () => {
    expect(USER_SECRET_FORMATS).not.toContain("native");
    expect(USER_SECRET_FORMATS).toEqual(["dotenv", "json", "file"]);
    // The full list still carries native: a user's pre-gate entries must remain
    // listable and deletable.
    expect(SECRET_FORMATS).toContain("native");
  });
});

describe("picoclawAgentKeys", () => {
  it("drops agents running another harness", () => {
    expect(
      picoclawAgentKeys([
        { key: "alpha", harness: "picoclaw" },
        { key: "nous", harness: "hermes" },
      ]),
    ).toEqual(["alpha"]);
  });

  // An older proxy reports no harness at all, and picoclaw was the only harness
  // then — treating that as "not picoclaw" would empty the model picker entirely.
  it("treats an absent harness as picoclaw", () => {
    expect(picoclawAgentKeys([{ key: "alpha" }])).toEqual(["alpha"]);
  });
});
