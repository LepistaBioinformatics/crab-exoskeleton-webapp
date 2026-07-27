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
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import RestartPolicySelect from "./restart-policy-select";
import RestartNoticeBlock from "./restart-notice";
import { Accordion } from "./accordion";
import { DEFAULT_POLICY, policyIsValid, type RestartPolicy } from "@/lib/restartPolicy";


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
      // A filled accent, not a raised card. `shadow-elevated` was a soft
      // elevation shadow, and nothing else on this screen uses one — the only
      // other shadow in the system is the hard offset `signature` on Button and
      // Surface, which is a different idiom — so it read as a stray rather than
      // as "selected". The fill also differs in KIND from the level-2 tabs'
      // underline, which is what keeps the two rows of navigation from looking
      // like one.
      true: "bg-accent text-accent-fg",
      false: "text-fg-muted hover:text-fg",
    },
  },
  defaultVariants: { active: false },
});

// Labels drop the "Shared" prefix: everything in this row is shared across the
// selected scope by definition, so the word was on every item and distinguished
// none of them.
const TABS: { key: Exclude<Tab, "branding">; icon: React.ReactNode }[] = [
  { key: "files", icon: <FileBox size={15} aria-hidden /> },
  { key: "secrets", icon: <KeyRound size={15} aria-hidden /> },
  { key: "skills", icon: <Wrench size={15} aria-hidden /> },
  { key: "model", icon: <Cpu size={15} aria-hidden /> },
  { key: "members", icon: <Users size={15} aria-hidden /> },
];

