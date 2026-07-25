"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cva } from "class-variance-authority";
import { ArrowLeft, Cpu, FileBox, KeyRound, Palette, ShieldCheck, Users, Wrench } from "lucide-react";
import {
  ALL_AGENTS,
  listAgents,
  listScopes,
  resolveScopeNames,
  type AdminScope,
  type ScopeRef,
} from "@/lib/admin";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ScopeTree } from "./scope-tree";
import { AgentTargetSelect } from "./agent-target-select";
import { AGENT_TABS, parseTab, type Tab } from "./tabs";
import SharedFilesPanel from "./shared-files-panel";
import SharedSecretsPanel from "./shared-secrets-panel";
import SharedSkillsPanel from "./shared-skills-panel";
import ModelRegistryPanel from "./model-registry-panel";
import MembersPanel from "./members-panel";
import BrandingPanel from "./branding-panel";


const tabButton = cva(
  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
  {
    variants: {
      active: {
        true: "border-accent text-fg",
        false: "border-transparent text-fg-muted hover:text-fg",
      },
    },
    defaultVariants: { active: false },
  },
);

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "files", label: "Shared files", icon: <FileBox size={16} aria-hidden /> },
  { key: "secrets", label: "Shared secrets", icon: <KeyRound size={16} aria-hidden /> },
  { key: "skills", label: "Shared skills", icon: <Wrench size={16} aria-hidden /> },
  { key: "model", label: "Model", icon: <Cpu size={16} aria-hidden /> },
  { key: "members", label: "Members", icon: <Users size={16} aria-hidden /> },
];

// Instance-wide branding (FR-10) is a separate tab, appended only when the
// caller can edit branding (GET /api/branding/can-edit). It renders full-width,
// outside the per-scope rail every other tab shares.
const BRANDING_TAB = {
  key: "branding" as const,
  label: "Branding",
  icon: <Palette size={16} aria-hidden />,
};

