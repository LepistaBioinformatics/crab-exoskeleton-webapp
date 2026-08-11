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
    for (const c of ["faded", "near", "picked", "path"]) {
      expect(cy.elements().filter((e) => e.hasClass(c)).length, c).toBe(0);
    }
    cy.destroy();
  });
});
