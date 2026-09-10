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

// Sections only a PICOCLAW agent offers, because each is defined by picoclaw's own
// file layout rather than by the admin UI.
//
// `model`: the registry materializes into `.security.yml` and `config.json`, and the
// proxy REFUSES an assignment for any other harness (`rejectNonPicoclawAgent`) —
// naming the reason, that such an agent reads its model from the proxy
// configuration. A form here would post a write the proxy 400s.
//
// `config`: `config.json` is picoclaw's file. A ganglion agent has none at all —
// `provisionGanglion` writes no config, the harness reads its whole configuration
// from the environment — so a key edited here would mean nothing to it.
//
// `persona` IS NOT ON THIS LIST, and used to be.
//
// The comment justifying that said the identity files were "delivered on the picoclaw
// create path". That was true when it was written and stopped being true when
// `createGanglion` grew `personaBindStrings`: a ganglion container mounts AGENT.md,
// SOUL.md and HEARTBEAT.md read-only over its workspace, and `GANGLION_SYSTEM_FILE`
// points the harness at AGENT.md, re-read every turn. The proxy's persona routes are
// not harness-gated either — `picoclawOnly` in harness_gate.go lists projects,
// personal models and the memory graph, never persona.
//
// So hiding the tab left the ONE screen that edits a ganglion agent's identity
// unreachable, for agents whose identity the cascade was wired up to deliver.
const PICOCLAW_ONLY: Tab[] = ["model", "config"];

// The sections every REAL agent has, whatever harness runs it: the shared content
// stores and its roster. Derived from the full section list rather than spelled out
// again, so adding a section is one edit — the two enumerations would otherwise have to
// be kept in agreement by hand.
const AGENT_TABS: Tab[] = SECTION_TABS.filter((s) => !PICOCLAW_ONLY.includes(s));

// What the LEGACY all-agents entry offers: the content stores alone.
//
// Two sections are withheld here rather than through PICOCLAW_ONLY, because
// neither argument is about the harness — both are about the ADDRESS.
//
// `members`: an invitation is a mycelium guest role, and a guest role's NAME IS THE
// AGENT KEY (`lib/invitations.ts`) — the gateway declares
// `protectedByRoles = [{ name = "alpha" }]` and mycelium creates those roles at boot.
// `ALL_AGENTS` is a store address, not an agent, so no role is ever named for it and
// an invitation through it could not be constructed. A roster shown there would be a
// list nobody could add to.
//
// `persona`: the proxy refuses an agent-less persona write outright, so an all-agents
// address was never a place that record could live. It used to fall out of
// PICOCLAW_ONLY for free; now that persona is offered to every harness, the reason it
// is absent HERE has to be stated where it actually applies. A caught regression, not
// a rewrite: `agentTabs` still returns the content stores alone for the legacy entry.
const LEGACY_TABS: Tab[] = AGENT_TABS.filter((s) => s !== "members" && s !== "persona");

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
// The legacy all-agents store gets less than any real agent does, and for reasons of
// its own rather than the harness ones: see LEGACY_TABS.
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
