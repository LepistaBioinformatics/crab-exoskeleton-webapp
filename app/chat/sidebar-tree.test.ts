import { describe, it, expect } from "vitest";
import { planWorkspaceTree, planLeaves, leafKey, type PlanNode } from "./sidebar-tree";
import type { AgentLeaf, TenantGroup } from "@/lib/subscriptions";

function agent(tenantId: string, subsAccId: string, role: string): AgentLeaf {
  return {
    tenantId,
    subsAccId,
    accName: subsAccId,
    role: role as AgentLeaf["role"],
    perms: ["read", "write"],
    verified: true,
    scaffolded: true,
  };
}

function tenant(
  tenantId: string,
  accounts: [string, string[]][],
  accNames: Record<string, string> = {},
): TenantGroup {
  return {
    tenantId,
    accounts: accounts.map(([subsAccId, roles]) => ({
      subsAccId,
      accName: accNames[subsAccId] ?? subsAccId,
      agents: roles.map((r) => agent(tenantId, subsAccId, r)),
    })),
  };
}

const kinds = (nodes: PlanNode[]): string[] =>
  nodes.flatMap((n) => [n.kind, ...(n.kind === "agent" ? [] : kinds(n.children))]);

// The plan USED TO hoist away any level holding a single node, so the same account
// rendered at a different depth depending on how many siblings it happened to have.
// Those tests are gone with the rule, not lost: what replaced them asserts the
// opposite property, which is that depth no longer depends on the data's shape.
describe("planWorkspaceTree — every level earns a row", () => {
  it("renders tenant and subscription rows even when each holds exactly one child", () => {
    const nodes = planWorkspaceTree([tenant("acme", [["growth", ["alpha"]]])], {});
    expect(kinds(nodes)).toEqual(["tenant", "account", "agent"]);
  });

  it("puts an agent at the same depth whatever the tree around it looks like", () => {
    const lonely = planWorkspaceTree([tenant("acme", [["growth", ["alpha"]]])], {});
    const crowded = planWorkspaceTree(
      [
        tenant("acme", [
          ["growth", ["alpha", "beta"]],
          ["sales", ["gamma"]],
        ]),
        tenant("other", [["ops", ["delta"]]]),
      ],
      {},
    );
    const depthOfFirstAgent = (nodes: PlanNode[], depth = 0): number =>
      nodes[0].kind === "agent" ? depth : depthOfFirstAgent(nodes[0].children, depth + 1);
    expect(depthOfFirstAgent(lonely)).toBe(2);
    expect(depthOfFirstAgent(crowded)).toBe(2);
  });

  it("keeps tenants, subscriptions and agents in input order", () => {
    const nodes = planWorkspaceTree(
      [
        tenant("acme", [
          ["growth", ["alpha", "beta"]],
          ["sales", ["gamma"]],
        ]),
        tenant("other", [["ops", ["delta"]]]),
      ],
      {},
    );
    expect(kinds(nodes)).toEqual([
      "tenant",
      "account",
      "agent",
      "agent",
      "account",
      "agent",
      "tenant",
      "account",
      "agent",
    ]);
  });
});

describe("labels", () => {
  // Tenant display names arrive per tenant, after the tree is already on screen.
  it("stands the uuid in for a tenant whose name has not arrived", () => {
    const nodes = planWorkspaceTree([tenant("acme-uuid", [["growth", ["alpha"]]])], {});
    expect(nodes[0].kind === "tenant" && nodes[0].label).toBe("acme-uuid");
  });

  it("uses the tenant's name once it has", () => {
    const nodes = planWorkspaceTree([tenant("acme-uuid", [["growth", ["alpha"]]])], {
      "acme-uuid": "Acme Corp",
    });
    expect(nodes[0].kind === "tenant" && nodes[0].label).toBe("Acme Corp");
  });

  it("falls back to the subscription's id when it carries no name", () => {
    const group = tenant("acme", [["growth-uuid", ["alpha"]]]);
    group.accounts[0].accName = "";
    const nodes = planWorkspaceTree([group], {});
    const account = nodes[0].kind === "tenant" ? nodes[0].children[0] : null;
    expect(account?.kind === "account" && account.label).toBe("growth-uuid");
  });

  it("prefers the subscription's name when it has one", () => {
    const nodes = planWorkspaceTree(
      [tenant("acme", [["growth-uuid", ["alpha"]]], { "growth-uuid": "Growth" })],
      {},
    );
    const account = nodes[0].kind === "tenant" ? nodes[0].children[0] : null;
    expect(account?.kind === "account" && account.label).toBe("Growth");
  });
});

// The plan decides RENDERING and nothing else. No workspace key, no fragment and no
// request depends on it — which is what lets the single-workspace shortcut read the
// leaf set straight off it.
describe("identity survives the plan untouched", () => {
  it("yields every leaf, in render order, with its key intact", () => {
    const nodes = planWorkspaceTree(
      [
        tenant("acme", [
          ["growth", ["alpha", "beta"]],
          ["sales", ["gamma"]],
        ]),
        tenant("other", [["ops", ["delta"]]]),
      ],
      { acme: "Acme Corp" },
    );
    const leaves = planLeaves(nodes);
    expect(leaves.map(leafKey)).toEqual([
      "acme|growth|alpha",
      "acme|growth|beta",
      "acme|sales|gamma",
      "other|ops|delta",
    ]);
  });

  it("finds the sole leaf the single-workspace shortcut acts on", () => {
    const nodes = planWorkspaceTree([tenant("acme", [["growth", ["alpha"]]])], {});
    expect(planLeaves(nodes)).toHaveLength(1);
    expect(leafKey(planLeaves(nodes)[0])).toBe("acme|growth|alpha");
  });

  it("plans nothing from nothing", () => {
    expect(planWorkspaceTree([], {})).toEqual([]);
    expect(planLeaves([])).toEqual([]);
  });
});
