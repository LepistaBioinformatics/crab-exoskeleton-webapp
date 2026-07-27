"use client";

import { Bot } from "lucide-react";
import { ALL_AGENTS } from "@/lib/admin";

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

// The one agent picker every admin tab uses. Two hint texts because the choice
// means different things: for shared content it selects which STORE is written,
// while the model inventory is PROXY-WIDE — one inventory shared by every
// picoclaw agent — so there the choice only decides which agent's route the
// request travels, plus which agent a per-user pin addresses. Only picoclaw
// agents are offered: hermes reads its model from the proxy's own configuration,
// so a pin or an agent default written for one would be a record nothing reads.
const HINTS: Record<"content" | "registry", { all: string; one: (a: string) => string }> = {
  content: {
    all: "Every agent under this scope reads this content.",
    one: (a) =>
      `Only ${a} workspaces read this content. An entry here overrides the all-agents one with the same name.`,
  },
  registry: {
    all: "The model inventory is shared by every picoclaw agent. This picker only chooses the route the request takes; a per-user pin addresses the agent that user's workspace runs under.",
    one: (a) =>
      `The inventory is shared by every picoclaw agent, but the agent level of the cascade and each per-user pin belong to ${a} alone.`,
  },
};

// Which agent an admin action targets. "All agents" addresses the store every
// agent under the scope reads (the pre-per-agent behaviour); picking one agent
// narrows both the store and the containers that get restarted, so a skill or
// credential meant for alpha never reaches beta.
//
// `allowAll` is off where "all" cannot be honoured. Some records are stored per
// agent, so an all-agents selection would have to be collapsed to one agent to
// make the request at all — and then the panel reads and writes that one agent
// while the label promises every one of them. Where that is the case the caller
// turns the option off and the admin picks the agent themselves.
export function AgentTargetSelect({
  agents,
  value,
  onChange,
  purpose = "content",
  allowAll = true,
}: {
  agents: string[];
  value: string;
  onChange: (agent: string) => void;
  purpose?: "content" | "registry";
  allowAll?: boolean;
}) {
  const hint = HINTS[purpose];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg-muted">{allowAll ? "Applies to" : "Routed through"}</span>
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
          {allowAll && <option value={ALL_AGENTS}>All agents</option>}
          {agents.length === 0 && (
            <option value="" disabled>
              no agents available
            </option>
          )}
          {agents.map((a) => (
            <option key={a} value={a}>
              {allowAll ? `Only ${a}` : a}
            </option>
          ))}
        </select>
      </div>
      <span className="text-[11px] text-fg-muted">
        {value === ALL_AGENTS ? hint.all : value ? hint.one(value) : "No agent to target."}
      </span>
    </label>
  );
}
