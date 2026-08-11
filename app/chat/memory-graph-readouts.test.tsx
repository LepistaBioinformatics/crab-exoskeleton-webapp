import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clampToStage, Legend, HoverCard, PathChain } from "./memory-graph-readouts";
import { chatCopy } from "@/lib/i18n/chat";

// The suite runs `environment: "node"`, so effects never fire: these render the
// presentational pieces directly, and the positioning maths is a pure function tested
// separately. That split matters here — a tooltip that overflows the 280px column is
// invisible in a unit test but is the whole usability problem in the real panel.

const g = chatCopy.en.memoryGraph;
const colorFor = (value: string) => `#${value.length}00000`;

describe("Legend", () => {
  const domain = [
    { type: "person", count: 4 },
    { type: "system", count: 2 },
    { type: "theme", count: 1 },
  ];

  it("names every colour on screen", () => {
    const html = renderToStaticMarkup(
      <Legend
        domain={domain}
        renderedCounts={new Map([["person", 4], ["system", 2], ["theme", 1]])}
        active={null}
        onPick={() => {}}
        colorFor={colorFor}
        copy={g}
      />,
    );
    for (const { type } of domain) expect(html).toContain(type);
  });

  // THE dead-end this test exists to prevent. `typeFilter` is a hard gate, so if the legend's
  // rows came from what is rendered, clicking "person" would collapse it to one row — with no
  // other type visible to switch to and no way back except a control in another section.
  it("still lists every type after one is selected", () => {
    const html = renderToStaticMarkup(
      <Legend
        domain={domain}
        renderedCounts={new Map([["person", 4]])}
        active="person"
        onPick={() => {}}
        colorFor={colorFor}
        copy={g}
      />,
    );
    expect(html).toContain("person");
    expect(html, "system must stay reachable while person is the active filter").toContain(
      "system",
    );
    expect(html).toContain("theme");
  });

  it("shows zero for a type the filter hid, rather than dropping the row", () => {
    const html = renderToStaticMarkup(
      <Legend
        domain={domain}
        renderedCounts={new Map([["person", 4]])}
        active="person"
        onPick={() => {}}
        colorFor={colorFor}
        copy={g}
      />,
    );
    expect(html).toContain("0");
  });

  it("marks the active row as pressed, so the state is not colour-only", () => {
    const html = renderToStaticMarkup(
      <Legend
        domain={domain}
        renderedCounts={new Map()}
        active="system"
        onPick={() => {}}
        colorFor={colorFor}
        copy={g}
      />,
    );
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders nothing to pick when the graph has no types", () => {
    const html = renderToStaticMarkup(
      <Legend
        domain={[]}
        renderedCounts={new Map()}
        active={null}
        onPick={() => {}}
        colorFor={colorFor}
        copy={g}
      />,
    );
    expect(html).not.toContain("aria-pressed");
  });
});

// Three outcomes, three different things to say. "Unreachable" and "not on the map" have
// different fixes, and collapsing them would send a member hunting for a connection that exists
// behind a filter they could simply clear.
describe("PathChain", () => {
  it("writes the route out in order", () => {
    const html = renderToStaticMarkup(
      <PathChain
        result={{
          kind: "found",
          nodes: ["alice", "ledger", "bob"],
          edgeIds: ["e1", "e2"],
          steps: [
            { from: "alice", to: "ledger", relation: "maintains", reversed: false },
            { from: "ledger", to: "bob", relation: "reviews", reversed: false },
          ],
          missing: [],
        }}
        copy={g}
      />,
    );
    expect(html).toContain("alice");
    expect(html).toContain("maintains");
    expect(html).toContain("bob");
    expect(html).toContain("→");
  });

  // The path is searched undirected; that does not license reporting a relation backwards.
  it("points the arrow the way the relation was STORED, not the way the walk went", () => {
    const html = renderToStaticMarkup(
      <PathChain
        result={{
          kind: "found",
          nodes: ["ledger", "bob"],
          edgeIds: ["e2"],
          steps: [{ from: "ledger", to: "bob", relation: "reviews", reversed: true }],
          missing: [],
        }}
        copy={g}
      />,
    );
    expect(html, "the agent wrote bob → ledger, so the chain must not claim the reverse").toContain(
      "←",
    );
  });

  it("says the two are unconnected, and admits the map may be why", () => {
    const html = renderToStaticMarkup(
      <PathChain
        result={{ kind: "unreachable", nodes: [], edgeIds: [], steps: [], missing: [] }}
        copy={g}
      />,
    );
    expect(html).toContain(g.mapTools.pathUnreachable);
    expect(html).toContain(g.mapTools.pathUnreachableHint);
  });

  it("names the endpoint that is not drawn, instead of calling it unconnected", () => {
    const html = renderToStaticMarkup(
      <PathChain
        result={{
          kind: "endpoint-missing",
          nodes: [],
          edgeIds: [],
          steps: [],
          missing: ["ghost"],
        }}
        copy={g}
      />,
    );
    expect(html).toContain("ghost");
    expect(html).not.toContain(g.mapTools.pathUnreachable);
  });

  it("says so when both picks were the same entity", () => {
    const html = renderToStaticMarkup(
      <PathChain
        result={{ kind: "found", nodes: ["alice"], edgeIds: [], steps: [], missing: [] }}
        copy={g}
      />,
    );
    expect(html).toContain(g.mapTools.pathSame);
  });
});

describe("HoverCard", () => {
  it("answers what the node is without opening the detail pane", () => {
    const html = renderToStaticMarkup(
      <HoverCard
        node={{ name: "ledger", type: "system", observations: 7, relations: 3 }}
        left={10}
        top={20}
        copy={g}
      />,
    );
    expect(html).toContain("ledger");
    expect(html).toContain("system");
    expect(html).toContain("7");
    expect(html).toContain("3");
  });

  it("labels an untyped entity rather than leaving a blank line", () => {
    const html = renderToStaticMarkup(
      <HoverCard
        node={{ name: "loose", type: "unknown", observations: 0, relations: 0 }}
        left={0}
        top={0}
        copy={g}
      />,
    );
    expect(html).toContain("unknown");
  });
});

// The map's first version drowned on hand-rolled coordinate maths, so this is the one piece of
// positioning left and it is pure and pinned. In a ~280px column an unclamped card overflows
// on almost every node near the right edge.
describe("clampToStage", () => {
  const card = { w: 160, h: 80 };
  const stage = { w: 280, h: 400 };

  it("places the card past the node when there is room", () => {
    const { left, top } = clampToStage({ x: 20, y: 20 }, card, stage);
    expect(left).toBeGreaterThan(20);
    expect(top).toBeGreaterThanOrEqual(20);
  });

  it("flips to the left instead of overflowing the right edge", () => {
    const { left } = clampToStage({ x: 270, y: 20 }, card, stage);
    expect(left + card.w).toBeLessThanOrEqual(stage.w);
  });

  it("flips above instead of overflowing the bottom edge", () => {
    const { top } = clampToStage({ x: 20, y: 395 }, card, stage);
    expect(top + card.h).toBeLessThanOrEqual(stage.h);
  });

  it("never goes negative, even when the card cannot fit at all", () => {
    const { left, top } = clampToStage({ x: 5, y: 5 }, { w: 400, h: 600 }, stage);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it("stays inside the stage for a node in every corner", () => {
    for (const x of [0, stage.w]) {
      for (const y of [0, stage.h]) {
        const { left, top } = clampToStage({ x, y }, card, stage);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(left + card.w).toBeLessThanOrEqual(stage.w);
        expect(top + card.h).toBeLessThanOrEqual(stage.h);
      }
    }
  });
});
