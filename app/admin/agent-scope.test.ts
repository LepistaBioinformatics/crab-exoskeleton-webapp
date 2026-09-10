import { describe, it, expect } from "vitest";
import { LEGACY_AGENT, resolveAgent, agentTabs, resolveAgentTab } from "./agent-scope";
import type { AgentRef } from "@/lib/admin";

// Picoclaw is the only harness the proxy accepts, so no real deployment reports
// "other". The fixture synthesizes one anyway: the picoclaw-only filter is live code
// and this is the only test of its false branch. Deleting it would leave the split
// between PICOCLAW_ONLY and CONTENT_TABS asserted in one direction only.
const agents: AgentRef[] = [
  { key: "alpha", harness: "picoclaw" },
  { key: "beta", harness: "picoclaw" },
  { key: "other-harness", harness: "some-other-harness" },
  // A REAL second harness, and the reason the fixture above stopped being the
  // only non-picoclaw case: ganglion reads what the model inventory resolves
  // and `some-other-harness` does not, so the two must part company.
  { key: "zcrab-g", harness: "ganglion" },
  // An older proxy reports no harness at all — version back-compat, not a second
  // runtime. It must still count as picoclaw.
  { key: "legacy-shaped", harness: undefined },
];

describe("resolveAgent", () => {
  it("shows the gate when nothing is selected", () => {
    expect(resolveAgent(null, agents)).toBeNull();
    expect(resolveAgent("", agents)).toBeNull();
  });

  it("accepts an agent the proxy reports", () => {
    expect(resolveAgent("alpha", agents)).toBe("alpha");
    expect(resolveAgent("other-harness", agents)).toBe("other-harness");
  });

  // `?agent=` is user-editable and survives a deployment that drops an agent. Neither
  // may render a working view whose header names something that does not exist.
  it("falls back to the gate for an agent that is not there", () => {
    expect(resolveAgent("ghost", agents)).toBeNull();
    expect(resolveAgent("alpha", [])).toBeNull();
  });

  // The legacy store is addressable even though it is not an agent — that is the
  // whole point of keeping it: what was written there is still on disk.
  it("accepts the legacy store, which no agent list contains", () => {
    expect(resolveAgent(LEGACY_AGENT, agents)).toBe(LEGACY_AGENT);
    expect(resolveAgent(LEGACY_AGENT, [])).toBe(LEGACY_AGENT);
  });
});

describe("agentTabs", () => {
  it("offers every section to a picoclaw agent", () => {
    expect(agentTabs("alpha", agents)).toEqual([
      "files",
      "secrets",
      "skills",
      "persona",
      "model",
      "config",
      "members",
    ]);
  });

  it("counts an agent with no reported harness as picoclaw", () => {
    expect(agentTabs("legacy-shaped", agents)).toContain("model");
    expect(agentTabs("legacy-shaped", agents)).toContain("config");
  });

  // The model registry writes picoclaw's own files and the proxy 400s an assignment
  // for any other harness; config.json is a file a ganglion agent does not have.
  // Both would be forms whose writes reach nothing. Absent beats
  // present-and-explaining-itself.
  it("withholds the picoclaw-only sections from a non-picoclaw agent", () => {
    expect(agentTabs("other-harness", agents)).toEqual([
      "files",
      "secrets",
      "skills",
      "persona",
      "members",
    ]);
  });

  // Reported in use: "quando entro na area de admin do gamma não vejo a aba de
  // config, só no picoclaw". config was right to be missing. Persona was not --
  // a ganglion container mounts AGENT.md, SOUL.md and HEARTBEAT.md and the harness
  // reads AGENT.md as its system prompt every turn, so hiding the tab left the one
  // screen that edits its identity unreachable.
  it("offers persona to a non-picoclaw agent, whose harness reads AGENT.md", () => {
    expect(agentTabs("other-harness", agents)).toContain("persona");
  });

  // The legacy all-agents store keeps losing persona as well, and for its own
  // reason: the proxy refuses an agent-less persona write outright, so an all-agents
  // address was never a place that record could live. That argument is about the
  // ADDRESS, not about the harness, which is why it survives persona leaving
  // PICOCLAW_ONLY.
  it("withholds them from the legacy store too", () => {
    expect(agentTabs(LEGACY_AGENT, agents)).toEqual(["files", "secrets", "skills"]);
  });

  // `config.json` is picoclaw's file, so for an agent that does not read it the bulk
  // editor would be writing a key into a document nothing consults.
  it("offers config to a picoclaw agent and withholds it from a non-picoclaw one", () => {
    expect(agentTabs("alpha", agents)).toContain("config");
    expect(agentTabs("legacy-shaped", agents)).toContain("config");
    expect(agentTabs("other-harness", agents)).not.toContain("config");
  });

  // `config` is picoclaw-only, and the legacy all-agents store gets no picoclaw-only
  // section — CONTENT_TABS filters them out, so this needs no rule of its own.
  it("withholds config from the legacy store", () => {
    expect(agentTabs(LEGACY_AGENT, agents)).not.toContain("config");
  });
});

