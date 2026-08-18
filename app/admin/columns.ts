import { scopeKey, type AdminScope, type AgentRef, type ScopeRef } from "@/lib/admin";
import { LEGACY_AGENT, agentTabs } from "./agent-scope";
import { encodeScope, tenantsOf, type Authority, type RailItem } from "./admin-nav";
import type { Tab } from "./tabs";

// THE WHOLE NAVIGATION, as data.
//
// Column n lists the children of the row selected in column n−1. That is the macOS Finder
// column view, and it is here because the admin target genuinely IS a path — agent, then
// tenant, then subscription, then section — and two previous attempts to show that path as
// something other than a path both failed. The first drew it as a scope tree beside a tab
// strip; the second as a rail whose body changed meaning plus a tree inside a gate. Both
// needed a separate component to narrate what was selected, which is the tell: a
// navigation that showed the path would not have needed a caption under it.
//
// PURE, and tested with a truth table. This screen has now been rebuilt twice around
// navigation state that lived inside a component. It does not live in a component again.

export type ColumnKey = "root" | "agents" | "tenants" | "subscriptions" | "sections";

// Copy keys for rows whose name is prose. Rows that name something the SYSTEM owns — an
// agent key, a tenant or account name — carry `text` instead and are never translated.
export type RowTextKey = "branding" | "agents" | "legacy" | "tenantWide" | Tab;

export type RowIcon =
  | "branding"
  | "agents"
  | "agent"
  | "legacy"
  | "tenant"
  | "tenantWide"
  | "subscription"
  | Tab;

export type EmptyReason = "noAgents" | "noTenants" | "noSubscriptions";

export interface ColumnRow {
  /** Click payload and React key. Namespaced per column so ids can never collide. */
  id: string;
  /** Text the system owns. Exactly one of `text` / `textKey` is set. */
  text?: string;
  textKey?: RowTextKey;
  hintKey?: "tenantWide" | "legacy";
  /**
   * Opens the next column. ONE BIT, ONE MEANING — it drives the chevron and
   * `aria-expanded` together. An earlier draft had subscription rows be "leaves with
   * respect to scope, branches in the strip"; that is two axes with one glyph to render
   * them, which is the fault this whole feature exists to remove.
   */
  branch: boolean;
  selected: boolean;
  /** `legacy` draws subordinate: the store must never read as one more agent to choose. */
  tone: "normal" | "legacy";
  icon: RowIcon;
}

export interface Column {
  key: ColumnKey;
  rows: ColumnRow[];
  /**
   * Why this column has nothing of its own kind. NOT "rows is empty" — the agents column
   * still carries the legacy entry when the proxy reports no agents, and a blank strip
   * would be a worse answer than a stated one.
   */
  empty?: EmptyReason;
}

export interface ColumnsInput {
  authority: Authority;
  agents: AgentRef[];
  scopes: AdminScope[];
  /** Which root row is active, resolved from `?tab=` by `resolveRailItem`. */
  root: RailItem;
  agent: string | null;
  tenantId: string | null;
  scope: ScopeRef | null;
  section: Tab | null;
}

