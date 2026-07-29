"use client";

import { useEffect, useRef, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Building2, ChevronDown, ChevronRight, FolderClosed, Bot, Search } from "lucide-react";
import { createConversation } from "@/lib/chatSession";
import { accessLabel, type TenantGroup, type AgentLeaf } from "@/lib/subscriptions";
import { listTools, isToolHealthy, type Tool } from "@/lib/tools";
import { useFragment, setWorkspace, type Workspace } from "./fragment";
import SidebarPanel from "./sidebar-panel";
import { planWorkspaceTree, planLeaves, type PlanNode } from "./sidebar-tree";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { TenantAvatar } from "@/components/ui/avatar";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

type TenantBrand = { logo?: string; color?: string };

// Selectable agent leaf: active = M3 tonal selected fill (no border). Depth
// indentation comes from the hierarchy guide wrappers, not padding here.
const leafButton = cva(
  "flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 pl-2 text-left text-sm transition-colors disabled:opacity-60",
  {
    variants: {
      active: {
        true: "bg-accent/12 font-medium text-fg",
        false: "text-fg hover:bg-elevated/60",
      },
      // Enrichment from /tools: an agent whose tool reports unhealthy is dimmed
      // (not disabled) -- health detection is best-effort, so a mis-read stays
      // recoverable by leaving the leaf clickable.
      unhealthy: {
        true: "opacity-50",
        false: "",
      },
    },
    defaultVariants: { active: false, unhealthy: false },
  },
);

// Collapsible tenant/account headers: only the label treatment varies by level
// (depth is drawn by the guide-line wrappers around the children).
const groupHeader = cva(
  "flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 pl-2 text-left transition-colors hover:bg-elevated/60",
  {
    variants: { level: { tenant: "", account: "" } },
    defaultVariants: { level: "tenant" },
  },
);

const groupHeaderLabel = cva("min-w-0 flex-1 truncate", {
  variants: {
    level: {
      tenant: "font-mono text-xs text-fg-muted",
      account: "text-sm font-medium text-fg",
    },
  },
  defaultVariants: { level: "tenant" },
});

type GroupLevel = NonNullable<VariantProps<typeof groupHeader>["level"]>;

