import { describe, expect, it } from "vitest";
import cytoscape, { type Core } from "cytoscape";
import { applyHighlight } from "./graph-highlight";
import { findPath } from "./graph-paths";

// The highest-risk logic in the feature, and it was the only part with nothing testing it.
//
// The earlier excuse — "Cytoscape-instance behaviour, and jsdom has no canvas" — was wrong: a
// HEADLESS instance carries classes perfectly well, it just does not draw. graph-paths and
// graph-metrics already prove headless works here.

// a — b — c — d in a line, plus an unconnected island. A line is what makes hop radius
// observable: at radius 1 from `a` only `b` lights, at 2 also `c`, at 3 also `d`.
function line(): Core {
  return cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [
      { data: { id: "a" } },
      { data: { id: "b" } },
      { data: { id: "c" } },
      { data: { id: "d" } },
      { data: { id: "island" } },
      { data: { id: "ab", source: "a", target: "b", label: "r" } },
      { data: { id: "bc", source: "b", target: "c", label: "r" } },
      { data: { id: "cd", source: "c", target: "d", label: "r" } },
    ],
  });
}

const lit = (cy: Core) =>
  cy
    .nodes()
    .filter((n) => !n.hasClass("faded"))
    .map((n) => n.id() as string)
    .sort();

const IDLE = { selected: null, hopRadius: 1, path: null, pathMode: false, pathFrom: null };

describe("applyHighlight — selection and focus radius", () => {
  it("fades nothing when nothing is selected", () => {
    const cy = line();
    applyHighlight(cy, IDLE);
    expect(cy.elements().filter((e) => e.hasClass("faded")).length).toBe(0);
    cy.destroy();
  });

  it("lights one hop by default", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a" });
    expect(lit(cy)).toEqual(["a", "b"]);
    expect(cy.getElementById("a").hasClass("picked")).toBe(true);
    cy.destroy();
  });

  it("lights exactly two hops at radius 2, and not three", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a", hopRadius: 2 });
    expect(lit(cy)).toEqual(["a", "b", "c"]);
    cy.destroy();
  });

  it("lights exactly three hops at radius 3, and never the island", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a", hopRadius: 3 });
    expect(lit(cy)).toEqual(["a", "b", "c", "d"]);
    expect(cy.getElementById("island").hasClass("faded")).toBe(true);
    cy.destroy();
  });

  it("marks the edges within the neighbourhood so the relations can be read", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a" });
    expect(cy.getElementById("ab").hasClass("near")).toBe(true);
    cy.destroy();
  });

  it("does nothing for a selection that is not on this graph", () => {
    // The panel's select() accepts a name outside the drawn set — an insights row can be one.
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "never drawn" });
    expect(cy.elements().filter((e) => e.hasClass("faded")).length).toBe(0);
    cy.destroy();
  });
});

// The reason wave 0 restructured this into one effect. Two effects would each clear and reapply,
// and whichever ran last would own the fade.
describe("applyHighlight — a path and a selection cannot clobber each other", () => {
  it("shows the path and drops the selection's fading when both are set", () => {
    const cy = line();
    const path = findPath(cy, "a", "c");
    applyHighlight(cy, { ...IDLE, selected: "island", path, pathMode: true });
    expect(lit(cy)).toEqual(["a", "b", "c"]);
    expect(cy.getElementById("a").hasClass("path")).toBe(true);
    expect(cy.getElementById("ab").hasClass("path")).toBe(true);
    // The selection's own classes must be gone, not layered underneath.
    expect(cy.getElementById("island").hasClass("picked")).toBe(false);
    cy.destroy();
  });

  it("falls back to the selection once the path is cleared", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a", path: findPath(cy, "a", "c"), pathMode: true });
    applyHighlight(cy, { ...IDLE, selected: "a" });
    expect(lit(cy)).toEqual(["a", "b"]);
    expect(cy.elements().filter((e) => e.hasClass("path")).length).toBe(0);
    cy.destroy();
  });

  it("marks the first endpoint while the second is still being chosen", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, pathMode: true, pathFrom: "c" });
    expect(cy.getElementById("c").hasClass("picked")).toBe(true);
    // Nothing is faded yet: there is no answer to narrow to.
    expect(cy.elements().filter((e) => e.hasClass("faded")).length).toBe(0);
    cy.destroy();
  });

  it("leaves the graph alone for an unreachable path rather than fading all of it", () => {
    const cy = line();
    const path = findPath(cy, "a", "island");
    expect(path.kind).toBe("unreachable");
    applyHighlight(cy, { ...IDLE, path, pathMode: true });
    expect(cy.elements().filter((e) => e.hasClass("faded")).length).toBe(0);
    cy.destroy();
  });

  // A blanked graph looks like a bug rather than like an answer.
  it("bails instead of fading everything when the path names elements this graph lacks", () => {
    const cy = line();
    applyHighlight(cy, {
      ...IDLE,
      pathMode: true,
      path: {
        kind: "found",
        nodes: ["ghost", "phantom"],
        edgeIds: ["nope"],
        steps: [{ from: "ghost", to: "phantom", relation: "r", reversed: false }],
        missing: [],
      },
    });
    expect(cy.elements().filter((e) => e.hasClass("faded")).length).toBe(0);
    cy.destroy();
  });
});