describe("resolveAgentTab", () => {
  it("keeps a section the agent offers", () => {
    expect(resolveAgentTab("model", "alpha", agents)).toBe("model");
    expect(resolveAgentTab("secrets", "other-harness", agents)).toBe("secrets");
  });

  // The tab set is per agent, so the URL can name one the agent has not got.
  it("falls back to the agent's first section for one it does not", () => {
    expect(resolveAgentTab("model", "other-harness", agents)).toBe("files");
    expect(resolveAgentTab("model", LEGACY_AGENT, agents)).toBe("files");
  });

  // `?tab=config` needs no rule of its own: config is picoclaw-only, so the existing
  // "a section this agent does not offer falls back to its first" rule already covers
  // a hand-typed URL pointing a non-picoclaw agent at picoclaw's `config.json`.
  it("treats config as any other picoclaw-only section in the URL", () => {
    expect(resolveAgentTab("config", "alpha", agents)).toBe("config");
    expect(resolveAgentTab("config", "other-harness", agents)).toBe("files");
    expect(resolveAgentTab("config", LEGACY_AGENT, agents)).toBe("files");
  });
});

// `members` joins the sections of a real agent: the screen asks for the agent and the
// scope once, and the invitation that used to pick its own agent inside the form now
// takes that one.
describe("agentTabs — members", () => {
  it("offers members for a picoclaw agent and for one of another harness", () => {
    expect(agentTabs("alpha", [{ key: "alpha" }])).toContain("members");
    expect(agentTabs("hermes", [{ key: "hermes", harness: "hermes" }])).toContain("members");
  });

  // A guest role's name IS the agent key, and no role is ever named for the all-agents
  // store -- an invitation through it could not be constructed, so the roster would be a
  // list nobody could add to.
  it("withholds members from the legacy all-agents entry", () => {
    expect(agentTabs(LEGACY_AGENT, [{ key: "alpha" }])).not.toContain("members");
  });

  it("leaves the legacy entry with the content stores alone", () => {
    expect(agentTabs(LEGACY_AGENT, [{ key: "alpha" }])).toEqual(["files", "secrets", "skills"]);
  });
});

describe("agentTabs — which harnesses the inventory governs", () => {
  // ganglion-model-registry. The Model tab was withheld from every non-picoclaw
  // harness because the proxy answered 400 for the write behind it. A ganglion
  // container now reads a materialized registry file written from the same
  // cascade, so the write lands and the tab has to be reachable.
  it("offers the Model tab to a ganglion agent", () => {
    expect(agentTabs("zcrab-g", agents)).toContain("model");
  });

  // The gate mirrors the proxy's `inventoryGoverned` allowlist. A harness the
  // proxy would refuse must not be offered a form whose Save always fails.
  it("still withholds it from a harness the proxy would refuse", () => {
    expect(agentTabs("other-harness", agents)).not.toContain("model");
  });

  // `config.json` is picoclaw's file and the Config tab edits its whole tree.
  // A ganglion agent reads a strict subset of that shape, written by the proxy
  // rather than by hand, so the tab stays withheld — gaining the model
  // inventory did not make it picoclaw.
  it("does not hand a ganglion agent the Config tab along with it", () => {
    expect(agentTabs("zcrab-g", agents)).not.toContain("config");
    expect(agentTabs("alpha", agents)).toContain("config");
  });

  // THE REGRESSION THIS FILE HAS NOW CAUGHT TWICE, once for persona and once
  // for model: a tab leaving PICOCLAW_ONLY reaches the legacy all-agents store
  // for free unless something stops it. A model assignment is resolved for a
  // WORKSPACE and materialized into that workspace's files; the legacy entry is
  // an address for shared content and has no workspace.
  it("never offers it through the legacy all-agents store", () => {
    expect(agentTabs(LEGACY_AGENT, agents)).toEqual(["files", "secrets", "skills"]);
  });

  // The order is one order. A section list that reshuffles when you switch
  // agents is a list you have to re-read every time.
  it("keeps the section order identical to picoclaw's, minus what is withheld", () => {
    const pico = agentTabs("alpha", agents);
    const gang = agentTabs("zcrab-g", agents);
    expect(gang).toEqual(pico.filter((s) => s !== "config"));
  });
});
