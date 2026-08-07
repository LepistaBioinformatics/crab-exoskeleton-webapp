import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Search } from "lucide-react";
import { PanelEmpty } from "./panel-empty";

// The suite runs `environment: "node"`, so these render the component directly.
//
// What is actually worth asserting here is the CONTRACT the call sites depend on:
// the marker attribute (every empty branch is expected to carry it), and that both
// optional slots really are optional — a state with only a title must not emit an
// empty paragraph where the body goes.

describe("PanelEmpty", () => {
  it("carries the marker every empty branch is asserted on", () => {
    const html = renderToStaticMarkup(<PanelEmpty title="Nothing yet" />);
    expect(html).toContain("data-empty-state");
  });

  it("renders the title alone when there is nothing to add", () => {
    const html = renderToStaticMarkup(<PanelEmpty title="Nothing yet" />);
    expect(html).toContain("Nothing yet");
    expect(html).not.toContain("<svg");
    // One paragraph, not a title plus an empty body.
    expect(html.match(/<p/g)).toHaveLength(1);
  });

  it("renders icon, title and body together", () => {
    const html = renderToStaticMarkup(
      <PanelEmpty icon={Search} title="No matches" body="Try another term." />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("No matches");
    expect(html).toContain("Try another term.");
  });

  // There is exactly ONE anchor, and no way for a call site to ask for another. The
  // graph map had a vertically-centred variant for a while; against the other three
  // sub-tabs it read as one more inconsistency rather than as fitting its taller pane.
  it("anchors to the top, with no way to opt out", () => {
    const html = renderToStaticMarkup(<PanelEmpty title="x" />);
    expect(html).toContain("py-8");
    expect(html).not.toContain("h-full");
    expect(html).not.toContain("justify-center");
  });
});