// After a rebuild the instance is fresh and carries no classes, while `selected` has not changed.
// The pre-existing bug wave 0 fixed was an effect that skipped the reapply in exactly that case.
describe("applyHighlight — reapplying is always safe", () => {
  it("produces the same result on a fresh graph as on one already highlighted", () => {
    const first = line();
    applyHighlight(first, { ...IDLE, selected: "b", hopRadius: 2 });
    const once = lit(first);

    const second = line();
    applyHighlight(second, { ...IDLE, selected: "island" });
    applyHighlight(second, { ...IDLE, selected: "b", hopRadius: 2 });
    expect(lit(second)).toEqual(once);

    first.destroy();
    second.destroy();
  });

  it("clears every class it owns before reapplying", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a" });
    applyHighlight(cy, IDLE);
    for (const c of ["faded", "near", "picked", "path", "checked", "reached"]) {
      expect(cy.elements().filter((e) => e.hasClass(c)).length, c).toBe(0);
    }
    cy.destroy();
  });
});

// The multi-select, drawn on the map. Its own block because it is the one highlight that is
// NOT a claimant on `faded`: it says which nodes the member ticked, which stays true while a
// path is traced or another entity is open. Applied here rather than in a second effect for
// the reason the whole module exists — a rebuild hands back an instance carrying no classes.
describe("applyHighlight — the multi-select", () => {
  const ticked = (cy: Core) =>
    cy
      .nodes()
      .filter((n) => n.hasClass("checked"))
      .map((n) => n.id() as string)
      .sort();

  it("marks exactly the ticked nodes", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, checked: new Set(["a", "c"]) });
    expect(ticked(cy)).toEqual(["a", "c"]);
    cy.destroy();
  });

  it("marks nothing when nothing is ticked", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, checked: new Set() });
    expect(ticked(cy)).toEqual([]);
    cy.destroy();
  });

  it("ignores a ticked name this graph does not have", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, checked: new Set(["a", "not-here"]) });
    expect(ticked(cy)).toEqual(["a"]);
    cy.destroy();
  });

  // The precedence chain returns early for a path and mid-trace, so a tick applied inside it
  // would vanish the moment the member traced something.
  it("survives a traced path, which returns before the selection is considered", () => {
    const cy = line();
    const path = findPath(cy, "a", "c");
    applyHighlight(cy, { ...IDLE, path, checked: new Set(["island"]) });
    expect(ticked(cy)).toEqual(["island"]);
    cy.destroy();
  });

  it("survives a half-picked path trace", () => {
    const cy = line();
    applyHighlight(cy, {
      ...IDLE,
      pathMode: true,
      pathFrom: "a",
      checked: new Set(["d"]),
    });
    expect(ticked(cy)).toEqual(["d"]);
    cy.destroy();
  });

  it("is independent of the open entity: a node can be both", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a", checked: new Set(["a"]) });
    expect(cy.getElementById("a").hasClass("checked")).toBe(true);
    expect(cy.getElementById("a").hasClass("picked")).toBe(true);
    cy.destroy();
  });
});

