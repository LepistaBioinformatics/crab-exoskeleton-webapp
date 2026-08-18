import { describe, it, expect } from "vitest";
import { buildColumns, type ColumnsInput } from "./columns";
import type { AdminScope, AgentRef, ScopeRef } from "@/lib/admin";

// The discard rule, tested through what it is FOR rather than through the handler that
// applies it: after a change at level n, the columns must not carry a selection that no
// longer descends from it.
//
// `select` in admin-screen.tsx is the only place this rule lives, and it is a callback
// bound to a router — so this asserts the property it has to produce, on the model it
// produces it in.

const AGENTS: AgentRef[] = [{ key: "alpha" }, { key: "beta" }];
const SCOPES: AdminScope[] = [
  { kind: "tenant", tenantId: "t1", tenantName: "Innovation" },
  { kind: "subscription", tenantId: "t1", subsAccId: "a1", accName: "Marketing" },
  { kind: "subscription", tenantId: "t2", subsAccId: "b1" },
];
const SCOPE_A: ScopeRef = { kind: "subscription", tenantId: "t1", subsAccId: "a1" };

function build(over: Partial<ColumnsInput> = {}) {
  return buildColumns({
    authority: { hasScopes: true, canEditBranding: true },
    agents: AGENTS,
    scopes: SCOPES,
    root: "workspaces",
    agent: "alpha",
    tenantId: "t1",
    scope: SCOPE_A,
    section: "secrets",
    ...over,
  });
}

const selectedIn = (cols: ReturnType<typeof build>, key: string) =>
  cols.find((c) => c.key === key)?.rows.find((r) => r.selected);

describe("the discard rule", () => {
  // What `select` writes when the agent CHANGES: tenant and scope cleared.
  it("leaves no tenant, scope or section standing after an agent change", () => {
    const cols = build({ agent: "beta", tenantId: null, scope: null, section: null });
    expect(cols.map((c) => c.key)).toEqual(["root", "agents", "tenants"]);
    expect(selectedIn(cols, "agents")?.text).toBe("beta");
  });

  it("leaves no scope standing after a tenant change", () => {
    const cols = build({ tenantId: "t2", scope: null, section: null });
    expect(cols.map((c) => c.key)).toEqual(["root", "agents", "tenants", "subscriptions"]);
    expect(selectedIn(cols, "subscriptions")).toBeUndefined();
  });

  // THE COUNTERPART, and the one an over-literal reading of the rule breaks: re-selecting
  // the row that is already selected leaves the head identical, so the tail still
  // descends and must survive. An admin who clicks the agent they are already in — to
  // re-read it, or because it is under their thumb on a phone — keeps their place.
  it("keeps the whole path when the selection does not actually change", () => {
    const cols = build();
    expect(cols.map((c) => c.key)).toEqual([
      "root",
      "agents",
      "tenants",
      "subscriptions",
      "sections",
    ]);
    expect(selectedIn(cols, "agents")?.text).toBe("alpha");
    expect(selectedIn(cols, "sections")?.textKey).toBe("secrets");
    // The row `select` is handed already carries the flag it guards on.
    expect(selectedIn(cols, "agents")?.selected).toBe(true);
  });

  // Branding leaves the path in the URL untouched, so coming back restores it whole.
  it("restores the path when leaving and re-entering branding", () => {
    expect(build({ root: "branding" }).map((c) => c.key)).toEqual(["root"]);
    expect(build({ root: "workspaces" }).map((c) => c.key)).toHaveLength(5);
  });
});
