import { describe, it, expect } from "vitest";
import {
  planWorkspaceTree,
  planLeaves,
  needsFilter,
  leafKey,
  FILTER_THRESHOLD,
  type PlanNode,
} from "./sidebar-tree";
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

function tenant(tenantId: string, accounts: [string, string[]][]): TenantGroup {
  return {
    tenantId,
    accounts: accounts.map(([subsAccId, roles]) => ({
      subsAccId,
      accName: subsAccId,
      agents: roles.map((r) => agent(tenantId, subsAccId, r)),
    })),
  };
}

const kinds = (nodes: PlanNode[]): string[] =>
  nodes.flatMap((n) => [n.kind, ...(n.kind === "agent" ? [] : kinds(n.children))]);

describe("planWorkspaceTree — a level with one node is hoisted away", () => {
  it("hoists both levels for one tenant, one subscription, four agents", () => {
    const plan = planWorkspaceTree([tenant("acme", [["growth", ["alpha", "beta", "gamma", "delta"]]])], {});
    // Four agent rows and nothing else: neither header would have grouped more than
    // one child.
    expect(kinds(plan.nodes)).toEqual(["agent", "agent", "agent", "agent"]);
  });

  it("is the one-tenant/one-subscription/one-workspace case too, by the same rule", () => {
    const plan = planWorkspaceTree([tenant("acme", [["growth", ["alpha"]]])], {});
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].kind).toBe("agent");
  });

  it("hoists only the subscriptions when there are two tenants with one each", () => {
    const plan = planWorkspaceTree(
      [tenant("acme", [["growth", ["alpha", "beta"]]]), tenant("other", [["sales", ["gamma"]]])],
      {},
    );
    expect(kinds(plan.nodes)).toEqual(["tenant", "agent", "agent", "tenant", "agent"]);
  });

  it("hoists only the tenant when one tenant has several subscriptions", () => {
    const plan = planWorkspaceTree(
      [tenant("acme", [["growth", ["alpha"]], ["sales", ["beta", "gamma"]]])],
      {},
    );
    expect(kinds(plan.nodes)).toEqual(["account", "agent", "account", "agent", "agent"]);
  });

  it("keeps both levels when both branch", () => {
    const plan = planWorkspaceTree(
      [
        tenant("acme", [["growth", ["alpha"]], ["sales", ["beta"]]]),
        tenant("other", [["ops", ["gamma"]], ["rnd", ["delta"]]]),
      ],
      {},
    );
    expect(kinds(plan.nodes)).toEqual([
      "tenant", "account", "agent", "account", "agent",
      "tenant", "account", "agent", "account", "agent",
    ]);
  });

  it("applies the rule per tenant, not globally", () => {
    // One tenant branches, the other does not: only the second loses its
    // subscription row.
    const plan = planWorkspaceTree(
      [
        tenant("acme", [["growth", ["alpha"]], ["sales", ["beta"]]]),
        tenant("other", [["ops", ["gamma"]]]),
      ],
      {},
    );
    expect(kinds(plan.nodes)).toEqual([
      "tenant", "account", "agent", "account", "agent",
      "tenant", "agent",
    ]);
  });
});

describe("planWorkspaceTree — identity and invariants", () => {
  it("reports the sole tenant so the group header can carry its identity", () => {
    const plan = planWorkspaceTree([tenant("acme", [["growth", ["alpha"]]])], { acme: "Acme Corp" });
    expect(plan.soleTenant).toEqual({ id: "acme", label: "Acme Corp" });
  });

  it("falls back to the tenant id when there is no display name", () => {
    const plan = planWorkspaceTree([tenant("acme", [["growth", ["alpha"]]])], {});
    expect(plan.soleTenant).toEqual({ id: "acme", label: "acme" });
  });

  it("reports no sole tenant when there are several", () => {
    const plan = planWorkspaceTree(
      [tenant("a", [["s", ["x"]]]), tenant("b", [["s", ["y"]]])],
      {},
    );
    expect(plan.soleTenant).toBeNull();
  });

  // The rule is about rendering. If hoisting could drop or alter a leaf it would
  // change which workspace a click opens.
  it("preserves every agent leaf and its key, whatever is hoisted", () => {
    const groups = [
      tenant("acme", [["growth", ["alpha", "beta"]], ["sales", ["gamma"]]]),
      tenant("other", [["ops", ["delta"]]]),
    ];
    const plan = planWorkspaceTree(groups, {});
    const planned = planLeaves(plan.nodes).map(leafKey);
    const expected = groups.flatMap((t) => t.accounts.flatMap((a) => a.agents)).map(leafKey);
    expect(planned).toEqual(expected);
  });

  it("handles an empty tree and a tenant with no agents", () => {
    expect(planWorkspaceTree([], {}).nodes).toEqual([]);
    expect(planWorkspaceTree([], {}).soleTenant).toBeNull();
    const empty = planWorkspaceTree([tenant("acme", [["growth", []]])], {});
    expect(planLeaves(empty.nodes)).toEqual([]);
  });

  it("labels a subscription by its id when it has no name", () => {
    const groups: TenantGroup[] = [
      {
        tenantId: "acme",
        accounts: [
          { subsAccId: "s1", accName: "", agents: [agent("acme", "s1", "alpha")] },
          { subsAccId: "s2", accName: "Named", agents: [agent("acme", "s2", "beta")] },
        ],
      },
    ];
    const labels = planWorkspaceTree(groups, {}).nodes.map((n) =>
      n.kind === "account" ? n.label : n.kind,
    );
    expect(labels).toEqual(["s1", "Named"]);
  });

  // The plan is what a filtered tree is rendered from too, so the rule has to hold
  // on the filtered shape: filtering down to one tenant hides that tenant's row.
  it("applies to a filtered tree, not just the full one", () => {
    const filtered = [tenant("acme", [["growth", ["alpha"]]])];
    expect(kinds(planWorkspaceTree(filtered, {}).nodes)).toEqual(["agent"]);
  });
});

describe("agentCount and the filter threshold", () => {
  it("counts agent leaves, not tenant or subscription rows", () => {
    // Five agents spread over two tenants and three subscriptions: five, not ten.
    const plan = planWorkspaceTree(
      [
        tenant("acme", [["growth", ["a", "b"]], ["sales", ["c"]]]),
        tenant("other", [["ops", ["d", "e"]]]),
      ],
      {},
    );
    expect(plan.agentCount).toBe(5);
  });

  it("withholds the filter at the threshold and offers it above", () => {
    expect(FILTER_THRESHOLD).toBe(5);
    expect(needsFilter(0)).toBe(false);
    expect(needsFilter(5)).toBe(false);
    expect(needsFilter(6)).toBe(true);
  });
});
