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
  | {
      kind: "tenant";
      id: string;
      label: string;
      /**
       * The sole subscription's name, when its own row was hoisted away. Carried here
       * so the tenant row can show both — hoisting a level must not DISCARD what it
       * said, only stop spending a row on it.
       */
      hoistedAccount?: string;
      children: PlanNode[];
    }
  | { kind: "account"; id: string; label: string; children: PlanNode[] }
  | { kind: "agent"; key: string; leaf: AgentLeaf };

export interface TreePlan {
  nodes: PlanNode[];
  /**
   * The single tenant, when there is exactly one — so the Workspaces group header
   * can carry its avatar and name. Hiding the tenant row must not lose whose
   * workspaces these are.
   */
  soleTenant: { id: string; label: string; hoistedAccount?: string } | null;
  /** Agent leaves, which is what the filter's 5-item threshold counts. */
  agentCount: number;
}

/** The workspace key the rest of the chat identifies a leaf by. */
export function leafKey(leaf: AgentLeaf): string {
  return `${leaf.tenantId}|${leaf.subsAccId}|${leaf.role}`;
}

// planWorkspaceTree applies one rule at every level: A LEVEL HOLDING EXACTLY ONE
// NODE CONTRIBUTES NO ROW, its children are hoisted into its parent, AND ITS LABEL IS
// CARRIED ONTO THE SURVIVING HEADER.
//
// That last clause is the part the first version missed. It dropped a hoisted
// subscription's name entirely, so a member with one subscription saw agent names with
// nothing saying which subscription they belonged to. Suppressing a row is a decision
// about spending vertical space; it is not licence to discard what the row said.
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

  const accountLabel = (account: TenantGroup["accounts"][number]) =>
    account.accName || account.subsAccId;

  // Returns the children a tenant contributes, plus the label of the subscription
  // whose row was hoisted away (if any) so the caller can show it on the surviving
  // header.
  const accountNodes = (
    tenant: TenantGroup,
  ): { children: PlanNode[]; hoistedAccount?: string } => {
    const agentsOf = (agents: AgentLeaf[]): PlanNode[] =>
      agents.map((leaf) => ({ kind: "agent", key: leafKey(leaf), leaf }) as PlanNode);

    // One subscription under this tenant: its row would group a single child, so the
    // row goes — but its NAME moves up. Which subscription a workspace belongs to is
    // load-bearing information (billing, membership, who administers it); the first
    // version dropped it on the floor and left the agent name standing alone.
    if (tenant.accounts.length === 1) {
      return {
        children: agentsOf(tenant.accounts[0].agents),
        hoistedAccount: accountLabel(tenant.accounts[0]),
      };
    }
    return {
      children: tenant.accounts.map((account) => ({
        kind: "account",
        id: `${tenant.tenantId}|${account.subsAccId}`,
        label: accountLabel(account),
        children: agentsOf(account.agents),
      })),
    };
  };

  // One tenant: its row goes, and its identity — plus a hoisted subscription's name —
  // moves to the group header.
  if (groups.length === 1) {
    const only = groups[0];
    const { children, hoistedAccount } = accountNodes(only);
    return {
      nodes: children,
      soleTenant: { id: only.tenantId, label: tenantLabel(only.tenantId), hoistedAccount },
      agentCount,
    };
  }

  return {
    nodes: groups.map((tenant) => {
      const { children, hoistedAccount } = accountNodes(tenant);
      return {
        kind: "tenant" as const,
        id: tenant.tenantId,
        label: tenantLabel(tenant.tenantId),
        hoistedAccount,
        children,
      };
    }),
    soleTenant: null,
    agentCount,
  };
}

/** Every agent leaf in the plan, in render order. Used by tests and by keyboard nav. */
export function planLeaves(nodes: PlanNode[]): AgentLeaf[] {
  return nodes.flatMap((node) =>
    node.kind === "agent" ? [node.leaf] : planLeaves(node.children),
  );
}
