import { ALL_AGENTS, picoclawAgentKeys, type AgentRef } from "@/lib/admin";
import { SECTION_TABS, type Tab } from "./tabs";

// WHICH AGENT the admin screen is acting as, and what that agent can be
// administered for.
//
// The agent is now the FIRST thing selected — before any tenant or subscription —
// because that is the order the system is built in: agents exist in the proxy's
// configuration before a tenant does. Asking for the scope first implied agents were
// a property of a subscription, and admins read it that way.
//
// React-free so the rules are testable without mounting the admin tree, which the
// `environment: "node"` suite requires — and because this is where an agent-first
// screen can be quietly wrong.

// The all-agents store's key. It is NO LONGER a picker sentinel: nothing writes to it
// any more. It survives as the address of what was already written there, which is
// still on disk and still read by every container under the scope. `scopeKey` and the
// wire format are untouched.
export const LEGACY_AGENT = ALL_AGENTS;

// The sections every agent has: the shared content stores. Derived from the full
// section list rather than spelled out again, so adding a section is one edit — the
// two enumerations would otherwise have to be kept in agreement by hand.
const CONTENT_TABS: Tab[] = SECTION_TABS.filter((s) => s !== "model");

// `?agent=` is user-editable, so this has to resolve to something. An unknown key
// yields null — the agent list, never an empty working view whose header names an
// agent that does not exist.
export function resolveAgent(raw: string | null | undefined, agents: AgentRef[]): string | null {
  if (!raw) return null;
  if (raw === LEGACY_AGENT) return LEGACY_AGENT;
  return agents.some((a) => a.key === raw) ? raw : null;
}

// The sections a given agent offers.
//
// The model registry is the only one that is not universal. It governs picoclaw
// agents: hermes reads its model from the proxy's own config.yaml, so a pin or an
// agent default written for one is a record nothing reads — the proxy rejects it. The
// tab is ABSENT rather than present-and-explaining-itself.
//
// The legacy store has no model tab either, for a different reason: the registry is
// stored per agent (`agent/<agent>`), so an all-agents address was never a place a
// model record could live.
export function agentTabs(agent: string, agents: AgentRef[]): Tab[] {
  if (agent === LEGACY_AGENT) return CONTENT_TABS;
  return picoclawAgentKeys(agents).includes(agent) ? [...CONTENT_TABS, "model"] : CONTENT_TABS;
}

// The tab to render for an agent, given what the URL asked for. A URL can name a
// section the selected agent does not offer (`?tab=model` with a hermes agent), which
// resolves the way parseTab resolves garbage: the first section the agent does offer.
export function resolveAgentTab(tab: Tab, agent: string, agents: AgentRef[]): Tab {
  const offered = agentTabs(agent, agents);
  return offered.includes(tab) ? tab : offered[0];
}
