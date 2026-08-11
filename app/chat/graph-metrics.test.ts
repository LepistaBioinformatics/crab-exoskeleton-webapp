import { describe, expect, it } from "vitest";
import {
  computeBaseMetrics,
  computeBetweenness,
  computeCommunities,
} from "./graph-metrics";
import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

// These assertions started life as a throwaway spike, run BEFORE this module was written,
// because the Cytoscape API here is the highest-uncertainty piece in the whole feature: every
// one of these functions returns an ACCESSOR OBJECT rather than per-node numbers, and code
// written against the obvious guess compiles and returns undefined.
//
// A headless instance needs no container and works under `environment: "node"`, which is what
// makes computing over the whole graph testable at all.

function entity(name: string, over: Partial<SummaryEntity> = {}): SummaryEntity {
  return { name, type: "person", observationCount: 1, relationCount: 0, ...over };
}

const rel = (from: string, to: string, relationType = "knows"): Relation => ({
  from,
  to,
  relationType,
});

// A hub with three leaves, one extra edge among the leaves, and one entity connected to
// nothing at all.
const entities = ["hub", "a", "b", "c", "lonely"].map((n) => entity(n));
const relations = [
  rel("a", "hub"),
  rel("b", "hub"),
  rel("c", "hub"),
  rel("a", "b"),
];

describe("computeBaseMetrics", () => {
  it("ranks the hub above a leaf", () => {
    const { pagerank } = computeBaseMetrics(entities, relations);
    expect(pagerank.get("hub")!).toBeGreaterThan(pagerank.get("c")!);
  });

  // Raw PageRank sums to 1 across the graph, so on a 300-entity graph every value is around
  // 0.003 — useless as a node diameter. Normalising against the best makes it a proportion.
  it("normalises PageRank against the strongest entity, so it can drive a size", () => {
    const { pagerank } = computeBaseMetrics(entities, relations);
    expect(pagerank.get("hub")).toBe(1);
    for (const v of pagerank.values()) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // MEASURED, not assumed. Cytoscape's pageRank is DIRECTED and offers no undirected option.
  // Every relation in this fixture points AT the hub, making it a rank sink — on the directed
  // reading, `c` (which has one relation) scored exactly what `lonely` (which has none) scored.
  // This graph has no direction convention, so reading it directed measures the convention
  // instead of the content. The fix is reciprocal edges; this test is what holds it in place.
  it("reads relations as undirected, so pointing AT a hub still counts as connected", () => {
    const { pagerank } = computeBaseMetrics(entities, relations);
    expect(
      pagerank.get("c")!,
      "a leaf whose only relation points at a sink must still outrank an orphan",
    ).toBeGreaterThan(pagerank.get("lonely")!);
  });

  it("gives every entity a score, including one with no relations", () => {
    const { pagerank } = computeBaseMetrics(entities, relations);
    expect(pagerank.size).toBe(entities.length);
    expect(pagerank.has("lonely")).toBe(true);
  });

  it("separates the connected component from the unconnected entity", () => {
    const { component } = computeBaseMetrics(entities, relations);
    expect(new Set(component.values()).size).toBe(2);
    expect(component.get("hub")).toBe(component.get("a"));
    expect(component.get("lonely")).not.toBe(component.get("hub"));
  });

  // The direct answer to "what does the agent know but has never connected to anything" —
  // which is a question the map could not answer at all before.
  it("finds the entities that are alone in their own component", () => {
    const { isolated } = computeBaseMetrics(entities, relations);
    expect(isolated).toEqual(["lonely"]);
  });

  it("calls everything isolated when the graph has no relations", () => {
    const { isolated } = computeBaseMetrics(entities, []);
    expect(isolated.sort()).toEqual(["a", "b", "c", "hub", "lonely"]);
  });

  it("survives an empty graph rather than throwing on it", () => {
    const { pagerank, component, isolated } = computeBaseMetrics([], []);
    expect(pagerank.size).toBe(0);
    expect(component.size).toBe(0);
    expect(isolated).toEqual([]);
  });

  // The same drop rule buildElements uses. A relation to an entity outside the projection
  // would make Cytoscape throw on construction, which would take the whole panel down.
  it("ignores a relation pointing at an entity that is not in the graph", () => {
    expect(() => computeBaseMetrics([entity("solo")], [rel("solo", "ghost")])).not.toThrow();
  });

  it("does not compute betweenness, because it is the expensive one", () => {
    // GD-B1: O(n·m) must never run on load. It has its own function for exactly that reason.
    expect(computeBaseMetrics(entities, relations)).not.toHaveProperty("betweenness");
  });
});

describe("computeBetweenness", () => {
  it("peaks at the entity every path has to cross", () => {
    const b = computeBetweenness(entities, relations);
    expect(b.get("hub")!).toBeGreaterThan(b.get("c")!);
  });

  it("normalises to a proportion, so it can drive a size like PageRank does", () => {
    const b = computeBetweenness(entities, relations);
    for (const v of b.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("gives every entity a score, including the unconnected one", () => {
    const b = computeBetweenness(entities, relations);
    expect(b.size).toBe(entities.length);
    expect(b.get("lonely")).toBe(0);
  });

  // A graph where nobody is between anybody: normalising by the max would divide by zero.
  it("returns zeros rather than NaN when no entity lies on any path", () => {
    const b = computeBetweenness([entity("x"), entity("y")], [rel("x", "y")]);
    for (const v of b.values()) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("computeCommunities", () => {
  it("gives EVERY entity a community, including ones the clusterer skipped", () => {
    // The load-bearing one. Markov clustering does not promise to return every node, and a
    // node missing from the map would fall through to whatever the colour encoding's default
    // is — silently painting unrelated entities the same colour.
    const c = computeCommunities(entities, relations);
    expect(c.size).toBe(entities.length);
    for (const e of entities) expect(c.has(e.name)).toBe(true);
  });

  it("puts two entities that only relate to each other in the same community", () => {
    const pair = [entity("x"), entity("y"), entity("far")];
    const c = computeCommunities(pair, [rel("x", "y")]);
    expect(c.get("x")).toBe(c.get("y"));
    expect(c.get("far")).not.toBe(c.get("x"));
  });

  it("survives a graph with no relations at all", () => {
    const c = computeCommunities([entity("a"), entity("b")], []);
    expect(c.size).toBe(2);
  });

  it("survives an empty graph", () => {
    expect(computeCommunities([], []).size).toBe(0);
  });
});
