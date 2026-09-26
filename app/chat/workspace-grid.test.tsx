import { describe, it, expect } from "vitest";
import {
  accountName,
  agentRows,
  groupWorkspaces,
  loneWorkspace,
  type Subscription,
} from "@/lib/subscriptions";

// The picker is now ONE ROW PER AGENT, flattened out of this tree, so the grouping and
// the flattening together decide what the screen can be. The rendering itself needs
// fetch and effects, which this suite (`environment: "node"`) does not run.
//
// The grouping tests stay although the picker no longer draws boxes: the sidebar tree
// still renders the hierarchy, and `agentRows` flattens the same structure. A change
// that broke the grouping would break both.

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

// Write is the norm, so the picker marks only the exception. The union comes from
// groupWorkspaces, and getting this backwards would either annotate every agent (saying
// nothing) or annotate none (hiding the one case that matters).
describe("which agents are marked read-only", () => {
  const permsOf = (rows: Subscription[]) =>
    groupWorkspaces(rows)[0].accounts[0].agents[0].perms.map((p) => p.toLowerCase());

  it("leaves a writer unmarked", () => {
    expect(permsOf([sub({ perm: "write" })])).toContain("write");
  });

  it("leaves read+write unmarked, since write is present", () => {
    expect(permsOf([sub({ perm: "read" }), sub({ perm: "write" })])).toContain("write");
  });

  it("marks a reader, which is the only case worth a glyph", () => {
    const perms = permsOf([sub({ perm: "read" })]);
    expect(perms).toContain("read");
    expect(perms).not.toContain("write");
  });

  // normalizePerms maps anything containing "write" — the marker must not treat a spelling it
  // does not recognise as read-only and annotate a writer.
  it("recognises write however the feed spells it", () => {
    expect(permsOf([sub({ perm: "OVERWRITE" })])).toContain("write");
  });
});


// ONE ROW PER AGENT. The picker used to render the tree literally -- a section per
// tenant, boxes of subscriptions inside it, square agent tiles inside those. The tree is
// the shape of the permission model; the row is the shape of the question.
describe("the agent rows behind the picker", () => {
  it("flattens every agent out of the tree, whatever its tenant or subscription", () => {
    const groups = groupWorkspaces([
      sub({ role: "alpha" }),
      sub({ role: "beta" }),
      sub({ subsAccId: "s2", accName: "Research", role: "gamma" }),
      sub({ tenantId: "t2", subsAccId: "s3", role: "delta" }),
    ]);
    expect(agentRows(groups).map((a) => a.role)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  // Every column the row draws has to survive the flattening, or the row would have to
  // look its own tenant up again.
  it("keeps each agent's tenant and subscription on the agent itself", () => {
    const groups = groupWorkspaces([sub({ tenantId: "acme", accName: "Growth" })]);
    expect(agentRows(groups)[0]).toMatchObject({ tenantId: "acme", accName: "Growth" });
  });

  it("is empty for an empty tree", () => {
    expect(agentRows([])).toEqual([]);
  });
});

// The shortcut past the picker. It shipped in 2026-07, was deleted as collateral of the
// shell redesign in 2026-09, and had NO test -- which is why nothing went red. These are
// that missing test.
describe("the lone workspace", () => {
  it("is entered without being asked when it is the only agent anywhere", () => {
    const groups = groupWorkspaces([sub({ role: "alpha" })]);
    expect(loneWorkspace(groups)).toMatchObject({ role: "alpha", tenantId: "t1" });
  });

  // THE COUNT IS OVER LEAVES, not over tenants or subscriptions, because the agent is
  // what is being chosen. Each of the next three is a real choice.
  it("is not two agents in one subscription", () => {
    const groups = groupWorkspaces([sub({ role: "alpha" }), sub({ role: "beta" })]);
    expect(loneWorkspace(groups)).toBeNull();
  });

  it("is not one agent in each of two subscriptions", () => {
    const groups = groupWorkspaces([
      sub({ subsAccId: "s1", role: "alpha" }),
      sub({ subsAccId: "s2", accName: "Research", role: "beta" }),
    ]);
    expect(loneWorkspace(groups)).toBeNull();
  });

  it("is not one agent in each of two tenants", () => {
    const groups = groupWorkspaces([
      sub({ tenantId: "t1", role: "alpha" }),
      sub({ tenantId: "t2", subsAccId: "s2", role: "beta" }),
    ]);
    expect(loneWorkspace(groups)).toBeNull();
  });

  // One agent reachable read AND write is ONE leaf, not two -- the perms collapse. A
  // count over subscription ROWS rather than leaves would refuse the shortcut to exactly
  // the member it is for.
  it("is still lone when the single agent is reachable both read and write", () => {
    const groups = groupWorkspaces([sub({ perm: "read" }), sub({ perm: "write" })]);
    expect(loneWorkspace(groups)).toMatchObject({ role: "alpha" });
  });

  it("is nothing to enter when the member has no workspaces", () => {
    expect(loneWorkspace([])).toBeNull();
  });

  // NOT THE SAME AS AN EMPTY LIST, and the distinction is the whole reason this takes a
  // nullable. `null` is "the fetch has not landed", and entering on it would be
  // answering before the question is known.
  it("holds while the list has not loaded", () => {
    expect(loneWorkspace(null)).toBeNull();
  });
});
