"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  listAgents,
  listScopes,
  resolveScopeNames,
  type AdminScope,
  type AgentRef,
  type ScopeRef,
} from "@/lib/admin";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import ColumnBrowser from "./column-browser";
import PanelHeader from "./panel-header";
import { buildColumns, type Column, type ColumnRow } from "./columns";
import { brandingOnly, openTenant, resolveScope } from "./admin-nav";
import { LEGACY_AGENT, resolveAgent, resolveAgentTab } from "./agent-scope";
import { parseTab, resolveRailItem, sectionNeedsDelivery, type Tab } from "./tabs";
import SharedFilesPanel from "./shared-files-panel";
import SharedSecretsPanel from "./shared-secrets-panel";
import SharedSkillsPanel from "./shared-skills-panel";
import PersonaPanel from "./persona-panel";
import ModelRegistryPanel from "./model-registry-panel";
import BulkConfigPanel from "./bulk-config-panel";
import MembersPanel from "./members-panel";
import BrandingPanel from "./branding-panel";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";
import { DEFAULT_POLICY, policyIsValid, type RestartPolicy } from "@/lib/restartPolicy";

// The administrative console. Server-side authz in the proxy is the real gate (NFR-1);
// this screen is convenience.
//
// It owns FETCHES, URL and the restart policy, and no navigation logic at all: it hands
// `columns.ts` what it knows and renders what comes back. That split is not stylistic.
// This screen has been rebuilt twice — once around a scope tree beside a tab strip, once
// around a rail whose body changed meaning — and both times the thing that went wrong was
// navigation state living where it could not be tested.
export default function AdminScreen() {
  const t = useT(adminCopy);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scopes, setScopes] = useState<AdminScope[] | null>(null);
  const [agents, setAgents] = useState<AgentRef[] | null>(null);
  const [canEditBranding, setCanEditBranding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartPolicy, setRestartPolicy] = useState<RestartPolicy>(DEFAULT_POLICY);
  // Where to return when the admin leaves Branding. Without it the trip back always lands
  // on nothing selected, losing their place.
  const lastSection = useRef<Tab | null>(null);

  const searchRef = useRef(searchParams);
  searchRef.current = searchParams;
  // Takes a BATCH, always. Selecting a row discards every selection after it (spec
  // FR-1.4), and sequential single-key writes would put each intermediate path through the
  // router — briefly rendering a column set nobody chose.
  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchRef.current.toString());
      for (const [key, next] of Object.entries(changes)) {
        if (next === null) params.delete(key);
        else params.set(key, next);
      }
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    // A FAILURE RESOLVES TO THE EMPTY LIST, and must: `null` means "not fetched yet" and
    // the screen holds a spinner on it, so swallowing the error without settling the state
    // would hang the whole screen on a call that never comes back.
    listAgents()
      .then((list) => !cancelled && setAgents(list))
      .catch(() => !cancelled && setAgents([]));
    fetch("/api/branding/can-edit")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setCanEditBranding(!!data?.canEdit))
      .catch(() => {});
    // Names resolve BEFORE the columns draw, so no column ever flashes raw uuids.
    //
    // NOTHING IS SELECTED HERE. This once ended with `setSelected(scopes[0])`, and that one
    // line is the whole of "admins registering people under the wrong tenant": the screen
    // picked, said nothing, and the only evidence was a highlight on a node of a tree.
    listScopes()
      .then(resolveScopeNames)
      .then((s) => !cancelled && setScopes(s))
      .catch((e: Error) => {
        if (cancelled) return;
        if (e.message.includes("session expired")) return router.push("/signin");
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // The URL is the single source of truth for the whole path, and is never mirrored into
  // state. Every value resolves against what the caller can actually use: the query string
  // is user-editable and outlives a revoked scope or a dropped agent.
  const rawTab = searchParams.get("tab");
  const tab = parseTab(rawTab);
  const agent = agents ? resolveAgent(searchParams.get("agent"), agents) : null;
  const legacy = agent === LEGACY_AGENT;
  const scope: ScopeRef | null = scopes ? resolveScope(searchParams.get("scope"), scopes) : null;
  const tenantId = scopes ? openTenant(scope, searchParams.get("tenant"), scopes) : null;

  const authority = { hasScopes: !!scopes && scopes.length > 0, canEditBranding };
  const root = resolveRailItem(tab, authority);

  // A SECTION IS ONLY SELECTED WHEN THE URL SAYS ONE IS. `parseTab` defaults to `files`,
  // which is right for "which section does this value name" and wrong for "has a section
  // been chosen" — reading the default as a choice would open a panel the admin never
  // asked for, on the very screen whose bug was choosing things for people.
  const section: Tab | null =
    root === "workspaces" && agent && scope && rawTab && rawTab !== "branding"
      ? resolveAgentTab(tab, agent, agents ?? [])
      : null;

  useEffect(() => {
    if (section) lastSection.current = section;
  }, [section]);

  const columns = buildColumns({ authority, agents: agents ?? [], scopes: scopes ?? [], root, agent, tenantId, scope, section });
  const panelOpen = root === "branding" || (!!scope && !!section);

  // Names for the panel header. An id reads worse than a name and far better than a header
  // that says "undefined".
  const selectedScope = scopes?.find(
    (sc) => sc.kind === scope?.kind && sc.tenantId === scope?.tenantId && sc.subsAccId === scope?.subsAccId,
  );
  const tenantLabel = selectedScope?.tenantName ?? scope?.tenantId ?? "";
  const scopeLabel =
    scope === null
      ? ""
      : scope.kind === "subscription"
        ? (selectedScope?.accName ?? scope.subsAccId ?? "")
        : tenantLabel;
  const scopeNames = {
    tenant: selectedScope?.tenantName ?? scope?.tenantId,
    subscription: scope?.kind === "subscription" ? (selectedScope?.accName ?? scope.subsAccId) : undefined,
  };

  // ONE handler for the whole browser, because the discard rule is one rule. Every branch
  // clears exactly what stops descending from the row that was clicked.
  const select = useCallback(
    (column: Column, row: ColumnRow) => {
      // RE-CLICKING THE SELECTED ROW CHANGES NOTHING. The discard rule exists because a
      // path cannot keep a tail that no longer descends from its head — and re-clicking
      // leaves the head identical, so the tail still descends. Writing the same value with
      // the deeper ones cleared would throw away everything to the right of a row the
      // admin only wanted to re-read, or happened to have under their thumb on a phone.
      // Finder does not collapse an open branch when you click it again either.
      if (row.selected) return;
      switch (column.key) {
        case "root":
          if (row.id === "root:branding") setParams({ tab: "branding" });
          else setParams({ tab: lastSection.current });
          return;
        case "agents":
          setParams({ agent: row.id.slice("agent:".length), tenant: null, scope: null });
          return;
        case "tenants":
          setParams({ tenant: row.id.slice("tenant:".length), scope: null });
          return;
        case "subscriptions":
          setParams({ scope: row.id.slice("scope:".length) });
          return;
        case "sections":
          setParams({ tab: row.id.slice("section:".length) });
      }
    },
    [setParams],
  );

  const blocked = !!section && sectionNeedsDelivery(section) && !policyIsValid(restartPolicy);

  const panel =
    root === "branding" ? (
      <div className="mx-auto w-full max-w-4xl px-4 py-4 pb-16">
        {/* Why there is only one thing here. A console offering a single item the caller
            did not ask for is indistinguishable from a broken one. */}
        {brandingOnly(authority) && (
          <Alert severity="info" className="mb-4">
            <b className="font-semibold">{t.shell.noScopesTitle}</b>
            <br />
            {t.shell.noScopesBody}
          </Alert>
        )}
        <p className="mb-4 max-w-[62ch] text-xs text-fg-muted">{t.shell.brandingNote}</p>
        <BrandingPanel />
      </div>
    ) : scope && section && agent ? (
      <>
        <PanelHeader
          section={section}
          agent={agent}
          legacy={legacy}
          scope={scope}
          tenantLabel={tenantLabel}
          scopeLabel={scopeLabel}
          policy={restartPolicy}
          onPolicyChange={setRestartPolicy}
        />
        {/* A MEASURE, not the whole screen. Stretched edge to edge, a form or a table reads
            as a wall and the eye loses the row it was on — and the panel is where the work
            happens, so that is the one place it matters most. */}
        <div className="mx-auto w-full max-w-5xl px-4 py-4 pb-16">
          {/* Only the sections that deliver are blocked by an incomplete schedule; gating
              on the control being present instead would lock Files and Members, which
              never needed a policy. */}
          {blocked ? null : section === "files" ? (
            /* `readOnly` is passed from THIS one place: deriving it inside each panel from
               `scope.agent === ALL_AGENTS` would put one condition in three files. */
            <SharedFilesPanel scope={{ ...scope, agent }} readOnly={legacy} />
          ) : section === "secrets" ? (
            <SharedSecretsPanel scope={{ ...scope, agent }} restartPolicy={restartPolicy} readOnly={legacy} />
          ) : section === "skills" ? (
            <SharedSkillsPanel scope={{ ...scope, agent }} restartPolicy={restartPolicy} readOnly={legacy} />
          ) : section === "persona" ? (
            <PersonaPanel scope={{ ...scope, agent }} restartPolicy={restartPolicy} />
          ) : section === "config" ? (
            // Takes the scope WITHOUT the agent folded in: the proxy resolves the agent
            // from `agent=`, not from the routing vehicle, and the panel needs `scope.kind`
            // intact to refuse a tenant selection itself.
            <BulkConfigPanel scope={scope} agent={agent} restartPolicy={restartPolicy} />
          ) : section === "members" ? (
            <MembersPanel
              scope={scope}
              agent={agent}
              tenantLabel={tenantLabel}
              scopeLabel={scopeLabel}
              onPickSubscription={() => setParams({ scope: null })}
            />
          ) : (
            <ModelRegistryPanel scope={scope} scopeNames={scopeNames} target={agent} restartPolicy={restartPolicy} />
          )}
        </div>
      </>
    ) : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* The console's own bar. It is not navigation — the columns are — so it carries only
          the way out and the things that belong to no column. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-brand/25 px-3 py-2">
        <Link
          href="/chat"
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={16} aria-hidden />
          {t.shell.backToChat}
        </Link>
        <h1 className="sr-only">{t.shell.heading}</h1>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Logo size={22} />
          <BrandName className="font-display text-sm font-semibold text-fg" />
        </div>
      </header>

      {error ? (
        <div className="p-4">
          <Alert severity="error">{error}</Alert>
        </div>
      ) : /* BOTH lists. `?agent=` resolves against one and `?scope=` against the other, so
           drawing before they land would show a column set to someone whose URL already
           answers it — and the scopes decide "no admin access". */
      scopes === null || agents === null ? (
        <div className="flex flex-1 justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : columns.length === 0 ? (
        <div className="p-4">
          <Alert severity="info">{t.shell.noAuthority}</Alert>
        </div>
      ) : (
        <ColumnBrowser columns={columns} onSelect={select}>
          {panel}
        </ColumnBrowser>
      )}
    </div>
  );
}
