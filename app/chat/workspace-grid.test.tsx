import { describe, it, expect } from "vitest";
import { accountName, groupWorkspaces, type Subscription } from "@/lib/subscriptions";

// The grid's layout follows this grouping exactly — one row per tenant, one box per
// subscription in that row, agents inside the box — so the grouping is what decides
// whether the screen can be built at all. The rendering itself needs fetch and effects,
// which this suite (`environment: "node"`) does not run.

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    tenantId: "t1",
    subsAccId: "s1",
    accName: "Growth",
    role: "alpha",
    perm: "read",
    verified: true,
    scaffolded: true,
    ...over,
  };
}

describe("workspace grouping behind the grid", () => {
  it("puts each tenant in its own group", () => {
    const groups = groupWorkspaces([
      sub({ tenantId: "t1" }),
      sub({ tenantId: "t2", subsAccId: "s2" }),
    ]);
    expect(groups.map((g) => g.tenantId)).toEqual(["t1", "t2"]);
  });

  it("gives a tenant one box per subscription", () => {
    const groups = groupWorkspaces([
      sub({ subsAccId: "s1", accName: "Growth" }),
      sub({ subsAccId: "s2", accName: "Research" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].accounts.map((a) => a.accName)).toEqual(["Growth", "Research"]);
  });

  it("lists every agent inside its own subscription's box", () => {
    const groups = groupWorkspaces([
      sub({ role: "alpha" }),
      sub({ role: "beta" }),
      sub({ subsAccId: "s2", accName: "Research", role: "gamma" }),
    ]);
    const [growth, research] = groups[0].accounts;
    expect(growth.agents.map((a) => a.role)).toEqual(["alpha", "beta"]);
    expect(research.agents.map((a) => a.role)).toEqual(["gamma"]);
  });

  // The permission icons are driven by this union, so read+write must collapse into ONE
  // agent carrying both — not two rows for the same agent.
  it("collapses a read row and a write row into one agent with both perms", () => {
    const groups = groupWorkspaces([
      sub({ perm: "read" }),
      sub({ perm: "write" }),
    ]);
    const agents = groups[0].accounts[0].agents;
    expect(agents).toHaveLength(1);
    expect([...agents[0].perms].sort()).toEqual(["read", "write"]);
  });
});

// The header's subscription-led treatment reads the same name this grid shows, via
// accountName over the same tree — so a subscription with no name must degrade the same
// way in both places rather than surfacing a uuid in one of them.
describe("subscription naming", () => {
  it("resolves a named subscription for a chosen workspace", () => {
    const groups = groupWorkspaces([sub({ accName: "Growth" })]);
    expect(accountName(groups, "t1", "s1")).toBe("Growth");
  });

  it("is null for a blank name, so callers fall back instead of showing a uuid", () => {
    const groups = groupWorkspaces([sub({ accName: "   " })]);
    expect(accountName(groups, "t1", "s1")).toBeNull();
  });

  it("is null while the tree has not loaded", () => {
    expect(accountName(null, "t1", "s1")).toBeNull();
  });
});
