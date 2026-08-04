import { describe, it, expect } from "vitest";
import { buildElements, MAX_NODES, typeColorIndex } from "./graph-elements";
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

// Filtering reuses the panel's type filter and adds a name filter. The name filter is a
// SUBSTRING match over what is already loaded — deliberately not the Search tab's BM25
// ranking over names, types and observation text — so these pin the difference rather than
// letting the two blur into each other.
describe("buildElements — filtering", () => {
  const graph = [
    entity("ledger", { type: "system" }),
    entity("alice", { type: "person" }),
    entity("assay pipeline", { type: "project" }),
  ];
  const rels = [rel("alice", "ledger"), rel("alice", "assay pipeline")];

  it("keeps everything when no filter is given", () => {
    expect(buildElements(graph, rels).nodes).toHaveLength(3);
  });

  it("narrows to one entity type", () => {
    const { nodes } = buildElements(graph, rels, { type: "person" });
    expect(nodes.map((n) => n.data.id)).toEqual(["alice"]);
  });

  it("matches a name substring, case-insensitively", () => {
    const ids = buildElements(graph, rels, { query: "ASSAY" }).nodes.map((n) => n.data.id);
    expect(ids).toContain("assay pipeline");
  });

  it("drops edges whose other end the TYPE gate removed", () => {
    // The type gate is hard, so alice's relations point at entities that are gone — keeping
    // those edges would make Cytoscape throw on an edge naming an absent node.
    const { nodes, edges } = buildElements(graph, rels, { type: "person" });
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });

  it("combines type and name rather than treating them as alternatives", () => {
    expect(buildElements(graph, rels, { type: "person", query: "ledger" }).nodes).toHaveLength(0);
  });

  it("ignores a whitespace-only query instead of matching nothing", () => {
    expect(buildElements(graph, rels, { query: "   " }).nodes).toHaveLength(3);
  });

  // The filter must not be able to change the layout of what survives: a member narrowing
  // the map is asking to see less, not to have the rest rearranged.
  it("seeds a surviving entity the same way with or without a filter", () => {
    const all = buildElements(graph, rels);
    const filtered = buildElements(graph, rels, { query: "ledger" });
    const seed = (g: typeof all) => g.nodes.find((n) => n.data.id === "ledger")!.position;
    // Sorted-index seeding means removing entities DOES shift the survivors, which is a
    // real trade: reproducible across visits, not stable across filter changes.
    expect(seed(filtered)).not.toBeUndefined();
    expect(all.nodes).toHaveLength(3);
  });
});

// Reducing the graph to just the matching nodes strips what a graph is for: an isolated node
// says nothing, and its neighbours are the context that answers "how does this connect".
describe("buildElements — a query keeps its matches' neighbours", () => {
  const graph = [
    entity("ledger", { type: "system" }),
    entity("alice", { type: "person" }),
    entity("bob", { type: "person" }),
    entity("unrelated", { type: "system" }),
  ];
  // alice → ledger → bob, so bob is two hops from alice.
  const rels = [rel("alice", "ledger"), rel("ledger", "bob")];

  it("keeps the nodes connected to a match", () => {
    const ids = buildElements(graph, rels, { query: "ledger" }).nodes.map((n) => n.data.id);
    expect(ids.sort()).toEqual(["alice", "bob", "ledger"]);
  });

  it("flags which of them actually matched, so context is distinguishable", () => {
    const { nodes } = buildElements(graph, rels, { query: "ledger" });
    const byId = new Map(nodes.map((n) => [n.data.id, n.data.match]));
    expect(byId.get("ledger")).toBe(true);
    expect(byId.get("alice")).toBe(false);
    expect(byId.get("bob")).toBe(false);
  });

  it("stops at one hop", () => {
    // Matching alice keeps ledger; bob is two hops out and stays gone. Two hops from a
    // well-connected node is most of the graph, which filters nothing.
    const ids = buildElements(graph, rels, { query: "alice" }).nodes.map((n) => n.data.id);
    expect(ids.sort()).toEqual(["alice", "ledger"]);
  });

  it("drops a match's untouched siblings", () => {
    const ids = buildElements(graph, rels, { query: "ledger" }).nodes.map((n) => n.data.id);
    expect(ids).not.toContain("unrelated");
  });

  it("keeps the edges among what survived", () => {
    const { edges } = buildElements(graph, rels, { query: "ledger" });
    expect(edges).toHaveLength(2);
  });

  it("shows an isolated match alone rather than nothing", () => {
    const { nodes } = buildElements(graph, rels, { query: "unrelated" });
    expect(nodes.map((n) => n.data.id)).toEqual(["unrelated"]);
  });

  // The type gate must survive the expansion, or "show me only the people" stops being true
  // the moment somebody also types a name.
  it("does not let a neighbour escape the type gate", () => {
    const ids = buildElements(graph, rels, { type: "person", query: "alice" }).nodes.map(
      (n) => n.data.id,
    );
    expect(ids, "ledger is a system and the gate said people").toEqual(["alice"]);
  });

  it("marks everything as a match when there is no query to narrow by", () => {
    const { nodes } = buildElements(graph, rels);
    expect(nodes.every((n) => n.data.match)).toBe(true);
  });
});

// cose computes all-pairs repulsion synchronously on the main thread, so cost grows with the
// SQUARE of the node count — a big enough graph freezes the tab rather than rendering slowly.
// The server only caps a workspace at 4 MiB of encoded JSON, which is thousands of entities,
// so the ceiling has to be here and it has to be honest about what it dropped.
describe("buildElements — the node ceiling", () => {
  const many = (n: number, obs = (i: number) => i) =>
    Array.from({ length: n }, (_, i) => entity(`e${String(i).padStart(4, "0")}`, {
      observationCount: obs(i),
    }));

  it("draws everything when the graph is under the cap", () => {
    const { nodes, truncated } = buildElements(many(10), []);
    expect(nodes).toHaveLength(10);
    expect(truncated).toBe(0);
  });

  it("caps the nodes and reports how many it dropped", () => {
    const { nodes, truncated } = buildElements(many(40), [], { limit: 25 });
    expect(nodes).toHaveLength(25);
    expect(truncated).toBe(15);
  });

  it("keeps the most-observed when it has to choose", () => {
    const { nodes } = buildElements(many(10), [], { limit: 3 });
    // observationCount is the index here, so the highest indices must survive.
    expect(nodes.map((n) => n.data.observations).sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });

  // A cap that dropped the thing somebody just searched for would be indefensible.
  it("never drops a match in favour of a better-observed non-match", () => {
    const graph = [
      entity("needle", { observationCount: 0 }),
      ...many(20, (i) => 100 + i),
    ];
    const { nodes } = buildElements(graph, [], { limit: 3, query: "needle" });
    expect(nodes.map((n) => n.data.id)).toContain("needle");
  });

  it("has a default ceiling, so a caller that forgets cannot freeze the tab", () => {
    const { nodes, truncated } = buildElements(many(MAX_NODES + 50), []);
    expect(nodes).toHaveLength(MAX_NODES);
    expect(truncated).toBe(50);
  });

  it("drops the edges of nodes the cap removed", () => {
    const graph = many(6, () => 1);
    const rels = [rel("e0000", "e0005")];
    const { nodes, edges } = buildElements(graph, rels, { limit: 2 });
    expect(nodes).toHaveLength(2);
    // Whichever two survived, an edge to a dropped node would make Cytoscape throw.
    const ids = new Set(nodes.map((n) => n.data.id));
    for (const e of edges) {
      expect(ids.has(e.data.source) && ids.has(e.data.target)).toBe(true);
    }
  });
});
