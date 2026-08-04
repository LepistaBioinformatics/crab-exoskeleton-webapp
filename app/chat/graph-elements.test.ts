import { describe, it, expect } from "vitest";
import { buildElements, typeColorIndex } from "./graph-elements";
import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

// Cytoscape owns the layout and the drawing now, so what is left to test is the mapping —
// and that is where a wrong answer is invisible. jsdom has no canvas and Cytoscape needs a
// real container, so a render test would prove nothing; these cover the two things that
// actually break it.

function entity(name: string, over: Partial<SummaryEntity> = {}): SummaryEntity {
  return {
    name,
    type: "project",
    observationCount: 3,
    relationCount: 1,
    firstObservation: "something",
    ...over,
  };
}

const rel = (from: string, to: string, relationType = "maintains"): Relation => ({
  from,
  to,
  relationType,
});

describe("buildElements", () => {
  it("carries what the stylesheet needs from each entity", () => {
    const { nodes } = buildElements([entity("ledger", { type: "system", observationCount: 7 })], []);
    expect(nodes[0].data).toMatchObject({
      id: "ledger",
      label: "ledger",
      type: "system",
      observations: 7,
    });
  });

  // Not cosmetic: Cytoscape THROWS on an edge naming a node that does not exist, so this
  // is what keeps the graph from failing to build at all. The browse projection can carry
  // an edge to an entity outside the page.
  it("drops a relation whose endpoint is absent, rather than letting the build fail", () => {
    const { edges } = buildElements(
      [entity("ledger")],
      [rel("ledger", "elsewhere"), rel("nobody", "ledger")],
    );
    expect(edges).toHaveLength(0);
  });

  // Cytoscape requires unique edge ids, and two entities can be related twice with
  // different relation types.
  it("gives parallel relations distinct ids", () => {
    const { edges } = buildElements(
      [entity("a"), entity("b")],
      [rel("a", "b", "maintains"), rel("a", "b", "reviews")],
    );
    expect(edges).toHaveLength(2);
    expect(new Set(edges.map((e) => e.data.id)).size).toBe(2);
    expect(edges.map((e) => e.data.label).sort()).toEqual(["maintains", "reviews"]);
  });

  it("keeps the direction the relation was stored with", () => {
    const { edges } = buildElements([entity("a"), entity("b")], [rel("a", "b")]);
    expect(edges[0].data.source).toBe("a");
    expect(edges[0].data.target).toBe("b");
  });

  it("reports the distinct types, so the legend and the palette agree", () => {
    const { types } = buildElements(
      [entity("a", { type: "person" }), entity("b", { type: "system" }), entity("c", { type: "person" })],
      [],
    );
    expect(types).toEqual(["person", "system"]);
  });

  it("labels an entity with no type rather than leaving it blank", () => {
    const { nodes, types } = buildElements([entity("a", { type: "" })], []);
    expect(nodes[0].data.type).toBe("unknown");
    expect(types).toEqual(["unknown"]);
  });
});

describe("typeColorIndex", () => {
  const types = ["person", "project", "system"];

  it("is stable per type", () => {
    expect(typeColorIndex(types, "project", 6)).toBe(typeColorIndex(types, "project", 6));
    expect(typeColorIndex(types, "person", 6)).not.toBe(typeColorIndex(types, "system", 6));
  });

  it("wraps rather than running off the palette", () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
    for (const t of many) {
      const i = typeColorIndex(many, t, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    }
  });

  it("falls back to the first colour for a type it has never seen", () => {
    expect(typeColorIndex(types, "ghost", 6)).toBe(0);
  });
});

// The map has to be REPRODUCIBLE: leaving the tab and coming back must show the same
// picture, because a member builds a mental map of their own graph. Cytoscape's cose
// randomises initial placement, so the determinism has to come from the seed we hand it.
describe("seedPosition — why the layout is reproducible", () => {
  it("gives the same entity set the same seeds on every call", () => {
    const once = buildElements([entity("b"), entity("a"), entity("c")], []);
    const twice = buildElements([entity("b"), entity("a"), entity("c")], []);
    expect(once.nodes.map((n) => n.position)).toEqual(twice.nodes.map((n) => n.position));
  });

  // The API's ordering is not a contract, so the seed must not depend on it — otherwise a
  // reordered response reshuffles the whole picture for no reason the member can see.
  it("does not depend on the order entities arrive in", () => {
    const forwards = buildElements([entity("a"), entity("b"), entity("c")], []);
    const backwards = buildElements([entity("c"), entity("b"), entity("a")], []);
    const seedOf = (g: typeof forwards, id: string) =>
      g.nodes.find((n) => n.data.id === id)!.position;
    for (const id of ["a", "b", "c"]) {
      expect(seedOf(forwards, id)).toEqual(seedOf(backwards, id));
    }
  });

  it("separates the seeds instead of piling them at the origin", () => {
    const { nodes } = buildElements(
      Array.from({ length: 12 }, (_, i) => entity(`e${i}`)),
      [],
    );
    const distinct = new Set(nodes.map((n) => `${n.position.x}:${n.position.y}`));
    expect(distinct.size).toBe(nodes.length);
  });

  it("uses no randomness at all", () => {
    const before = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return 0.5;
    };
    try {
      buildElements([entity("a"), entity("b")], []);
    } finally {
      Math.random = before;
    }
    expect(called, "a random seed would reshuffle the map on every visit").toBe(false);
  });
});
