"use client";

import { Bot, Archive, ChevronRight } from "lucide-react";
import { cva } from "class-variance-authority";
import type { AgentRef } from "@/lib/admin";
import { LEGACY_AGENT } from "./agent-scope";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// THE FIRST THING THE ADMIN SCREEN ASKS. Nothing else is on screen until an agent is
// picked — no scope rail, no sections, no panels.
//
// It used to be the other way round: pick a tenant or subscription, then choose an
// agent inside each section. That is backwards from how the system is built. Agents
// exist in the proxy's configuration before any tenant does, and asking for the scope
// first implied agents were a property of a subscription — which is exactly what
// admins read it as, and were confused by.

const row = cva(
  "flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
  {
    variants: {
      tone: {
        agent: "border-brand/25 bg-elevated hover:border-brand hover:bg-elevated/70",
        // Subordinate on purpose: the legacy store must never read as one more agent
        // to choose between.
        legacy: "border-dashed border-brand/25 bg-transparent hover:bg-elevated/40",
      },
    },
    defaultVariants: { tone: "agent" },
  },
);

export function AgentGate({
  agents,
  onSelect,
}: {
  agents: AgentRef[];
  onSelect: (agent: string) => void;
}) {
  const t = useT(adminCopy);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-sm font-semibold text-fg">{t.agentGate.heading}</h2>
        <p className="max-w-[62ch] text-xs leading-relaxed text-fg-muted">{t.agentGate.note}</p>
      </div>

      {/* An empty list is reported, not drawn as a blank column. listAgents fails soft
          (it yields []), so this covers both "the proxy runs none" and "the call did
          not come back" — and the legacy entry below still reaches whatever was
          stored, which is why this is a notice rather than a dead end. */}
      {agents.length === 0 ? (
        <Alert severity="info">{t.agentGate.none}</Alert>
      ) : (
        <div className="flex flex-col gap-2">
          {agents.map((agent) => (
            <button
              key={agent.key}
              type="button"
              onClick={() => onSelect(agent.key)}
              className={row({ tone: "agent" })}
            >
              <Bot size={18} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{agent.key}</span>
              {agent.harness && <Badge tone="accent">{agent.harness}</Badge>}
              <ChevronRight size={16} className="shrink-0 text-fg-muted" aria-hidden />
            </button>
          ))}
        </div>
      )}

      {/* THE LEGACY STORE, in its own group and never among the agents.

          It is shown whether or not it holds anything, because emptiness cannot be
          known here: the store is per scope, and no scope has been chosen yet.
          Deciding would mean probing every scope against three stores before drawing
          this list. The panels say "nothing here" per scope instead. */}
      <div className="flex flex-col gap-2 border-t border-brand/20 pt-4">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t.legacyStore.groupLabel}
        </span>
        <button
          type="button"
          onClick={() => onSelect(LEGACY_AGENT)}
          className={row({ tone: "legacy" })}
        >
          <Archive size={18} className="shrink-0 text-fg-muted" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-fg-muted">
              {t.legacyStore.entryLabel}
            </span>
            <span className="truncate text-[11px] text-fg-muted">{t.legacyStore.entryNote}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-fg-muted" aria-hidden />
        </button>
      </div>
    </div>
  );
}
