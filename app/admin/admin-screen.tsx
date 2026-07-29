"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cva } from "class-variance-authority";
import {
  ArrowLeft,
  Archive,
  Bot,
  ChevronLeft,
  Cpu,
  FileBox,
  KeyRound,
  Palette,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import {
  listAgents,
  listScopes,
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
import { AgentGate } from "./agent-gate";
import { LEGACY_AGENT, agentTabs, resolveAgent, resolveAgentTab } from "./agent-scope";
import { DEFAULT_TAB, availableModes, parseTab, resolveMode, type Tab } from "./tabs";
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
// because these are not siblings of the sections — one of them CONTAINS a whole
// navigation, and a flat row made a scoped section look like a peer of an
// instance-wide one.
//
// There are three now. Members left the section row: a member list belongs to a
// subscription whatever agents that subscription runs, so under an agent it would
// have been filtering by a selection it does not depend on — the very relation this
// screen was confusing people about.
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
const TAB_ICONS: Record<string, React.ReactNode> = {
  files: <FileBox size={15} aria-hidden />,
  secrets: <KeyRound size={15} aria-hidden />,
  skills: <Wrench size={15} aria-hidden />,
  model: <Cpu size={15} aria-hidden />,
};

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
  // The agents this deployment runs, from the proxy config.
  //
  // `null` is "not fetched yet", which is NOT the same as "fetched and empty" — the
  // distinction is load-bearing here. `?agent=` resolves against this list, so
  // treating the pre-fetch state as an empty list would resolve a perfectly valid
  // agent to nothing and flash the gate before snapping to the working view. Empty
  // AFTER the fetch is a real answer, and the gate reports it.
  const [agents, setAgents] = useState<AgentRef[] | null>(null);
  // Which section to return to when the admin switches back out of another mode.
  // Without it the mode switch always dumps you on Files, losing your place.
  const lastSectionTab = useRef<Tab>(DEFAULT_TAB);

  // The URL is the single source of truth for the active tab AND the selected
  // agent — deliberately NOT mirrored into state, which would let the two drift.
  // `replace` (not `push`) so Back leaves the admin screen instead of walking every
  // tab the user touched, and `scroll: false` so switching tabs doesn't jump the page.
  const tab = parseTab(searchParams.get("tab"));
  // The current params reach the setter through a ref rather than the closure:
  // `useSearchParams` returns a NEW object on every navigation, so closing over it
  // would give `setTab` a fresh identity after each replace and re-fire every
  // effect that depends on it (the branding snap below). The ref keeps `setTab`
  // stable while still preserving any other query params already on the URL.
  const searchRef = useRef(searchParams);
  searchRef.current = searchParams;
  const setParam = useCallback(
    (key: string, next: string | null) => {
      const params = new URLSearchParams(searchRef.current.toString());
      if (next === null) params.delete(key);
      else params.set(key, next);
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router],
  );
  const setTab = useCallback((next: Tab) => setParam("tab", next), [setParam]);

  // `?agent=` is user-editable and survives a deployment that drops an agent, so an
  // unknown key resolves to NO selection — the gate — rather than to a working view
  // whose header names an agent that is not there. Same rule as parseTab.
  const agent = agents ? resolveAgent(searchParams.get("agent"), agents) : null;
  const legacy = agent === LEGACY_AGENT;

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
  //
  // A FAILURE RESOLVES TO THE EMPTY LIST, and must: `null` means "not fetched yet"
  // and the screen holds a spinner on it, so swallowing the error without settling
  // the state would hang the whole screen on a call that never comes back. Empty is
  // the honest answer — the gate says the proxy reported no agents, and the legacy
  // entry still reaches whatever was stored.
  useEffect(() => {
    let cancelled = false;
    listAgents()
      .then((list) => {
        if (!cancelled) setAgents(list);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
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

  // The Members SNAP is gone with the Members tab. It existed because a section row
  // shared one scope selection and Members could only address a subscription; as its
  // own mode it renders a subscriptions-only rail, so there is nothing to snap.

  // A caller with branding access but no manageable scopes only sees Branding;
  // snap the active tab to it so the scope-rail tabs never render empty.
  useEffect(() => {
    if (scopes && scopes.length === 0 && canEditBranding && tab !== "branding") {
      setTab("branding");
    }
  }, [scopes, canEditBranding, tab, setTab]);

  useEffect(() => {
    if (tab !== "branding" && tab !== "members") lastSectionTab.current = tab;
  }, [tab]);

  const subscriptionScopes = (scopes ?? []).filter((s) => s.kind === "subscription");

  // One choice covers a run of edits in this sitting (restart-control FR-8.2).
  // Held here rather than in each panel so switching tabs does not silently
  // reset it back to "restart now" mid-task.
  const [restartPolicy, setRestartPolicy] = useState<RestartPolicy>(DEFAULT_POLICY);
  const [restartOpen, setRestartOpen] = useState(false);

  // The sections THIS agent offers, and which of them is showing. `?tab=model` with a
  // hermes agent selected names a section that agent has not got; it resolves to the
  // agent's first section, the way parseTab resolves garbage.
  const sections = agent ? agentTabs(agent, agents ?? []) : [];
  const sectionTab = agent ? resolveAgentTab(tab, agent, agents ?? []) : DEFAULT_TAB;
  const modelTab = sectionTab === "model";

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

  // The subscription the Members mode is showing. DERIVED, not snapped: the old
  // Members tab shared one selection with the sections and wrote a corrected one
  // back through an effect, which is a state write nobody asked for. This just falls
  // back when the current selection is a tenant — the rail's `value` then shows what
  // is actually on screen, so the two cannot disagree.
  const membersScope: ScopeRef | null =
    selected?.kind === "subscription" &&
    subscriptionScopes.some(
      (s) => s.tenantId === selected.tenantId && s.subsAccId === selected.subsAccId,
    )
      ? selected
      : subscriptionScopes[0]
        ? {
            kind: "subscription",
            tenantId: subscriptionScopes[0].tenantId,
            subsAccId: subscriptionScopes[0].subsAccId,
          }
        : null;

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

  // Which world, and which worlds this caller has. Both derived in tabs.ts rather
  // than inline: a three-way state with two fallback conditions is where a screen
  // like this goes quietly wrong, and there it has a truth table over it.
  const authority = {
    hasScopes: !!scopes && scopes.length > 0,
    hasSubscriptions: subscriptionScopes.length > 0,
    canEditBranding,
  };
  const modes = availableModes(authority);
  const mode = resolveMode(tab, authority);

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
      ) : /* Both lists, not just the scopes. The agent gate is decided by `?agent=`
             resolved against the agent list, so drawing before it lands would show
             the gate to someone whose URL already names an agent. And the scopes
             decide "no admin access" — rendering an agent picker to a caller who
             administers nothing trades a short spinner for a dead end. */
      scopes === null || agents === null ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : scopes.length === 0 && !canEditBranding ? (
        <Alert severity="info">{t.shell.noAuthority}</Alert>
      ) : (
        <>
          {/* Level 1 — which world. A mode appears only when the caller can use
              it: with one of the three there is nothing to switch between. */}
          {modes.length > 1 && (
            <div
              className="mb-5 inline-flex gap-1 rounded-lg border border-brand/25 bg-elevated p-1"
              role="tablist"
              aria-label={t.shell.areaAria}
            >
              {modes.includes("agents") && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "agents"}
                  className={modeButton({ active: mode === "agents" })}
                  onClick={() => setTab(lastSectionTab.current)}
                >
                  <span className="flex items-center gap-1.5">
                    <Bot size={14} aria-hidden />
                    {t.shell.agents}
                  </span>
                </button>
              )}
              {modes.includes("members") && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "members"}
                  className={modeButton({ active: mode === "members" })}
                  onClick={() => setTab("members")}
                >
                  <span className="flex items-center gap-1.5">
                    <Users size={14} aria-hidden />
                    {t.shell.members}
                  </span>
                </button>
              )}
              {modes.includes("branding") && (
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
              )}
            </div>
          )}

          {mode === "branding" ? (
            <>
              <p className="mb-4 max-w-[62ch] text-xs text-fg-muted">{t.shell.brandingNote}</p>
              <BrandingPanel />
            </>
          ) : mode === "members" ? (
            // Members has NO agent and no section row. A member list belongs to a
            // subscription whatever agents that subscription runs, so putting it under
            // an agent would mean filtering by a selection it does not depend on —
            // exactly the relation this screen was confusing people about.
            <div className="flex flex-col gap-4 md:flex-row md:gap-6">
              <aside
                style={{ width: railWidth }}
                className="relative min-w-0 overflow-hidden border-brand/20 max-md:!w-full max-md:border-b max-md:pb-4 md:shrink-0 md:border-r md:pr-4"
              >
                <ScopeTree
                  scopes={subscriptionScopes}
                  value={membersScope}
                  onChange={setSelected}
                  label={t.shell.subscriptions}
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
                {membersScope ? (
                  <MembersPanel scope={membersScope} />
                ) : (
                  <Alert severity="info">{t.shell.noSubscriptionsManaged}</Alert>
                )}
              </section>
            </div>
          ) : !agent ? (
            // THE GATE. Nothing else is on screen until an agent is chosen — no scope
            // rail, no sections, no panels.
            <AgentGate agents={agents} onSelect={(next) => setParam("agent", next)} />
          ) : (
            <div className="flex flex-col gap-5">
              {/* The agent this whole view is inside, and the way back out. It
                  replaced a picker that sat INSIDE each section, which is what made
                  the agent look like a setting of the scope rather than the thing
                  the scope is being chosen for. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-brand/25 bg-elevated px-3.5 py-3">
                <button
                  type="button"
                  onClick={() => setParam("agent", null)}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                >
                  <ChevronLeft size={14} aria-hidden />
                  {t.shell.backToAgents}
                </button>
                <span className="flex min-w-0 items-center gap-1.5 border-l border-brand/30 pl-3.5">
                  {legacy ? (
                    <Archive size={15} className="shrink-0 text-fg-muted" aria-hidden />
                  ) : (
                    <Bot size={15} className="shrink-0 text-fg-muted" aria-hidden />
                  )}
                  <span className="truncate text-sm font-medium text-fg">
                    {legacy ? t.legacyStore.entryLabel : agent}
                  </span>
                </span>
                {/* What the combination actually reaches. The Models section gets its
                    own sentence: its inventory is proxy-wide, so saying a write there
                    "reaches this tenant" would promise a containment the inventory
                    does not have — the scope governs only the defaults and pins under
                    it. The all-agents branch this sentence used to carry is gone with
                    the all-agents action. */}
                {/* Guarded on `selected`: scopeLabel is "" until a scope resolves, and
                    an unguarded sentence reads "Reaches , through alpha only." The
                    back control above is NOT guarded — leaving the agent must work
                    whether or not a scope has landed. */}
                <p className="min-w-[16rem] flex-1 border-l border-brand/30 pl-3.5 text-xs text-fg-muted">
                  {legacy ? (
                    t.legacyStore.readOnlyNote
                  ) : !selected ? (
                    t.shell.selectScope
                  ) : modelTab ? (
                    <>
                      {t.shell.inventoryProxyWideBefore}
                      <b className="font-semibold text-fg">{t.shell.inventoryProxyWide}</b>
                      {t.shell.inventoryProxyWideAfter}
                      <b className="font-semibold text-fg">{scopeLabel}</b>
                      {t.shell.inventoryAnd}
                      <span className="font-mono text-[0.92em] text-fg">{agent}</span>
                      {t.shell.period}
                    </>
                  ) : (
                    <>
                      {t.shell.reaches} <b className="font-semibold text-fg">{scopeLabel}</b>
                      {selected?.kind === "tenant" ? t.shell.andEverySubscription : ""}
                      {t.shell.throughBefore}
                      <span className="font-mono text-[0.92em] text-fg">{agent}</span>
                      {t.shell.throughAfter}
                    </>
                  )}
                </p>
              </div>

              {/* The scope rail and the sections, side by side, both INSIDE the agent
                  chosen above. Stacks on mobile, rail above. */}
              <div className="flex flex-col gap-4 md:flex-row md:gap-6">
                <aside
                  style={{ width: railWidth }}
                  className="relative min-w-0 overflow-hidden border-brand/20 max-md:!w-full max-md:border-b max-md:pb-4 md:shrink-0 md:border-r md:pr-4"
                >
                  <ScopeTree
                    scopes={scopes}
                    value={selected}
                    onChange={setSelected}
                    label={t.shell.scopes}
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
                  {/* Level 2 — sections of THIS agent. Which ones exist depends on the
                      agent: the model registry governs picoclaw agents, and the legacy
                      store never held a model record at all (agent-scope.ts). */}
                  <nav
                    className="flex gap-1 overflow-x-auto border-b border-brand/30"
                    aria-label={t.shell.sectionsAria}
                  >
                    {sections.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={tabButton({ active: sectionTab === key }) + " shrink-0"}
                        onClick={() => setTab(key)}
                      >
                        {TAB_ICONS[key]}
                        {t.shell.tabs[key as keyof typeof t.shell.tabs]}
                      </button>
                    ))}
                  </nav>

                  {selected ? (
                    <div className="flex flex-col gap-4">
                      {/* Shared files reach containers through a live read-only
                          mount, so they need no bounce; secrets, skills and
                          model changes do.

                          Collapsed, because delivery is not what an admin came to
                          this section to do — it modifies the saves they are about to
                          make, and its default reproduces the behaviour these
                          endpoints had before the policy existed. What it must
                          never do is hide a NON-default choice, so the closed
                          header states the policy in force, and a policy other
                          than "immediately" draws the section as primary.

                          It is here under the legacy store too: deleting from it
                          bounces the same containers a write would have. */}
                      {sectionTab !== "files" && (
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
                            {/* The scope in the rail plus the agent chosen at the
                                gate — the same target every action here addresses.
                                The legacy store belongs to no agent, so it sends
                                none: lib/adminRestart strips the sentinel from the
                                wire too, but the confirmation copy reads this field
                                directly and would otherwise offer to restart
                                "through all only". */}
                            <RestartNoticeBlock
                              target={{
                                tenantId: selected.tenantId,
                                subsAccId: selected.subsAccId,
                                agent: legacy ? undefined : agent,
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
                      {/* `readOnly` is passed from THIS one place. Deriving it inside
                          each panel from `scope.agent === ALL_AGENTS` would put the
                          same condition in three files and let them disagree. */}
                      {!policyIsValid(restartPolicy) ? null : sectionTab === "files" ? (
                        <SharedFilesPanel
                          scope={{ ...selected, agent }}
                          readOnly={legacy}
                        />
                      ) : sectionTab === "secrets" ? (
                        <SharedSecretsPanel
                          scope={{ ...selected, agent }}
                          restartPolicy={restartPolicy}
                          readOnly={legacy}
                        />
                      ) : sectionTab === "skills" ? (
                        <SharedSkillsPanel
                          scope={{ ...selected, agent }}
                          restartPolicy={restartPolicy}
                          readOnly={legacy}
                        />
                      ) : (
                        <ModelRegistryPanel
                          scope={selected}
                          scopeNames={scopeNames}
                          target={agent}
                          restartPolicy={restartPolicy}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="py-3 text-sm text-fg-muted">{t.shell.selectScope}</p>
                  )}
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