// The administrative screen (FR-9). Server-side authz in the proxy is the real
// gate (NFR-1); this screen is convenience. On load it fetches the caller's
// manageable scopes: empty -> "no admin access" (a direct visit stays graceful,
// never broken pickers). The nav entry link is likewise hidden when scopes are
// empty, so most users never see this route.
export default function AdminScreen() {
  const t = useT(adminCopy);
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
  // place.
  //
  // That tab also refuses "All agents". The agent level of the model cascade is
  // stored per agent (`agent/<agent>` in the registry), so an "all agents"
  // selection had to be collapsed to one agent before the request could be made —
  // and the panel then showed and wrote THAT agent's default while the header
  // claimed the write reached every agent. Naming the agent is the honest version,
  // and it costs nothing: the inventory is shared, so which agent routes the
  // request only matters for the levels that really are per agent.
  const agentKeys = agents.map((a) => a.key);
  const modelAgentKeys = picoclawAgentKeys(agents);
  const modelTab = tab === "model";
  // One choice covers a run of edits in this sitting (restart-control FR-8.2).
  // Held here rather than in each panel so switching tabs does not silently
  // reset it back to "restart now" mid-task.
  const [restartPolicy, setRestartPolicy] = useState<RestartPolicy>(DEFAULT_POLICY);
  const [restartOpen, setRestartOpen] = useState(false);
  const tabAgents = modelTab ? modelAgentKeys : agentKeys;
  const tabTarget = modelTab
    ? (tabAgents.includes(agentTarget) ? agentTarget : (tabAgents[0] ?? ""))
    : agentTarget !== ALL_AGENTS && !tabAgents.includes(agentTarget)
      ? ALL_AGENTS
      : agentTarget;

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

  // The names the model panel puts on the cascade levels it writes. Falls back to
  // the id for the same reason scopeLabel does: an id reads worse than a name and
  // far better than a rung that says "Tenant — undefined".
  const scopeNames = {
    tenant: selectedScope?.tenantName ?? selected?.tenantId,
    subscription:
      selected?.kind === "subscription" ? (selectedScope?.accName ?? selected.subsAccId) : undefined,
  };

  // The policy in force, for the collapsed section's header. The scheduled time
  // is shown as the admin typed it ("2026-07-27 18:00") rather than through
  // toLocaleString, which renders differently on the server and the client and
  // would trip hydration.
  const restartSummary =
    restartPolicy.mode === "now"
      ? t.restartPolicy.summaryNow
      : restartPolicy.mode === "notice"
        ? t.restartPolicy.summaryNotice
        : restartPolicy.at
          ? t.restartPolicy.summarySchedule.replace("{at}", restartPolicy.at.replace("T", " "))
          : t.restartPolicy.summaryScheduleUnset;

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
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={16} aria-hidden />
          {t.shell.backToChat}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Logo size={26} />
          <BrandName className="font-display text-sm font-semibold text-fg" />
        </div>
      </header>

      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck size={22} className="text-accent" aria-hidden />
        <h1 className="font-display text-xl font-semibold text-fg">{t.shell.heading}</h1>
        {/* /admin is its own route with its own header -- it never renders the
            chat nav sidebar, so it needs its own switcher. */}
        <LanguageSwitcher className="ml-auto" />
      </div>

      {error ? (
        <Alert severity="error">{error}</Alert>
      ) : scopes === null ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : scopes.length === 0 && !canEditBranding ? (
        <Alert severity="info">{t.shell.noAuthority}</Alert>
      ) : (
        <>
          {/* Level 1 — which world. Only rendered when both exist; with one of
              them there is nothing to switch between. */}
          {hasScopes && canEditBranding && (
            <div
              className="mb-5 inline-flex gap-1 rounded-lg border border-brand/25 bg-elevated p-1"
              role="tablist"
              aria-label={t.shell.areaAria}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "scoped"}
                className={modeButton({ active: mode === "scoped" })}
                onClick={() => setTab(lastScopedTab.current)}
              >
                {t.shell.scopedActions}
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
                  {t.shell.branding}
                </span>
              </button>
            </div>
          )}

          {mode === "branding" ? (
            <>
              <p className="mb-4 max-w-[62ch] text-xs text-fg-muted">{t.shell.brandingNote}</p>
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
                  label={tab === "members" ? t.shell.subscriptions : t.shell.scopes}
                />
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t.shell.resizeScopes}
                  onMouseDown={startResize}
                  className="absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize hover:bg-accent/40 md:block"
                />
              </aside>

              <section className="flex min-w-0 flex-1 flex-col gap-4">
                {/* Level 2 — sections of the selected scope. */}
                <nav
                  className="flex gap-1 overflow-x-auto border-b border-brand/30"
                  aria-label={t.shell.sectionsAria}
                >
                  {scopedTabs.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      className={tabButton({ active: tab === entry.key }) + " shrink-0"}
                      onClick={() => setTab(entry.key)}
                    >
                      {entry.icon}
                      {t.shell.tabs[entry.key]}
                    </button>
                  ))}
                </nav>

                {tab === "members" && subscriptionScopes.length === 0 ? (
                  <Alert severity="info">
                    {t.shell.noSubscriptionsManaged}
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
                            allowAll={!modelTab}
                          />
                        </div>
                        {/* What the combination actually reaches. The Models tab
                            gets its own sentence: its inventory is proxy-wide, so
                            saying a write there "reaches this tenant" would promise
                            a containment the inventory does not have — the scope
                            governs only the defaults and pins under it. */}
                        <p className="min-w-[16rem] flex-1 border-l border-brand/30 pl-3.5 text-xs text-fg-muted">
                          {modelTab ? (
                            <>
                              {t.shell.inventoryProxyWideBefore}
                              <b className="font-semibold text-fg">{t.shell.inventoryProxyWide}</b>
                              {t.shell.inventoryProxyWideAfter}
                              <b className="font-semibold text-fg">{scopeLabel}</b>
                              {t.shell.inventoryAnd}
                              <span className="font-mono text-[0.92em] text-fg">{tabTarget}</span>
                              {t.shell.period}
                            </>
                          ) : (
                            <>
                              {t.shell.reaches} <b className="font-semibold text-fg">{scopeLabel}</b>
                              {selected.kind === "tenant" ? t.shell.andEverySubscription : ""}
                              {tabTarget === ALL_AGENTS ? (
                                <>
                                  {t.shell.throughBefore}
                                  <b className="font-semibold text-fg">{t.shell.everyAgent}</b>
                                  {t.shell.period}
                                </>
                              ) : (
                                <>
                                  {t.shell.throughBefore}
                                  <span className="font-mono text-[0.92em] text-fg">{tabTarget}</span>
                                  {t.shell.throughAfter}
                                </>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      {/* Shared files reach containers through a live read-only
                          mount, so they need no bounce; secrets, skills and
                          model changes do.

                          Collapsed, because delivery is not what an admin came to
                          this tab to do — it modifies the saves they are about to
                          make, and its default reproduces the behaviour these
                          endpoints had before the policy existed. What it must
                          never do is hide a NON-default choice, so the closed
                          header states the policy in force, and a policy other
                          than "immediately" draws the section as primary. */}
                      {(tab === "secrets" || tab === "skills" || tab === "model") && (
                        <div className="mb-3 flex flex-col gap-2">
                          <Accordion
                            // Open when the admin opened it, and forced open while
                            // the policy cannot be honoured — you cannot fix a
                            // blocking error inside a section you cannot see.
                            //
                            // Recomputed on every render rather than latched, so a
                            // schedule that goes stale on its own (the chosen time
                            // simply passes) also forces it open. This replaced a
                            // `key` that remounted the section on the same
                            // condition: remounting re-applied the initial state in
                            // BOTH directions, so stepping from "at a time I pick"
                            // back to "immediately" slammed the section shut.
                            open={restartOpen || !policyIsValid(restartPolicy)}
                            onOpenChange={setRestartOpen}
                            title={t.restartPolicy.advancedTitle}
                            summary={restartSummary}
                            tone={restartPolicy.mode === "now" ? "quiet" : "primary"}
                          >
                            <RestartPolicySelect policy={restartPolicy} onChange={setRestartPolicy} />
                            {/* The scope is the one in the rail plus the agent in
                                the picker — the same target every other action on
                                this tab addresses. The all-agents sentinel is
                                resolved to "no agent" HERE, where the picker's
                                vocabulary is owned: lib/adminRestart strips it
                                from the wire too, but the confirmation copy reads
                                the field directly and would otherwise offer to
                                restart "through all only". */}
                            <RestartNoticeBlock
                              target={{
                                tenantId: selected.tenantId,
                                subsAccId: selected.subsAccId,
                                agent: tabTarget === ALL_AGENTS ? undefined : tabTarget,
                              }}
                              policy={restartPolicy}
                              scopeLabel={scopeLabel}
                            />
                          </Accordion>
                          {/* An incomplete schedule cannot be honoured: the
                              proxy rejects it before writing, so the admin would
                              get a 400 on a change they thought they made. Block
                              here, the one place that owns the policy, rather
                              than repeating the check in every panel. */}
                          {!policyIsValid(restartPolicy) && (
                            <Alert severity="error">{t.restartPolicy.blocked}</Alert>
                          )}
                        </div>
                      )}
                      {!policyIsValid(restartPolicy) ? null : tab === "files" ? (
                        <SharedFilesPanel scope={{ ...selected, agent: tabTarget }} />
                      ) : tab === "secrets" ? (
                        <SharedSecretsPanel
                          scope={{ ...selected, agent: tabTarget }}
                          restartPolicy={restartPolicy}
                        />
                      ) : tab === "skills" ? (
                        <SharedSkillsPanel
                          scope={{ ...selected, agent: tabTarget }}
                          restartPolicy={restartPolicy}
                        />
                      ) : (
                        <ModelRegistryPanel
                          scope={selected}
                          scopeNames={scopeNames}
                          target={tabTarget}
                          restartPolicy={restartPolicy}
                        />
                      )}
                    </div>
                  ) : (
                    <MembersPanel scope={selected} />
                  )
                ) : (
                  <p className="py-3 text-sm text-fg-muted">
                    {t.shell.selectScope}
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