// The workspaces PANEL: renders the caller's workspaces as a tenant -> subscription ->
// agent tree, every level with its own row. The agent leaf is the selectable
// workspace. The list itself is fetched by the sidebar, which needs it for both panels.
export default function WorkspaceNav({
  groups,
  error,
  onSelect,
  autoSelect,
}: {
  /**
   * The caller's workspaces, fetched by the sidebar. Null while loading. It is owned
   * up there because BOTH panels need it: the conversations panel names the
   * subscription its chats belong to, which only this tree knows.
   */
  groups: TenantGroup[] | null;
  /** An error CODE from the load, resolved to a sentence at render time. */
  error: string | null;
  onSelect?: () => void;
  /**
   * Whether a lone workspace may be entered without being clicked. False while the
   * member is browsing (they pressed back): with one workspace they would land on a
   * one-leaf tree and be thrown straight forward again.
   */
  autoSelect: boolean;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const fragment = useFragment();
  const [entering, setEntering] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [tenantBrands, setTenantBrands] = useState<Record<string, TenantBrand>>({});
  const [tools, setTools] = useState<Map<string, Tool>>(new Map());
  const [filter, setFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Enrich the agent list from the gateway's public /tools catalog, joined by
  // tool.name === role. Best-effort: listTools never throws (yields [] on any
  // failure), so the tree renders exactly as before when /tools is empty or
  // unreachable -- it only ever adds a tooltip + health hint, never filters.
  useEffect(() => {
    let cancelled = false;
    listTools().then((list) => {
      if (cancelled) return;
      setTools(new Map(list.map((t) => [t.name, t])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve tenant display names lazily, per tenant, once the tree is grouped.
  // The tree renders immediately with uuids; names replace them as each fetch
  // lands -- never blocking the sidebar.
  useEffect(() => {
    if (!groups) return;
    let cancelled = false;
    for (const tenant of groups) {
      fetch(`/api/tenants/${encodeURIComponent(tenant.tenantId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const name = tenantDisplayName(data.tenant);
          if (name) setTenantNames((prev) => ({ ...prev, [tenant.tenantId]: name }));
          const brand = tenantBrand(data.tenant);
          if (brand) setTenantBrands((prev) => ({ ...prev, [tenant.tenantId]: brand }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const activeKey =
    fragment?.t && fragment?.s && fragment?.r
      ? `${fragment.t}|${fragment.s}|${fragment.r}`
      : null;

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // `auto` marks the entry as one nobody asked for (the lone-workspace shortcut). It
  // suppresses onSelect, which means "the member chose this" — the signal the sidebar
  // uses to move keyboard focus. Moving focus for a selection the member did not make
  // is how a page steals the caret out from under someone on first paint.
  async function onPick(leaf: AgentLeaf, auto = false) {
    if (entering) return;
    setEntering(true);
    const workspace: Workspace = { t: leaf.tenantId, s: leaf.subsAccId, r: leaf.role };
    try {
      const conversation = await createConversation(workspace);
      setWorkspace(workspace, conversation.id);
      if (!auto) onSelect?.();
    } finally {
      setEntering(false);
    }
  }

  const q = filter.trim().toLowerCase();
  const visibleGroups = groups && q ? filterGroups(groups, tenantNames, q) : groups;

  // Every level earns a row (sidebar-tree.ts). The plan is built from the FILTERED
  // groups, so a tenant with no surviving leaf drops out entirely — but a tenant that
  // does survive still renders its own row, whether it is the only one or one of ten.
  const nodes = planWorkspaceTree(visibleGroups ?? [], tenantNames);

  // A member with exactly one workspace is answering a question with one possible
  // answer. Enter it for them and land on its conversations, which is where they were
  // going anyway.
  //
  // A REF, not state: it must not cause a render, and it has to survive the `groups`
  // update that follows the fetch. And a one-shot effect, not a derived invariant —
  // "if there is one workspace then select it" evaluated every render is how you get
  // a member who cannot stay on the tree.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || !autoSelect) return;
    // `null` is "the hash has not been read yet", which is NOT "no workspace": acting
    // on it would fire a pick over a fragment that already names one.
    if (fragment === null || activeKey) return;
    if (!groups) return;
    const leaves = planLeaves(nodes);
    if (leaves.length !== 1) return;
    autoSelected.current = true;
    onPick(leaves[0], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect, fragment, activeKey, groups]);

  return (
    <SidebarPanel
      // No tenant identity beside the title any more. It existed to carry the name of
      // a tenant row that hoisting had suppressed; the tenant now always has its own
      // row, avatar included, so repeating it here would be the same thing twice.
      header={
        <span className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t.shell.workspaces}
          </span>
        </span>
      }
      actions={
        // Offered at ANY number of workspaces. It used to appear only above five
        // leaves, on the reasoning that a short list is faster to scan than a text
        // field is to reach for — but a control that materialises once a count is
        // crossed is a moving target, and searching is how members expect to find a
        // workspace whatever the count.
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t.workspaceNav.filterPlaceholder}
          aria-expanded={filterOpen}
          onClick={() => {
            // Closing the field clears it: a hidden filter still narrowing the
            // tree is the worst of both, since the reason rows are missing is
            // off screen.
            if (filterOpen) setFilter("");
            setFilterOpen((v) => !v);
          }}
        >
          <Search size={16} aria-hidden />
        </IconButton>
      }
    >
      {filterOpen && (
        <div className="px-2 pb-1 pt-1">
          <Input
            variant="subtle"
            inputSize="sm"
            autoFocus
            placeholder={t.workspaceNav.filterPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      <div className="px-2 pb-2">
        {error ? (
          <Alert severity="error">{errorText(err, error)}</Alert>
        ) : groups === null ? (
          <div className="flex justify-center py-4">
            <Spinner size={20} />
          </div>
        ) : groups.length === 0 ? (
          <p className="px-2 py-3 text-sm text-fg-muted">{t.workspaceNav.none}</p>
        ) : nodes.length === 0 ? (
          <p className="px-2 py-3 text-sm text-fg-muted">{t.workspaceNav.noMatch}</p>
        ) : (
          <PlanNodes
            nodes={nodes}
            q={q}
            collapsed={collapsed}
            toggle={toggle}
            activeKey={activeKey}
            entering={entering}
            onPick={onPick}
            tools={tools}
            tenantBrands={tenantBrands}
          />
        )}
      </div>
    </SidebarPanel>
  );
}

// Renders a level of the plan. Recursive rather than three nested loops, because
// hoisting means a tenant's children can be accounts OR agents, and an agent can sit
// at any depth.
function PlanNodes({
  nodes,
  q,
  collapsed,
  toggle,
  activeKey,
  entering,
  onPick,
  tools,
  tenantBrands,
}: {
  nodes: PlanNode[];
  q: string;
  collapsed: Set<string>;
  toggle: (key: string) => void;
  activeKey: string | null;
  entering: boolean;
  onPick: (leaf: AgentLeaf) => void;
  tools: Map<string, Tool>;
  tenantBrands: Record<string, TenantBrand>;
}) {
  return (
    <div className="flex flex-col gap-1">
      {nodes.map((node) => {
        if (node.kind === "agent") {
          const active = node.key === activeKey;
          const badge = accessLabel(node.leaf.perms);
          const tool = tools.get(node.leaf.role);
          const unhealthy = tool ? !isToolHealthy(tool) : false;
          return (
            <button
              key={node.key}
              type="button"
              disabled={entering}
              onClick={() => onPick(node.leaf)}
              title={tool?.description || undefined}
              className={leafButton({ active, unhealthy })}
            >
              <Bot size={15} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate capitalize">{node.leaf.role}</span>
              {badge && <Badge tone="accent">{badge}</Badge>}
            </button>
          );
        }
        // A filter forces every surviving level open: the rows are there because
        // they matched, so hiding them behind a closed header would be perverse.
        const open = q ? true : !collapsed.has(node.id);
        const brand = node.kind === "tenant" ? tenantBrands[node.id] : undefined;
        return (
          <div key={node.id}>
            <GroupHeader
              icon={
                node.kind === "tenant" ? (
                  brand || node.label ? (
                    <TenantAvatar name={node.label} logo={brand?.logo} color={brand?.color} />
                  ) : (
                    <Building2 size={15} aria-hidden />
                  )
                ) : (
                  <FolderClosed size={15} aria-hidden />
                )
              }
              label={node.label}
              open={open}
              level={node.kind === "tenant" ? "tenant" : "account"}
              onClick={() => toggle(node.id)}
            />
            {open && (
              <div className="ml-[15px] mt-0.5 border-l border-brand/25 pl-2">
                <PlanNodes
                  nodes={node.children}
                  q={q}
                  collapsed={collapsed}
                  toggle={toggle}
                  activeKey={activeKey}
                  entering={entering}
                  onPick={onPick}
                  tools={tools}
                  tenantBrands={tenantBrands}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GroupHeader({
  icon,
  label,
  open,
  level,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  level: GroupLevel;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={groupHeader({ level })}>
      {open ? (
        <ChevronDown size={14} className="shrink-0 text-fg-muted" aria-hidden />
      ) : (
        <ChevronRight size={14} className="shrink-0 text-fg-muted" aria-hidden />
      )}
      <span className="shrink-0 text-fg-muted">{icon}</span>
      <span className={groupHeaderLabel({ level })} title={label}>
        {label}
      </span>
    </button>
  );
}

// Client-side narrowing of the already-loaded discovery tree (no refetch): a
// leaf survives if the query substring-matches its tenant display name, its
// account label, or its role -- the fields the card shows. Tenants/accounts
// with no surviving leaf drop out.
function filterGroups(
  groups: TenantGroup[],
  tenantNames: Record<string, string>,
  q: string,
): TenantGroup[] {
  return groups
    .map((tenant) => {
      const tenantLabel = (tenantNames[tenant.tenantId] ?? tenant.tenantId).toLowerCase();
      const tenantMatch = tenantLabel.includes(q);
      const accounts = tenant.accounts
        .map((account) => {
          const accMatch = (account.accName || account.subsAccId).toLowerCase().includes(q);
          const agents =
            tenantMatch || accMatch
              ? account.agents
              : account.agents.filter((leaf) => leaf.role.toLowerCase().includes(q));
          return { ...account, agents };
        })
        .filter((account) => account.agents.length > 0);
      return { ...tenant, accounts };
    })
    .filter((tenant) => tenant.accounts.length > 0);
}

// mycelium's public tenant object: { id, name, description, owners, ... }.
// Use `name`; fall back to null (keep the uuid) if it's missing/blank.
function tenantDisplayName(tenant: unknown): string | null {
  if (tenant && typeof tenant === "object") {
    const name = (tenant as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
}

// The tenant brand is stored in mycelium as a tag with value "brand"; its meta
// carries the base64 logo (a data URL) and optional brand colors. Returns the
// logo + primaryColor for the sidebar avatar, or null when there's no brand tag.
function tenantBrand(tenant: unknown): TenantBrand | null {
  if (!tenant || typeof tenant !== "object") return null;
  const tags = (tenant as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return null;
  const brand = tags.find(
    (tag) => tag && typeof tag === "object" && (tag as { value?: unknown }).value === "brand",
  ) as { meta?: Record<string, string> | null } | undefined;
  const meta = brand?.meta;
  if (!meta) return null;
  return { logo: meta.base64Logo, color: meta.primaryColor };
}
