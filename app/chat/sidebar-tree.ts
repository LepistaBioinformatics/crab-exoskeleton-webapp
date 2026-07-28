import type { AgentLeaf, TenantGroup } from "@/lib/subscriptions";

// The workspace tree's RENDER PLAN: which levels earn a row, and which are hoisted
// away for holding a single node.
//
// React-free so the rule is testable without mounting anything, which this suite
// (`environment: "node"`) requires — and because the rule is the part of the unified
// sidebar most likely to be got subtly wrong.
//
// It decides rendering only. Hoisting a level changes no workspace key, no fragment
// and no request: every agent leaf in the input appears in the output with its
// identity untouched.

export type PlanNode =
  | { kind: "tenant"; id: string; label: string; children: PlanNode[] }
  | { kind: "account"; id: string; label: string; children: PlanNode[] }
  | { kind: "agent"; key: string; leaf: AgentLeaf };

export interface TreePlan {
  nodes: PlanNode[];
  /**
   * The single tenant, when there is exactly one — so the Workspaces group header
   * can carry its avatar and name. Hiding the tenant row must not lose whose
   * workspaces these are.
   */
  soleTenant: { id: string; label: string } | null;
  /** Agent leaves, which is what the filter's 5-item threshold counts. */
  agentCount: number;
}

/** The workspace key the rest of the chat identifies a leaf by. */
export function leafKey(leaf: AgentLeaf): string {
  return `${leaf.tenantId}|${leaf.subsAccId}|${leaf.role}`;
}

// planWorkspaceTree applies one rule at every level: A LEVEL HOLDING EXACTLY ONE
// NODE CONTRIBUTES NO HEADER, and its children are hoisted into its parent.
//
// Applied per level and independently, so one tenant with three subscriptions hides
// only the tenant row, and two tenants with one subscription each hide only the
// subscription rows. The case in the original request — one tenant, one
// subscription, one workspace — is this rule firing three times rather than a
// special case beside it.
//
// A level with one member states nothing the reader did not already know and costs a
// row plus an indent on every descendant.
export function planWorkspaceTree(
  groups: TenantGroup[],
  tenantNames: Record<string, string>,
): TreePlan {
  const agentCount = groups.reduce(
    (total, tenant) =>
      total + tenant.accounts.reduce((sub, account) => sub + account.agents.length, 0),
    0,
  );

  const tenantLabel = (tenantId: string) => tenantNames[tenantId] ?? tenantId;

  const accountNodes = (tenant: TenantGroup): PlanNode[] => {
    const agentsOf = (agents: AgentLeaf[]): PlanNode[] =>
      agents.map((leaf) => ({ kind: "agent", key: leafKey(leaf), leaf }) as PlanNode);

    // One subscription under this tenant: its row would group a single child.
    if (tenant.accounts.length === 1) {
      return agentsOf(tenant.accounts[0].agents);
    }
    return tenant.accounts.map((account) => ({
      kind: "account",
      id: `${tenant.tenantId}|${account.subsAccId}`,
      label: account.accName || account.subsAccId,
      children: agentsOf(account.agents),
    }));
  };

  // One tenant: its row goes, and its identity moves to the group header (FR-3.3).
  if (groups.length === 1) {
    const only = groups[0];
    return {
      nodes: accountNodes(only),
      soleTenant: { id: only.tenantId, label: tenantLabel(only.tenantId) },
      agentCount,
    };
  }

  return {
    nodes: groups.map((tenant) => ({
      kind: "tenant",
      id: tenant.tenantId,
      label: tenantLabel(tenant.tenantId),
      children: accountNodes(tenant),
    })),
    soleTenant: null,
    agentCount,
  };
}

// The workspace filter earns its place only above this many agent leaves. Below it,
// scanning the list is faster than reaching for a text field — and the field would be
// the second one in a narrow pane.
export const FILTER_THRESHOLD = 5;

export function needsFilter(agentCount: number): boolean {
  return agentCount > FILTER_THRESHOLD;
}

/** Every agent leaf in the plan, in render order. Used by tests and by keyboard nav. */
export function planLeaves(nodes: PlanNode[]): AgentLeaf[] {
  return nodes.flatMap((node) =>
    node.kind === "agent" ? [node.leaf] : planLeaves(node.children),
  );
}
