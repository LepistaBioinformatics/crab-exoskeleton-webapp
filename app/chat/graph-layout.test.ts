import { describe, it, expect } from "vitest";
import { layoutGraph, neighbourhood, radiusFor } from "./graph-layout";
import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

// Structural assertions, not coordinates. d3-force jiggles coincident nodes with
// Math.random, so exact positions are not reproducible — and pinning them would test the
// library rather than this module. What matters is that every node gets a finite position,
// that edges resolve to real nodes, and that an edge pointing outside the set is dropped
// rather than crashing the simulation or drawing into empty space.

const BOX = { width: 800, height: 600 };

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

function relation(from: string, to: string): Relation {
  return { from, to, relationType: "maintains" };
}

describe("layoutGraph", () => {
  it("gives every node a finite position", () => {
    const { nodes } = layoutGraph(
      [entity("ledger"), entity("alice"), entity("assay")],
      [relation("alice", "ledger")],
      BOX,
    );
    expect(nodes).toHaveLength(3);
    for (const n of nodes) {
      expect(Number.isFinite(n.x), `${n.id} has no x`).toBe(true);
      expect(Number.isFinite(n.y), `${n.id} has no y`).toBe(true);
    }
  });

  it("resolves each edge to the node objects, so the view can read their positions", () => {
    const { edges, nodes } = layoutGraph(
      [entity("ledger"), entity("alice")],
      [relation("alice", "ledger")],
      BOX,
    );
    expect(edges).toHaveLength(1);
    expect(nodes).toContain(edges[0].source);
    expect(nodes).toContain(edges[0].target);
    expect(edges[0].label).toBe("maintains");
  });

  // The browse projection can carry an edge to an entity outside the page. Keeping it
  // would either crash forceLink or draw a line into nothing.
  it("drops a relation whose endpoint is not in the set", () => {
    const { edges } = layoutGraph(
      [entity("ledger")],
      [relation("ledger", "somewhere-else"), relation("nobody", "ledger")],
      BOX,
    );
    expect(edges).toHaveLength(0);
  });

  it("separates nodes rather than stacking them", () => {
    const { nodes } = layoutGraph(
      [entity("a"), entity("b"), entity("c"), entity("d")],
      [],
      BOX,
    );
    const seen = new Set(nodes.map((n) => `${Math.round(n.x)}:${Math.round(n.y)}`));
    expect(seen.size, "nodes settled on top of each other").toBe(nodes.length);
  });

  it("reports bounds that contain every node", () => {
    const { nodes, bounds } = layoutGraph(
      [entity("a"), entity("b"), entity("c")],
      [relation("a", "b")],
      BOX,
    );
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(n.x).toBeLessThanOrEqual(bounds.maxX);
      expect(n.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(n.y).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  it("returns usable bounds for an empty graph instead of Infinity", () => {
    const { nodes, bounds } = layoutGraph([], [], BOX);
    expect(nodes).toHaveLength(0);
    expect(Number.isFinite(bounds.minX)).toBe(true);
    expect(Number.isFinite(bounds.maxY)).toBe(true);
  });
});

describe("radiusFor", () => {
  // Square root, so area tracks the count: a 100-observation entity must not be twenty
  // times the width of a 5-observation one.
  it("grows with observations but sub-linearly", () => {
    expect(radiusFor(0)).toBeLessThan(radiusFor(4));
    expect(radiusFor(4)).toBeLessThan(radiusFor(100));
    expect(radiusFor(100) / radiusFor(4)).toBeLessThan(3);
  });

  it("caps, so one runaway entity cannot swamp the view", () => {
    expect(radiusFor(10_000)).toBe(radiusFor(100));
  });
});

describe("neighbourhood", () => {
  const layout = layoutGraph(
    [entity("ledger"), entity("alice"), entity("bob"), entity("unrelated")],
    [relation("alice", "ledger"), relation("bob", "ledger")],
    BOX,
  );

  it("includes the entity and everything one hop away", () => {
    const { nodes } = neighbourhood(layout, "ledger");
    expect([...nodes].sort()).toEqual(["alice", "bob", "ledger"]);
  });

  it("excludes nodes that only connect through another", () => {
    const { nodes } = neighbourhood(layout, "alice");
    expect(nodes.has("ledger")).toBe(true);
    // bob reaches alice only via ledger — two hops. Including it would grow to most of
    // the graph, which dims nothing and answers nothing.
    expect(nodes.has("bob")).toBe(false);
  });

  it("returns just the entity when nothing touches it", () => {
    const { nodes, edges } = neighbourhood(layout, "unrelated");
    expect([...nodes]).toEqual(["unrelated"]);
    expect(edges.size).toBe(0);
  });
});

// The map tab exists to show the SHAPE of the graph, not to become a second data path.
// It reads the same browse projection the list reads, which is what makes selecting a node
// open the panel's existing detail pane — and that pane is where provenance already lives.
// So the contract to hold is that a layout is derivable from exactly the browse projection,
// with no field the list does not already have.
describe("the map reads the browse projection and nothing more", () => {
  it("needs only name, type, observationCount and relationCount from an entity", () => {
    // Deliberately built as the minimal SummaryEntity: if layoutGraph ever reaches for a
    // field only the FULL projection carries (entityType, observations[]), this stops
    // compiling or throws, rather than silently forcing a second fetch per visit.
    const minimal = {
      name: "ledger",
      type: "system",
      observationCount: 2,
      relationCount: 0,
    } as SummaryEntity;
    const { nodes } = layoutGraph([minimal], [], { width: 400, height: 300 });
    expect(nodes[0].id).toBe("ledger");
    expect(nodes[0].type).toBe("system");
    expect(nodes[0].observations).toBe(2);
  });

  it("uses relations exactly as the browse response carries them", () => {
    const { edges } = layoutGraph(
      [entity("a"), entity("b")],
      [{ from: "a", to: "b", relationType: "feeds" }],
      { width: 400, height: 300 },
    );
    expect(edges[0].label).toBe("feeds");
  });
});
