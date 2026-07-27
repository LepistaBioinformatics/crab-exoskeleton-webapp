import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { AgentTargetSelect } from "./agent-target-select";

const noop = () => {};

describe("AgentTargetSelect", () => {
  it("offers All agents plus each agent when the caller allows it", () => {
    const html = renderToStaticMarkup(
      <AgentTargetSelect agents={["alpha", "beta"]} value="all" onChange={noop} />,
    );
    expect(html).toContain(">All agents<");
    expect(html).toContain(">Only alpha<");
    expect(html).toContain(">Only beta<");
  });

  // The Models tab turns the option off because the agent level of the model
  // cascade is stored per agent: an "all" selection had to be collapsed to one
  // agent to make the request, and the panel then showed and wrote THAT agent's
  // default under a label promising every agent.
  it("omits All agents when the caller disallows it, and drops the Only prefix", () => {
    const html = renderToStaticMarkup(
      <AgentTargetSelect agents={["alpha", "beta"]} value="alpha" onChange={noop} allowAll={false} />,
    );
    expect(html).not.toContain("All agents");
    // Asserted on the option markup: "Only alpha" also appears in the content
    // hint, so a bare substring check would pass for the wrong reason.
    expect(html).not.toContain(">Only alpha<");
    expect(html).toContain(">alpha<");
    expect(html).toContain(">beta<");
  });

  it("says what the choice reaches, differently for content and for the registry", () => {
    const content = renderToStaticMarkup(
      <AgentTargetSelect agents={["alpha"]} value="alpha" onChange={noop} purpose="content" />,
    );
    expect(content).toContain("workspaces read this content");

    const registry = renderToStaticMarkup(
      <AgentTargetSelect agents={["alpha"]} value="alpha" onChange={noop} purpose="registry" allowAll={false} />,
    );
    // The registry hint has to separate what is shared from what is not, or an
    // admin reads one agent's name and assumes the whole inventory is its own.
    expect(registry).toContain("shared by every picoclaw agent");
    expect(registry).toContain("belong to alpha alone");
  });

  it("stays operable with no agents to offer", () => {
    const html = renderToStaticMarkup(
      <AgentTargetSelect agents={[]} value="" onChange={noop} allowAll={false} />,
    );
    expect(html).toContain("no agents available");
    expect(html).toContain("No agent to target.");
  });
});