// The administrative screen (FR-9). Server-side authz in the proxy is the real
// gate (NFR-1); this screen is convenience. On load it fetches the caller's
// manageable scopes: empty -> "no admin access" (a direct visit stays graceful,
// never broken pickers). The nav entry link is likewise hidden when scopes are
// empty, so most users never see this route.
export default function AdminScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scopes, setScopes] = useState<AdminScope[] | null>(null);
  const [selected, setSelected] = useState<ScopeRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canEditBranding, setCanEditBranding] = useState(false);
  const [railWidth, setRailWidth] = useState(224);
  // The agent an admin action targets. Shared by every agent-scoped tab so the
  // choice survives switching between them; "all agents" is the default, which
  // reproduces the pre-per-agent behaviour exactly.
  const [agents, setAgents] = useState<string[]>([]);
  const [agentTarget, setAgentTarget] = useState<string>(ALL_AGENTS);

  // The URL is the single source of truth for the active tab — deliberately NOT
  // mirrored into state, which would let the two drift after one of the snapping
  // effects below. `replace` (not `push`) so Back leaves the admin screen instead
  // of walking every tab the user touched, and `scroll: false` so switching tabs
  // doesn't jump the page.
  const tab = parseTab(searchParams.get("tab"));
  // The current params reach the setter through a ref rather than the closure:
  // `useSearchParams` returns a NEW object on every navigation, so closing over it
  // would give `setTab` a fresh identity after each replace and re-fire every
  // effect that depends on it (the branding snap below). The ref keeps `setTab`
  // stable while still preserving any other query params already on the URL.
  const searchRef = useRef(searchParams);
  searchRef.current = searchParams;
  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchRef.current.toString());
      params.set("tab", next);
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  // Drag the rail's right edge to resize it (clamped); the scope tree truncates
  // within whatever width the rail has.
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = railWidth;
    const onMove = (ev: MouseEvent) => {
      setRailWidth(Math.max(180, Math.min(startWidth + (ev.clientX - startX), 480)));
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // Agent keys come from the proxy config, so a new agent needs no webapp change.
  // A failure leaves the list empty: the target picker then offers only "All
  // agents", which is the safe default, rather than blocking the whole screen.
  useEffect(() => {
    let cancelled = false;
    listAgents()
      .then((list) => {
        if (!cancelled) setAgents(list.map((a) => a.key));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding/can-edit")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setCanEditBranding(!!data?.canEdit);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Resolve tenant/subscription display names BEFORE rendering the tree so the
    // hierarchy never flashes raw uuids.
    listScopes()
      .then(resolveScopeNames)
      .then((s) => {
        if (cancelled) return;
        setScopes(s);
        const first = s[0];
        if (first) {
          setSelected({ kind: first.kind, tenantId: first.tenantId, subsAccId: first.subsAccId });
        }
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (e.message.includes("session expired")) {
          router.push("/signin");
          return;
        }
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // The Members tab addresses only subscriptions (a tenant scope has no member
  // list). When it becomes active, snap the shared selection to a subscription
  // if the current one isn't already one, so the rail selection and the panel
  // always agree.
  useEffect(() => {
    if (tab !== "members" || !scopes) return;
    const subs = scopes.filter((s) => s.kind === "subscription");
    const ok =
      selected?.kind === "subscription" &&
      subs.some((s) => s.tenantId === selected.tenantId && s.subsAccId === selected.subsAccId);
    if (!ok && subs[0]) {
      setSelected({ kind: "subscription", tenantId: subs[0].tenantId, subsAccId: subs[0].subsAccId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, scopes]);

  // A caller with branding access but no manageable scopes only sees Branding;
  // snap the active tab to it so the scope-rail tabs never render empty.
  useEffect(() => {
    if (scopes && scopes.length === 0 && canEditBranding && tab !== "branding") {
      setTab("branding");
    }
  }, [scopes, canEditBranding, tab, setTab]);

  const subscriptionScopes = (scopes ?? []).filter((s) => s.kind === "subscription");

  const visibleTabs = [
    ...(scopes && scopes.length > 0 ? TABS : []),
    ...(canEditBranding ? [BRANDING_TAB] : []),
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to chat
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Logo size={26} />
          <BrandName className="font-display text-sm font-semibold text-fg" />
        </div>
      </header>

      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck size={22} className="text-accent" aria-hidden />
        <h1 className="font-display text-xl font-semibold text-fg">Administration</h1>
      </div>

      {error ? (
        <Alert severity="error">{error}</Alert>
      ) : scopes === null ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : scopes.length === 0 && !canEditBranding ? (
        <Alert severity="info">
          You don&apos;t have administrative authority over any scope. Ask a tenant or subscription
          manager if you think this is a mistake.
        </Alert>
      ) : (
        <>
          <nav
            className="mb-5 flex gap-1 overflow-x-auto border-b border-brand/30"
            aria-label="Admin sections"
          >
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tabButton({ active: tab === t.key }) + " shrink-0"}
                onClick={() => setTab(t.key)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "branding" ? (
            <BrandingPanel />
          ) : tab === "members" && subscriptionScopes.length === 0 ? (
            <Alert severity="info">
              You don&apos;t manage any subscriptions directly, so there are no member workspaces to
              list here.
            </Alert>
          ) : (
            // Shared shell for every tab: a scope rail beside the panel. Stacks
            // vertically on mobile (rail full-width above the panel) so the two
            // columns never sit side-by-side and overflow the screen.
            <div className="flex flex-col gap-4 md:flex-row md:gap-6">
              <aside
                style={{ width: railWidth }}
                className="relative min-w-0 overflow-hidden border-brand/20 max-md:!w-full max-md:border-b max-md:pb-4 md:shrink-0 md:border-r md:pr-4"
              >
                <ScopeTree
                  scopes={tab === "members" ? subscriptionScopes : scopes}
                  value={selected}
                  onChange={setSelected}
                  label={tab === "members" ? "Subscriptions" : "Scopes"}
                />
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize scopes"
                  onMouseDown={startResize}
                  className="absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize hover:bg-accent/40 md:block"
                />
              </aside>
              <section className="min-w-0 flex-1">
                {selected ? (
                  AGENT_TABS.includes(tab) ? (
                    // Every agent-scoped tab shares ONE picker, rendered once
                    // above the panel, so the choice carries across tabs and the
                    // control looks and behaves identically in all of them. Only
                    // the hint copy differs (content stores vs the per-agent model
                    // registry). Members is not agent-scoped, so it has none.
                    <div className="flex flex-col gap-4">
                      <div className="max-w-sm">
                        <AgentTargetSelect
                          agents={agents}
                          value={agentTarget}
                          onChange={setAgentTarget}
                          purpose={tab === "model" ? "registry" : "content"}
                        />
                      </div>
                      {tab === "files" ? (
                        <SharedFilesPanel scope={{ ...selected, agent: agentTarget }} />
                      ) : tab === "secrets" ? (
                        <SharedSecretsPanel scope={{ ...selected, agent: agentTarget }} />
                      ) : tab === "skills" ? (
                        <SharedSkillsPanel scope={{ ...selected, agent: agentTarget }} />
                      ) : (
                        <ModelRegistryPanel scope={selected} agents={agents} target={agentTarget} />
                      )}
                    </div>
                  ) : (
                    <MembersPanel scope={selected} />
                  )
                ) : (
                  <p className="py-3 text-sm text-fg-muted">
                    Select a scope to manage its shared content.
                  </p>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
