"use client";

import { Bot } from "lucide-react";
import { ALL_AGENTS } from "@/lib/admin";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

// The one agent picker every admin tab uses. Two hint texts because the choice
// means different things: for shared content it selects which STORE is written,
// while the model inventory is PROXY-WIDE — one inventory shared by every
// picoclaw agent — so there the choice only decides which agent's route the
// request travels, plus which agent a per-user pin addresses. Only picoclaw
// agents are offered: hermes reads its model from the proxy's own configuration,
// so a pin or an agent default written for one would be a record nothing reads.
// Which agent an admin action targets. "All agents" addresses the store every
// agent under the scope reads (the pre-per-agent behaviour); picking one agent
// narrows both the store and the containers that get restarted, so a skill or
// credential meant for alpha never reaches beta.
export function AgentTargetSelect({
  agents,
  value,
  onChange,
  purpose = "content",
}: {
  agents: string[];
  value: string;
  onChange: (agent: string) => void;
  purpose?: "content" | "registry";
}) {
  const t = useT(adminCopy);
  const hint =
    purpose === "registry"
      ? { all: t.agentTarget.registryAll, one: t.agentTarget.registryOne }
      : { all: t.agentTarget.contentAll, one: t.agentTarget.contentOne };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg-muted">{t.agentTarget.appliesTo}</span>
      <div className="relative">
        <Bot
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
          aria-hidden
        />
        <select
          className={selectClass + " pl-9"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value={ALL_AGENTS}>{t.agentTarget.allAgents}</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {t.agentTarget.onlyPrefix} {a}
            </option>
          ))}
        </select>
      </div>
      <span className="text-[11px] text-fg-muted">
        {value === ALL_AGENTS ? hint.all : hint.one.replace("{agent}", value)}
      </span>
    </label>
  );
}
