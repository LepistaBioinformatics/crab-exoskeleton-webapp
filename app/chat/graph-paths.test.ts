import { describe, expect, it } from "vitest";
import cytoscape, { type Core } from "cytoscape";
import { findPath } from "./graph-paths";

// findPath takes a Core so that in production it can run against the LIVE, rendered graph — a
// path that cannot be drawn cannot be shown (GD-C6) — and in tests against a headless one.

function graph(): Core {
  return cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [
      { data: { id: "alice" } },
      { data: { id: "ledger" } },
      { data: { id: "bob" } },
      { data: { id: "island" } },
      // alice → ledger → bob. Note the SECOND edge is stored pointing backwards relative to
      // the direction the path walks it.
      { data: { id: "e1", source: "alice", target: "ledger", label: "maintains" } },
      { data: { id: "e2", source: "bob", target: "ledger", label: "reviews" } },
    ],
  });
}

describe("findPath", () => {
  it("finds the chain between two connected entities", () => {
    const cy = graph();
    const r = findPath(cy, "alice", "bob");
    expect(r.kind).toBe("found");
    expect(r.nodes).toEqual(["alice", "ledger", "bob"]);
    expect(r.edgeIds).toEqual(["e1", "e2"]);
    cy.destroy();
  });

  it("reads the graph UNDIRECTED, so a path exists against the arrows", () => {
    // `bob → ledger` is stored that way, so a directed search from alice could never reach bob.
    // The agent writes this graph with no direction convention, so a directed search would
    // answer "no path" for most real questions (context.md D-4).
    const cy = graph();
    expect(findPath(cy, "alice", "bob").kind).toBe("found");
    cy.destroy();
  });

  it("records each step's real direction, so the chain cannot state a false one", () => {
    const cy = graph();
    const { steps } = findPath(cy, "alice", "bob");
    expect(steps).toEqual([
      { from: "alice", to: "ledger", relation: "maintains", reversed: false },
      // Walked ledger → bob, but STORED as bob → ledger. Rendering this as "ledger —reviews→
      // bob" would assert a relation the agent never wrote.
      { from: "ledger", to: "bob", relation: "reviews", reversed: true },
    ]);
    cy.destroy();
  });

  // THE TRAP, and the reason GD-C5 is a requirement rather than a note. Measured before this
  // module existed: for an unreachable target `distanceTo` is Infinity but `pathTo` returns a
  // collection of length ONE — the target node by itself. A `path.length === 0` guard never
  // fires, so a length-based check would highlight one unconnected node and call it a path.
  it("reports an unreachable entity as unreachable, not as a one-node path", () => {
    const cy = graph();
    const r = findPath(cy, "alice", "island");
    expect(r.kind).toBe("unreachable");
    expect(r.nodes).toEqual([]);
    expect(r.steps).toEqual([]);
    cy.destroy();
  });

  it("tells an absent endpoint apart from an unreachable one", () => {
    // Different facts with different fixes: one is "clear a filter", the other is "these two
    // really are not connected". GD-C6.
    const cy = graph();
    const r = findPath(cy, "alice", "never drawn");
    expect(r.kind).toBe("endpoint-missing");
    expect(r.missing).toEqual(["never drawn"]);
    cy.destroy();
  });

  it("names both endpoints when neither is on the map", () => {
    const cy = graph();
    expect(findPath(cy, "ghost", "phantom").missing).toEqual(["ghost", "phantom"]);
    cy.destroy();
  });

  it("takes the shorter way round when there are two", () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: false,
      elements: [
        { data: { id: "a" } },
        { data: { id: "b" } },
        { data: { id: "mid" } },
        { data: { id: "long1" } },
        { data: { id: "long2" } },
        { data: { id: "s1", source: "a", target: "mid", label: "r" } },
        { data: { id: "s2", source: "mid", target: "b", label: "r" } },
        { data: { id: "l1", source: "a", target: "long1", label: "r" } },
        { data: { id: "l2", source: "long1", target: "long2", label: "r" } },
        { data: { id: "l3", source: "long2", target: "b", label: "r" } },
      ],
    });
    expect(findPath(cy, "a", "b").nodes).toEqual(["a", "mid", "b"]);
    cy.destroy();
  });

  it("handles an entity picked as both ends without inventing a step", () => {
    const cy = graph();
    const r = findPath(cy, "alice", "alice");
    expect(r.kind).toBe("found");
    expect(r.nodes).toEqual(["alice"]);
    expect(r.steps).toEqual([]);
    cy.destroy();
  });

  it("labels a relation the agent stored without a type, rather than emitting undefined", () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: false,
      elements: [
        { data: { id: "a" } },
        { data: { id: "b" } },
        { data: { id: "e", source: "a", target: "b" } },
      ],
    });
    expect(findPath(cy, "a", "b").steps[0].relation).toBe("");
    cy.destroy();
  });
});
