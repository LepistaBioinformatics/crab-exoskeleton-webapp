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
    ]);
  });

  it("counts an agent with no reported harness as picoclaw", () => {
    expect(agentTabs("legacy-shaped", agents)).toContain("model");
    expect(agentTabs("legacy-shaped", agents)).toContain("persona");
  });

  // The model registry and the persona cascade are both addressed through picoclaw's
  // own file layout, so for an agent the proxy does not report as picoclaw they would
  // be forms whose writes reach nothing. Absent beats present-and-explaining-itself.
  it("withholds both picoclaw-only sections from a non-picoclaw agent", () => {
    expect(agentTabs("other-harness", agents)).toEqual(["files", "secrets", "skills"]);
  });

  // Both are addressed PER AGENT — the registry is stored under `agent/<agent>`, and
  // the proxy refuses an agent-less persona write outright — so an all-agents
  // address was never a place either record could live.
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
