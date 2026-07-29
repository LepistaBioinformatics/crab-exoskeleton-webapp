import type { AgentLeaf, TenantGroup } from "@/lib/subscriptions";

// The workspace tree's RENDER PLAN: every level gets a row.
//
// It used to hoist away any level holding a single node — one tenant, or one
// subscription under a tenant, contributed no row and its label was carried onto the
// surviving header. That saved vertical space at the cost of a shape that changed with
// the data: the same account rendered at a different depth, under a different header,
// depending on how many siblings it happened to have. Members could not learn it,
// because there was nothing stable to learn.
//
// The full tree states where a workspace sits every time. It is also cheap now in the
// case hoisting was designed for: a member with a single workspace is taken straight
// to its conversations and never sees this tree at all.
//
// React-free so the rule is testable without mounting anything, which this suite
// (`environment: "node"`) requires.
//
// It decides rendering only. No workspace key, no fragment and no request depends on
// it: every agent leaf in the input appears in the output with its identity untouched.

export type PlanNode =
  | { kind: "tenant"; id: string; label: string; children: PlanNode[] }
  | { kind: "account"; id: string; label: string; children: PlanNode[] }
  | { kind: "agent"; key: string; leaf: AgentLeaf };

/** The workspace key the rest of the chat identifies a leaf by. */
export function leafKey(leaf: AgentLeaf): string {
  return `${leaf.tenantId}|${leaf.subsAccId}|${leaf.role}`;
}

// tenant -> account -> agent, one row per node, at a fixed depth.
export function planWorkspaceTree(
  groups: TenantGroup[],
  tenantNames: Record<string, string>,
): PlanNode[] {
  return groups.map((tenant) => ({
    kind: "tenant" as const,
    id: tenant.tenantId,
    // The display name arrives per tenant, after the tree is already on screen; until
    // it does the uuid stands in for it.
    label: tenantNames[tenant.tenantId] ?? tenant.tenantId,
    children: tenant.accounts.map((account) => ({
      kind: "account" as const,
      id: `${tenant.tenantId}|${account.subsAccId}`,
      label: account.accName || account.subsAccId,
      children: account.agents.map((leaf) => ({
        kind: "agent" as const,
        key: leafKey(leaf),
        leaf,
      })),
    })),
  }));
}

/** Every agent leaf in the plan, in render order. Used by tests and by keyboard nav. */
export function planLeaves(nodes: PlanNode[]): AgentLeaf[] {
  return nodes.flatMap((node) =>
    node.kind === "agent" ? [node.leaf] : planLeaves(node.children),
  );
}
