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

// Sections only a PICOCLAW agent offers. Picoclaw is currently the only harness, so
// every agent gets all of them today; the split is kept because each of these three
// is defined by picoclaw's own file layout, not by the admin UI.
//
// `model`: the registry governs picoclaw agents — the proxy rejects an assignment
// for an agent it does not govern.
//
// `persona`: the read-only identity files (AGENT.md, SOUL.md, HEARTBEAT.md and the
// USER.md seed) are picoclaw's workspace layout, delivered on the picoclaw create
// path.
//
// `config`: `config.json` is picoclaw's file, so a key edited in bulk here only
// means anything to an agent that reads it.
const PICOCLAW_ONLY: Tab[] = ["persona", "model", "config"];

// The sections every REAL agent has, whatever harness runs it: the shared content
// stores and its roster. Derived from the full section list rather than spelled out
// again, so adding a section is one edit — the two enumerations would otherwise have to
// be kept in agreement by hand.
const AGENT_TABS: Tab[] = SECTION_TABS.filter((s) => !PICOCLAW_ONLY.includes(s));

// What the LEGACY all-agents entry offers: the content stores alone.
//
// `members` is withheld, and not for the reason the picoclaw sections are. An
// invitation is a mycelium guest role, and a guest role's NAME IS THE AGENT KEY
// (`lib/invitations.ts`) — the gateway declares `protectedByRoles = [{ name = "alpha" }]`
// and mycelium creates those roles at boot. `ALL_AGENTS` is a store address, not an
// agent, so no role is ever named for it and an invitation through it could not be
// constructed. A roster shown there would be a list nobody could add to.
const LEGACY_TABS: Tab[] = AGENT_TABS.filter((s) => s !== "members");

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
// A tab a given agent cannot use is ABSENT rather than present-and-explaining-itself.
//
// The legacy store gets neither picoclaw-only section, and for its own reason: both
// are addressed PER AGENT — the model registry is stored under `agent/<agent>`, and
// the proxy rejects an agent-less persona write outright — so an all-agents address
// was never a place either record could live. It gets no `members` either; see
// LEGACY_TABS for why that one is a different argument.
export function agentTabs(agent: string, agents: AgentRef[]): Tab[] {
  if (agent === LEGACY_AGENT) return LEGACY_TABS;
  return picoclawAgentKeys(agents).includes(agent) ? [...SECTION_TABS] : AGENT_TABS;
}

// The tab to render for an agent, given what the URL asked for. A URL can name a
// section the selected agent does not offer, which resolves the way parseTab resolves
// garbage: the first section the agent does offer.
export function resolveAgentTab(tab: Tab, agent: string, agents: AgentRef[]): Tab {
  const offered = agentTabs(agent, agents);
  return offered.includes(tab) ? tab : offered[0];
}