export function buildColumns(input: ColumnsInput): Column[] {
  const { authority, agents, scopes, root, agent, tenantId, scope, section } = input;
  const columns: Column[] = [];

  // ROOT. Branding first, and it is a LEAF: it applies to the whole instance, so there is
  // no scope to choose and no column to open — its panel opens immediately.
  const rootRows: ColumnRow[] = [];
  if (authority.canEditBranding) {
    rootRows.push({
      id: "root:branding",
      textKey: "branding",
      branch: false,
      selected: root === "branding",
      tone: "normal",
      icon: "branding",
    });
  }
  if (authority.hasScopes) {
    rootRows.push({
      id: "root:agents",
      textKey: "agents",
      branch: true,
      selected: root === "workspaces",
      tone: "normal",
      icon: "agents",
    });
  }
  if (rootRows.length === 0) return [];
  columns.push({ key: "root", rows: rootRows });

  if (root !== "workspaces" || !authority.hasScopes) return columns;

  // AGENTS. The legacy all-agents store rides along in its own tone — it is an address,
  // not an agent, and it is shown whether or not it holds anything, because emptiness
  // cannot be known before a scope is chosen.
  const agentRows: ColumnRow[] = agents.map((a) => ({
    id: `agent:${a.key}`,
    text: a.key,
    branch: true,
    selected: agent === a.key,
    tone: "normal" as const,
    icon: "agent" as const,
  }));
  agentRows.push({
    id: `agent:${LEGACY_AGENT}`,
    textKey: "legacy",
    hintKey: "legacy",
    branch: true,
    selected: agent === LEGACY_AGENT,
    tone: "legacy",
    icon: "legacy",
  });
  columns.push({
    key: "agents",
    rows: agentRows,
    empty: agents.length === 0 ? "noAgents" : undefined,
  });

  if (!agent) return columns;

  // TENANTS.
  const tenants = tenantsOf(scopes);
  columns.push({
    key: "tenants",
    rows: tenants.map((t) => ({
      id: `tenant:${t.id}`,
      text: t.name,
      branch: true,
      selected: tenantId === t.id,
      tone: "normal" as const,
      icon: "tenant" as const,
    })),
    empty: tenants.length === 0 ? "noTenants" : undefined,
  });

  if (!tenantId) return columns;

  // SUBSCRIPTIONS, with the tenant-wide target leading the list.
  //
  // That row belongs here rather than in the tenants column: choosing "the tenant itself"
  // is a choice AMONG this tenant's targets, which is exactly what this column lists. It
  // is offered only when the caller holds the tenant's own scope — a subscriptions manager
  // reaches the tenant as a grouping, not as something they may write to.
  const scopeRows: ColumnRow[] = [];
  const tenantScope = scopes.find((s) => s.kind === "tenant" && s.tenantId === tenantId);
  if (tenantScope) {
    scopeRows.push({
      id: `scope:${encodeScope({ kind: "tenant", tenantId })}`,
      textKey: "tenantWide",
      hintKey: "tenantWide",
      branch: true,
      selected: scope?.kind === "tenant" && scope.tenantId === tenantId,
      tone: "normal",
      icon: "tenantWide",
    });
  }
  const subs = scopes.filter((s) => s.kind === "subscription" && s.tenantId === tenantId);
  for (const sub of subs) {
    const ref: ScopeRef = {
      kind: "subscription",
      tenantId: sub.tenantId,
      subsAccId: sub.subsAccId,
    };
    scopeRows.push({
      id: `scope:${encodeScope(ref)}`,
      text: sub.accName ?? sub.subsAccId ?? sub.tenantId,
      branch: true,
      selected: !!scope && scopeKey(scope) === scopeKey(ref),
      tone: "normal",
      icon: "subscription",
    });
  }
  columns.push({
    key: "subscriptions",
    rows: scopeRows,
    empty: subs.length === 0 ? "noSubscriptions" : undefined,
  });

  if (!scope) return columns;

  // SECTIONS. Which ones exist is the agent's own vocabulary, unchanged: the model
  // registry governs picoclaw agents, and the legacy store gets neither the picoclaw
  // sections nor a roster.
  columns.push({
    key: "sections",
    rows: agentTabs(agent, agents).map((tab) => ({
      id: `section:${tab}`,
      textKey: tab,
      branch: false,
      selected: section === tab,
      tone: "normal" as const,
      icon: tab,
    })),
  });

  return columns;
}

// --- what gets DRAWN as a column, and what becomes a crumb ------------------------------

export interface Split {
  /** Answered levels, in path order. Each becomes a breadcrumb segment. */
  crumbs: { column: Column; selected: ColumnRow }[];
  /** The one column whose question is still unanswered, or null when the path is complete. */
  open: Column | null;
}

// Drawing every level as a column costs ~1000px of navigation for a screen whose work
// happens in the panel — and four of those five columns show a question already answered.
//
// So an answered level collapses into a breadcrumb segment. Two things are still drawn as a
// column: whichever level is still being asked, and the SECTIONS level always — see the
// branch below for why those are different cases.
//
// At most one of them exists at a time. `buildColumns` produces column n only once n−1 is
// answered, so only the last can lack a selection; and when the sections column exists,
// every level above it is answered by construction. The split is total either way.
export function splitColumns(columns: Column[]): Split {
  const crumbs: Split["crumbs"] = [];
  let open: Column | null = null;
  for (const column of columns) {
    // THE SECTIONS COLUMN IS NEVER A CRUMB. Everything above it — agent, tenant,
    // subscription — is a decision you make once and then work under, so it costs nothing
    // to fold into a line of text. The section is the one you change repeatedly while
    // working, and a list you switch between all day belongs on screen as a list, not
    // behind a click.
    if (column.key === "sections") {
      open = column;
      continue;
    }
    const selected = column.rows.find((r) => r.selected);
    if (selected) crumbs.push({ column, selected });
    else open = column;
  }
  return { crumbs, open };
}

// Whether the drawn column is still ASKING something, as opposed to showing a choice
// already made. The breadcrumb's trailing hint keys off this: a sections column with a
// section selected is not an open question, so the bar must not end with one.
export function isAsking(open: Column | null): boolean {
  return !!open && !open.rows.some((r) => r.selected);
}
