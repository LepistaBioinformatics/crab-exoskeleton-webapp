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
  picoclawAgentKeys,
  resolveScopeNames,
  type AdminScope,
  type AgentRef,
  type ScopeRef,
} from "@/lib/admin";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ScopeTree } from "./scope-tree";
import { AgentTargetSelect } from "./agent-target-select";
import { AGENT_TABS, DEFAULT_TAB, parseTab, type Tab } from "./tabs";
import SharedFilesPanel from "./shared-files-panel";
import SharedSecretsPanel from "./shared-secrets-panel";
import SharedSkillsPanel from "./shared-skills-panel";
import ModelRegistryPanel from "./model-registry-panel";
import MembersPanel from "./members-panel";
import BrandingPanel from "./branding-panel";


// Level 2: the sections OF a scope. Subordinate to the mode switch above, and
// nested beside the scope rail, so they read as "sections of what is selected on
// the left" rather than as a peer of the mode.
const tabButton = cva(
  "flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[13px] font-medium transition-colors",
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

// Level 1: which world you are in. A segmented control rather than more tabs,
// because the two are not siblings — one of them CONTAINS a whole navigation, and
// a flat row of six made a scope-wide section look like a peer of an instance-wide
// one. Everything except Branding acts on a selected tenant or subscription.
const modeButton = cva("rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", {
  variants: {
    active: {
      true: "bg-surface text-fg shadow-elevated",
      false: "text-fg-muted hover:text-fg",
    },
  },
  defaultVariants: { active: false },
});

// Labels drop the "Shared" prefix: everything in this row is shared across the
// selected scope by definition, so the word was on every item and distinguished
// none of them.
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "files", label: "Files", icon: <FileBox size={15} aria-hidden /> },
  { key: "secrets", label: "Secrets", icon: <KeyRound size={15} aria-hidden /> },
  { key: "skills", label: "Skills", icon: <Wrench size={15} aria-hidden /> },
  { key: "model", label: "Models", icon: <Cpu size={15} aria-hidden /> },
  { key: "members", label: "Members", icon: <Users size={15} aria-hidden /> },
];

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
  const [agents, setAgents] = useState<AgentRef[]>([]);
  const [agentTarget, setAgentTarget] = useState<string>(ALL_AGENTS);
  // Which section to return to when the admin switches back out of Branding.
  // Without it the mode switch always dumps you on Files, losing your place.
  const lastScopedTab = useRef<Tab>(DEFAULT_TAB);

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
        if (!cancelled) setAgents(list);
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

  useEffect(() => {
    if (tab !== "branding") lastScopedTab.current = tab;
  }, [tab]);

  const subscriptionScopes = (scopes ?? []).filter((s) => s.kind === "subscription");

  // The Model tab offers only the agents the inventory governs. Hermes agents read
  // their model from the proxy's config.yaml, so pinning one writes a record nothing
  // reads — the proxy rejects it, and the picker should not offer it in the first
  // place. If the shared choice is a hermes agent, this tab falls back to "all",
  // which resolves to the first picoclaw agent.
  const agentKeys = agents.map((a) => a.key);
  const modelAgentKeys = picoclawAgentKeys(agents);
  const modelTab = tab === "model";
  const tabAgents = modelTab ? modelAgentKeys : agentKeys;
  const tabTarget =
    agentTarget !== ALL_AGENTS && !tabAgents.includes(agentTarget) ? ALL_AGENTS : agentTarget;

  // The selected scope in the admin's own words. Falls back to the id when names
  // have not resolved — an id is worse to read than a name, but far better than a
  // strip that says "a write here reaches undefined".
  const selectedScope = scopes?.find(
    (sc) =>
      sc.kind === selected?.kind &&
      sc.tenantId === selected?.tenantId &&
      sc.subsAccId === selected?.subsAccId,
  );
  const scopeLabel =
    selected === null
      ? ""
      : selected.kind === "subscription"
        ? (selectedScope?.accName ?? selected.subsAccId ?? "this subscription")
        : (selectedScope?.tenantName ?? selected.tenantId);

  const hasScopes = !!scopes && scopes.length > 0;
  const scopedTabs = hasScopes ? TABS : [];
  // The mode is derived from the tab rather than kept beside it: two sources for
  // one piece of state is how they drift, and `?tab=` already survives a reload,
  // a shared link and Back.
  // `?tab=` is user-editable, so a hand-typed `?tab=branding` must not render the
  // branding panel to someone without branding access. The proxy is the real gate
  // (NFR-1), but a screen that shows a panel the caller cannot use is a worse
  // answer than one that shows the sections they can.
  const mode: "scoped" | "branding" = tab === "branding" && canEditBranding ? "branding" : "scoped";

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
          {/* Level 1 — which world. Only rendered when both exist; with one of
              them there is nothing to switch between. */}
          {hasScopes && canEditBranding && (
            <div
              className="mb-5 inline-flex gap-1 rounded-lg border border-brand/25 bg-elevated p-1"
              role="tablist"
              aria-label="Admin area"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "scoped"}
                className={modeButton({ active: mode === "scoped" })}
                onClick={() => setTab(lastScopedTab.current)}
              >
                Scoped actions
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "branding"}
                className={modeButton({ active: mode === "branding" })}
                onClick={() => setTab("branding")}
              >
                <span className="flex items-center gap-1.5">
                  <Palette size={14} aria-hidden />
                  Branding
                </span>
              </button>
            </div>
          )}

          {mode === "branding" ? (
            <>
              <p className="mb-4 max-w-[62ch] text-xs text-fg-muted">
                Instance-wide. Branding applies to everyone on this deployment, so it has no
                scope to select.
              </p>
              <BrandingPanel />
            </>
          ) : (
            // The scope rail and the sections OF that scope, side by side. The
            // sections sit INSIDE the scope column so containment says what they
            // act on — which is why no section needs to restate the scope in its
            // own header any more. Stacks on mobile, rail above.
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

              <section className="flex min-w-0 flex-1 flex-col gap-4">
                {/* Level 2 — sections of the selected scope. */}
                <nav
                  className="flex gap-1 overflow-x-auto border-b border-brand/30"
                  aria-label="Sections of this scope"
                >
                  {scopedTabs.map((t) => (
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

                {tab === "members" && subscriptionScopes.length === 0 ? (
                  <Alert severity="info">
                    You don&apos;t manage any subscriptions directly, so there are no member
                    workspaces to list here.
                  </Alert>
                ) : selected ? (
                  AGENT_TABS.includes(tab) ? (
                    <div className="flex flex-col gap-4">
                      {/* The agent picker and what the combination reaches. The
                          scope itself is no longer restated here — the rail on the
                          left holds it, and these sections are drawn inside it. */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-brand/25 bg-elevated px-3.5 py-3">
                        <div className="min-w-0 max-w-xs flex-1">
                          <AgentTargetSelect
                            agents={tabAgents}
                            value={tabTarget}
                            onChange={setAgentTarget}
                            purpose={modelTab ? "registry" : "content"}
                          />
                        </div>
                        <p className="min-w-[16rem] flex-1 border-l border-brand/30 pl-3.5 text-xs text-fg-muted">
                          Reaches <b className="font-semibold text-fg">{scopeLabel}</b>
                          {selected.kind === "tenant" ? " and every subscription under it" : ""}
                          {tabTarget === ALL_AGENTS ? (
                            <>, through <b className="font-semibold text-fg">every agent</b>.</>
                          ) : (
                            <>, through <span className="font-mono text-[0.92em] text-fg">{tabTarget}</span> only.</>
                          )}
                        </p>
                      </div>
                      {tab === "files" ? (
                        <SharedFilesPanel scope={{ ...selected, agent: tabTarget }} />
                      ) : tab === "secrets" ? (
                        <SharedSecretsPanel scope={{ ...selected, agent: tabTarget }} />
                      ) : tab === "skills" ? (
                        <SharedSkillsPanel scope={{ ...selected, agent: tabTarget }} />
                      ) : (
                        <ModelRegistryPanel scope={selected} agents={modelAgentKeys} target={tabTarget} />
                      )}
                    </div>
                  ) : (
                    <MembersPanel scope={selected} />
                  )
                ) : (
                  <p className="py-3 text-sm text-fg-muted">
                    Select a scope on the left to manage it.
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