// The share's reach, drawn on the map.
//
// Without it, raising the share's hop control changed the count on screen and left the picture
// identical — the member was asked to publish a fragment they could not see. Two things have to
// hold: an arrival is drawn DIFFERENTLY from a seed (one was chosen, the other came along), and
// an arrival outside the focus radius is not quietly faded to nothing.
describe("applyHighlight — the share's reach", () => {
  const reached = (cy: Core) =>
    cy
      .nodes()
      .filter((n) => n.hasClass("reached"))
      .map((n) => n.id() as string)
      .sort();

  it("marks what the share reached, and not the seeds it started from", () => {
    const cy = line();
    applyHighlight(cy, {
      ...IDLE,
      checked: new Set(["a"]),
      shareNames: new Set(["a", "b", "c"]),
    });
    expect(reached(cy)).toEqual(["b", "c"]);
    expect(cy.getElementById("a").hasClass("checked")).toBe(true);
    // Disjoint, so "what the member chose" stays readable off the classes alone.
    expect(cy.getElementById("a").hasClass("reached")).toBe(false);
    cy.destroy();
  });

  it("marks nothing when the share carries only the seeds", () => {
    const cy = line();
    applyHighlight(cy, { ...IDLE, checked: new Set(["a"]), shareNames: new Set(["a"]) });
    expect(reached(cy)).toEqual([]);
    cy.destroy();
  });

  it("ignores a shared name this graph does not draw", () => {
    // The expansion runs over the WHOLE graph's relations, so it can name an entity the map
    // left out under a filter or the node ceiling.
    const cy = line();
    applyHighlight(cy, { ...IDLE, shareNames: new Set(["b", "not-here"]) });
    expect(reached(cy)).toEqual(["b"]);
    cy.destroy();
  });

  // The focus radius and the share's hops are different numbers on purpose, so the share
  // normally reaches past what the selection leaves lit. A class under `opacity: 0.1` is not
  // a highlight.
  it("keeps the reach out of the fade when an entity is open", () => {
    const cy = line();
    applyHighlight(cy, {
      ...IDLE,
      selected: "a",
      hopRadius: 1,
      checked: new Set(["a"]),
      shareNames: new Set(["a", "b", "c"]),
    });
    expect(lit(cy)).toEqual(["a", "b", "c"]);
    expect(cy.getElementById("c").hasClass("reached")).toBe(true);
    // Still nothing beyond it: the exemption is the share set, not a wider radius.
    expect(cy.getElementById("d").hasClass("faded")).toBe(true);
    cy.destroy();
  });

  // The mangrove extracts the relations among the names it is given, so an edge between two
  // shared entities is part of the payload and drawing it as good as invisible would
  // misdescribe what travels.
  it("keeps the edges between shared entities out of the fade too", () => {
    const cy = line();
    applyHighlight(cy, {
      ...IDLE,
      selected: "a",
      hopRadius: 1,
      shareNames: new Set(["a", "b", "c"]),
    });
    expect(cy.getElementById("bc").hasClass("faded")).toBe(false);
    // `near` means "inside the focus radius", which this edge is not — exempt is not lit.
    expect(cy.getElementById("bc").hasClass("near")).toBe(false);
    expect(cy.getElementById("cd").hasClass("faded")).toBe(true);
    cy.destroy();
  });

  it("survives a traced path, like the ticks it sits beside", () => {
    const cy = line();
    const path = findPath(cy, "a", "c");
    applyHighlight(cy, { ...IDLE, path, shareNames: new Set(["island"]) });
    expect(reached(cy)).toEqual(["island"]);
    cy.destroy();
  });

  it("marks nothing when no share is on offer", () => {
    // No mangrove, no share — the panel passes nothing, and the map draws ticks only.
    const cy = line();
    applyHighlight(cy, { ...IDLE, selected: "a", checked: new Set(["a"]) });
    expect(reached(cy)).toEqual([]);
    expect(lit(cy)).toEqual(["a", "b"]);
    cy.destroy();
  });
});
