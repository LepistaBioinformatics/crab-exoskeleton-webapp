import { describe, expect, it } from "vitest";
import { expandByHops, MAX_SHARE_NAMES } from "./graph-hops";
import type { Relation } from "@/lib/memoryGraph";

// What a shared graph fragment actually contains.
//
// Every case here is one where a wrong answer still looks like a graph: a neighbourhood
// missing the entities that point AT the selection, a radius that quietly reaches one hop
// further than the control says, a cycle that never terminates. None of those are visible
// in the payload after the fact, which is why the traversal is a function rather than a
// few lines inside the share handler.

const rel = (from: string, to: string, relationType = "relates_to"): Relation => ({
  from,
  to,
  relationType,
});

const names = (set: Set<string>) => [...set].sort();

// a → b → c → d in a line, plus an island nothing touches. A line is what makes the
// radius observable: from `a`, one hop is `b`, two is `c`, three is `d`.
const line: Relation[] = [rel("a", "b"), rel("b", "c"), rel("c", "d")];

describe("expandByHops — how far the fragment reaches", () => {
  it("reaches exactly one hop", () => {
    expect(names(expandByHops(["a"], line, 1))).toEqual(["a", "b"]);
  });

  it("reaches exactly two hops, and not three", () => {
    expect(names(expandByHops(["a"], line, 2))).toEqual(["a", "b", "c"]);
  });

  it("reaches exactly three hops, and never the island", () => {
    const withIsland = [...line, rel("island-x", "island-y")];
    expect(names(expandByHops(["a"], withIsland, 3))).toEqual(["a", "b", "c", "d"]);
  });

  it("stops early rather than inventing hops when the graph runs out", () => {
    expect(names(expandByHops(["c"], line, 3))).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the seeds alone at zero hops", () => {
    expect(names(expandByHops(["a", "c"], line, 0))).toEqual(["a", "c"]);
  });
});

// The constraint worth its own block: relations are stored in active voice, and reading
// them that way would hand the member half of every neighbourhood.
describe("expandByHops — a neighbour is a neighbour whichever end you came from", () => {
  it("includes what the seed points AT", () => {
    expect(names(expandByHops(["a"], [rel("a", "b")], 1))).toEqual(["a", "b"]);
  });

  it("includes what points at the seed, which the stored direction does not", () => {
    // `b` is only ever a `from`. Following `from` → `to` would answer ["c"] here.
    expect(names(expandByHops(["c"], [rel("b", "c")], 1))).toEqual(["b", "c"]);
  });

  it("walks a chain upstream and downstream at once", () => {
    // b sits in the middle of a → b → c, so one hop is the whole line.
    expect(names(expandByHops(["b"], line, 1))).toEqual(["a", "b", "c"]);
  });
});

describe("expandByHops — cycles and repeats", () => {
  it("terminates on a cycle instead of walking it forever", () => {
    const ring = [rel("a", "b"), rel("b", "c"), rel("c", "a")];
    expect(names(expandByHops(["a"], ring, 3))).toEqual(["a", "b", "c"]);
  });

  it("terminates on a self-relation", () => {
    expect(names(expandByHops(["a"], [rel("a", "a")], 3))).toEqual(["a"]);
  });

  it("counts an entity related twice only once", () => {
    const twice = [rel("a", "b", "knows"), rel("a", "b", "works_with"), rel("b", "a", "met")];
    expect(expandByHops(["a"], twice, 2).size).toBe(2);
  });

  it("does not re-add a neighbour that was already a seed", () => {
    expect(names(expandByHops(["a", "b"], line, 1))).toEqual(["a", "b", "c"]);
  });
});

describe("expandByHops — seeds the relations do not mention", () => {
  it("keeps an entity with no relations at all", () => {
    expect(names(expandByHops(["lonely"], line, 3))).toEqual(["lonely"]);
  });

  it("keeps a name this projection never carried, alongside one it did", () => {
    expect(names(expandByHops(["a", "ghost"], line, 1))).toEqual(["a", "b", "ghost"]);
  });

  it("returns nothing for no seeds, whatever the radius", () => {
    expect(expandByHops([], line, 3).size).toBe(0);
  });
});

describe("the share ceiling", () => {
  // The guard exists because three hops on a dense graph is most of the graph, and the
  // member cannot see that coming from a selection of one. A star with 400 points is the
  // cheapest shape that proves the expansion really can blow past the ceiling.
  it("is something a single seed can exceed in one hop", () => {
    const star = Array.from({ length: MAX_SHARE_NAMES * 2 }, (_, i) => rel("hub", `leaf-${i}`));
    expect(expandByHops(["hub"], star, 1).size).toBeGreaterThan(MAX_SHARE_NAMES);
  });
});
