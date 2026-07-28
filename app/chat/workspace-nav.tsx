"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cva, type VariantProps } from "class-variance-authority";
import { Building2, ChevronDown, ChevronRight, FolderClosed, Bot, Search } from "lucide-react";
import { createConversation } from "@/lib/chatSession";
import {
  groupWorkspaces,
  accessLabel,
  type Subscription,
  type TenantGroup,
  type AgentLeaf,
} from "@/lib/subscriptions";
import { listTools, isToolHealthy, type Tool } from "@/lib/tools";
import { useFragment, setWorkspace, type Workspace } from "./fragment";
import SidebarGroup from "./sidebar-group";
import { planWorkspaceTree, needsFilter, type PlanNode } from "./sidebar-tree";
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

// The "Workspaces" section body: fetches the caller's subscriptions, collapses
// permission-duplicated rows, and renders a tenant -> account -> agent tree.
// The agent leaf is the selectable workspace.
export default function WorkspaceNav({
  onSelect,
  open,
  onToggle,
}: {
  onSelect?: () => void;
  /** Group open/closed, owned by the unified sidebar so it can be persisted. */
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const router = useRouter();
  const fragment = useFragment();
  const [groups, setGroups] = useState<TenantGroup[] | null>(null);
  // An error *code*, not a sentence: resolving at render time means a locale
  // switch while the banner is up re-renders it.
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [tenantBrands, setTenantBrands] = useState<Record<string, TenantBrand>>({});
  const [tools, setTools] = useState<Map<string, Tool>>(new Map());
  const [filter, setFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/subscriptions");
        if (res.status === 401) {
          router.push("/signin");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(typeof data?.error === "string" ? data.error : "workspaces_load_failed");
          return;
        }
        const data = await res.json();
        const subs: Subscription[] = Array.isArray(data.subscriptions) ? data.subscriptions : [];
        setGroups(groupWorkspaces(subs));
      } catch {
        setError("connectivity");
      }
    })();
  }, [router]);

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

  async function onPick(leaf: AgentLeaf) {
    if (entering) return;
    setEntering(true);
    const workspace: Workspace = { t: leaf.tenantId, s: leaf.subsAccId, r: leaf.role };
    try {
      const conversation = await createConversation(workspace);
      setWorkspace(workspace, conversation.id);
      onSelect?.();
    } finally {
      setEntering(false);
    }
  }

  const q = filter.trim().toLowerCase();
  const visibleGroups = groups && q ? filterGroups(groups, tenantNames, q) : groups;

  // The tree's SHAPE comes from the plan, which hoists away any level holding a
  // single node (sidebar-tree.ts). The plan is built from the FILTERED groups, so
  // filtering down to one tenant hides that tenant's row too.
  const plan = planWorkspaceTree(visibleGroups ?? [], tenantNames);
  // Counted over the unfiltered tree: whether the filter exists must not depend on
  // what the filter currently matches, or typing could remove the field mid-word.
  const fullCount = planWorkspaceTree(groups ?? [], tenantNames).agentCount;
  const filterAvailable = needsFilter(fullCount);

  // Both hoisted labels ride here when there is a single tenant: its name AND its
  // sole subscription's. Suppressing a row saves vertical space; it is not licence to
  // drop what the row said, and which subscription a workspace belongs to is
  // load-bearing (billing, membership, who administers it).
  const identity = plan.soleTenant ? (
    <span className="flex min-w-0 shrink items-center gap-1.5">
      <TenantAvatar
        name={plan.soleTenant.label}
        logo={tenantBrands[plan.soleTenant.id]?.logo}
        color={tenantBrands[plan.soleTenant.id]?.color}
      />
      <ScopeLabel tenant={plan.soleTenant.label} account={plan.soleTenant.hoistedAccount} />
    </span>
  ) : undefined;

  return (
    <SidebarGroup
      title={t.shell.workspaces}
      open={open}
      onToggle={onToggle}
      identity={identity}
      actions={
        filterAvailable ? (
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
        ) : undefined
      }
    >
      {/* A field rather than a permanently open input: two open text boxes six rows
          apart in one narrow pane is what unifying is meant to remove. */}
      {filterAvailable && filterOpen && (
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
        ) : plan.nodes.length === 0 ? (
          <p className="px-2 py-3 text-sm text-fg-muted">{t.workspaceNav.noMatch}</p>
        ) : (
          <PlanNodes
            nodes={plan.nodes}
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
    </SidebarGroup>
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
              // A hoisted subscription's name shows on the tenant row that survived
              // it, for the same reason it shows on the group header when the tenant
              // was hoisted too.
              subLabel={node.kind === "tenant" ? node.hoistedAccount : undefined}
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
  subLabel,
  open,
  level,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  /** A hoisted child level's label, shown after this one. */
  subLabel?: string;
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
      {subLabel ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className={groupHeaderLabel({ level })} title={label}>
            {label}
          </span>
          <span className="shrink-0 text-fg-muted/60" aria-hidden>
            /
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={subLabel}>
            {subLabel}
          </span>
        </span>
      ) : (
        <span className={groupHeaderLabel({ level })} title={label}>
          {label}
        </span>
      )}
    </button>
  );
}

// The tenant plus, when its row was hoisted away too, its sole subscription. Rendered
// in the Workspaces group header, where the space is tightest — so the tenant stays
// small and monospaced (it is an id or an org name, context) and the subscription
// carries the weight, since that is the thing a member recognizes.
function ScopeLabel({ tenant, account }: { tenant: string; account?: string }) {
  if (!account) {
    return (
      <span className="max-w-32 truncate font-mono text-[11px] text-fg-muted" title={tenant}>
        {tenant}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-baseline gap-1" title={`${tenant} / ${account}`}>
      <span className="max-w-20 shrink-0 truncate font-mono text-[11px] text-fg-muted">
        {tenant}
      </span>
      <span className="shrink-0 text-[11px] text-fg-muted/60" aria-hidden>
        /
      </span>
      <span className="min-w-0 truncate text-[11px] font-medium text-fg">{account}</span>
    </span>
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
