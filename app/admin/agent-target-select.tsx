"use client";

import { Bot } from "lucide-react";
import { ALL_AGENTS } from "@/lib/admin";

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

// The one agent picker every admin tab uses. Two hint texts because the choice
// means different things: for shared content it selects which STORE is written,
// while the model registry is per-agent by construction (each agent keeps its own
// catalog, and a key is registered into one of them), so there "all" is an
// aggregated read — registering still names a single agent.
const HINTS: Record<"content" | "registry", { all: string; one: (a: string) => string }> = {
  content: {
    all: "Every agent under this scope reads this content.",
    one: (a) =>
      `Only ${a} workspaces read this content. An entry here overrides the all-agents one with the same name.`,
  },
  registry: {
    all: "Showing every agent's catalog. Registering a model still targets one agent — pick it in the form.",
    one: (a) => `Showing ${a}'s catalog. New models and assignments apply to ${a}.`,
  },
};

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
  const hint = HINTS[purpose];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg-muted">Applies to</span>
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
          <option value={ALL_AGENTS}>All agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              Only {a}
            </option>
          ))}
        </select>
      </div>
      <span className="text-[11px] text-fg-muted">
        {value === ALL_AGENTS ? hint.all : hint.one(value)}
      </span>
    </label>
  );
}
