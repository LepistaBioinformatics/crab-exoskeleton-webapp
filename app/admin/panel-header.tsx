"use client";

import type { ScopeRef } from "@/lib/admin";
import type { Tab } from "./tabs";
import { sectionNeedsDelivery } from "./tabs";
import RestartChrome from "./restart-chrome";
import type { RestartPolicy } from "@/lib/restartPolicy";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// The panel's own header: what you are looking at, and how what you change here is
// delivered. It does not scroll with the panel's content.
//
// It is also the SINGLE OWNER of `scopeLabel` and the restart target. Those used to be
// computed by the context bar, which this replaces; naming one owner is what keeps the
// header and the restart confirmation from coming to disagree about what a bounce hits.
export default function PanelHeader({
  section,
  agent,
  legacy,
  scope,
  tenantLabel,
  scopeLabel,
  policy,
  onPolicyChange,
}: {
  section: Tab;
  agent: string;
  legacy: boolean;
  scope: ScopeRef;
  tenantLabel: string;
  scopeLabel: string;
  policy: RestartPolicy;
  onPolicyChange: (next: RestartPolicy) => void;
}) {
  const t = useT(adminCopy);
  const agentLabel = legacy ? t.legacyStore.entryLabel : agent;
  const path =
    scope.kind === "subscription"
      ? `${agentLabel} · ${tenantLabel} › ${scopeLabel}`
      : `${agentLabel} · ${scopeLabel}`;

  return (
    // The rule spans the panel; its contents share the panel's measure, so the header and
    // the section below it line up on a wide screen.
    <div className="border-b border-brand/25 px-4 py-3">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
        <h2 className="font-display text-sm font-semibold text-fg">
          {t.shell.tabs[section as keyof typeof t.shell.tabs]}
        </h2>

        {/* THE PATH, below `md` only. Above it the columns are on screen and spell the same
            thing — the previous design's context bar existed precisely because the
            navigation did not show the path, and repeating it here would put that mistake
            back. Below `md` one pane shows at a time, and this is the only thing saying
            where you are. */}
        <p className="truncate text-xs text-fg-muted md:hidden" title={path}>
          {path}
        </p>

        {/* The section's own caveat, on EVERY breakpoint: these two say something the path
            does not. The model inventory is proxy-wide, so the scope governs only the
            defaults and pins under it; the roster belongs to the subscription whatever
            agents it runs, and the agent applies to invitations and instance work. */}
        {section === "model" && (
          <p className="text-xs leading-relaxed text-fg-muted">
            {t.shell.inventoryProxyWideBefore}
            <b className="font-semibold text-fg">{t.shell.inventoryProxyWide}</b>
            {t.shell.inventoryProxyWideAfter}
            <b className="font-semibold text-fg">{scopeLabel}</b>
            {t.shell.inventoryAnd}
            <span className="font-mono text-[0.92em] text-fg">{agent}</span>
            {t.shell.period}
          </p>
        )}
        {section === "members" && (
          <p className="text-xs leading-relaxed text-fg-muted">
            {t.shell.membersRosterBefore}
            <b className="font-semibold text-fg">{scopeLabel}</b>
            {t.shell.membersRosterAfter}
            {t.shell.membersAgentBefore}
            <span className="font-mono text-[0.92em] text-fg">{agent}</span>
            {t.shell.membersAgentAfter}
          </p>
        )}
        {legacy && <p className="text-xs leading-relaxed text-fg-muted">{t.legacyStore.readOnlyNote}</p>}

        <RestartChrome
          policy={policy}
          onChange={onPolicyChange}
          // The legacy store belongs to no agent, so it sends none: lib/adminRestart strips
          // the sentinel from the wire too, but the confirmation copy reads this field
          // directly and would otherwise offer to restart "through all only".
          target={{
            tenantId: scope.tenantId,
            subsAccId: scope.subsAccId,
            agent: legacy ? undefined : agent,
          }}
          scopeLabel={scopeLabel}
          needsDelivery={sectionNeedsDelivery(section)}
          section={section}
        />
      </div>
    </div>
  );
}
