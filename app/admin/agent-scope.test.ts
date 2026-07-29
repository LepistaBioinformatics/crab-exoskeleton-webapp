import { describe, it, expect } from "vitest";
import { LEGACY_AGENT, resolveAgent, agentTabs, resolveAgentTab } from "./agent-scope";
import type { AgentRef } from "@/lib/admin";

const agents: AgentRef[] = [
  { key: "alpha", harness: "picoclaw" },
  { key: "beta", harness: "picoclaw" },
  { key: "hermes-glm", harness: "hermes" },
  // An older proxy reports no harness at all, and picoclaw was the only one then.
  { key: "legacy-shaped", harness: undefined },
];

describe("resolveAgent", () => {
  it("shows the gate when nothing is selected", () => {
    expect(resolveAgent(null, agents)).toBeNull();
    expect(resolveAgent("", agents)).toBeNull();
  });

  it("accepts an agent the proxy reports", () => {
    expect(resolveAgent("alpha", agents)).toBe("alpha");
    expect(resolveAgent("hermes-glm", agents)).toBe("hermes-glm");
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
  it("offers the model registry to the agents it governs", () => {
    expect(agentTabs("alpha", agents)).toEqual(["files", "secrets", "skills", "model"]);
  });

  it("counts an agent with no reported harness as one it governs", () => {
    expect(agentTabs("legacy-shaped", agents)).toContain("model");
  });

  // hermes reads its model from the proxy's config.yaml, so a pin written for one is
  // a record nothing reads. Absent beats present-and-explaining-itself.
  it("withholds the model registry from a hermes agent", () => {
    expect(agentTabs("hermes-glm", agents)).toEqual(["files", "secrets", "skills"]);
  });

  // The registry is stored per agent (`agent/<agent>`), so an all-agents address was
  // never a place a model record could live.
  it("withholds it from the legacy store too", () => {
    expect(agentTabs(LEGACY_AGENT, agents)).toEqual(["files", "secrets", "skills"]);
  });
});

describe("resolveAgentTab", () => {
  it("keeps a section the agent offers", () => {
    expect(resolveAgentTab("model", "alpha", agents)).toBe("model");
    expect(resolveAgentTab("secrets", "hermes-glm", agents)).toBe("secrets");
  });

  // The tab set is per agent, so the URL can name one the agent has not got.
  it("falls back to the agent's first section for one it does not", () => {
    expect(resolveAgentTab("model", "hermes-glm", agents)).toBe("files");
    expect(resolveAgentTab("model", LEGACY_AGENT, agents)).toBe("files");
  });
});
