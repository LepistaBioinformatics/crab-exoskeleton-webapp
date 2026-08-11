import { describe, expect, it } from "vitest";
import { isDefaultTools, MAP_TOOLS_DEFAULTS } from "./use-map-tools";

// The defaults are the part worth pinning. Each one is a spec decision, not a coding
// convenience, and each is stated in spec.md — so a change here should have to break a
// test rather than slip through as a one-character edit.
//
// The hook itself is a `useState` over this object. The suite runs `environment: "node"`
// with no React renderer for hooks, and wrapping a spread in a reducer just to have
// something to assert would be testing the language, not the decision.

describe("MAP_TOOLS_DEFAULTS", () => {
  it("opens on the encodings the map already had, so nothing changes on first paint", () => {
    // GD-B2 / GD-B3: observations and type are what the map draws today. A member who
    // never touches the tools must see exactly the graph they saw before this feature.
    expect(MAP_TOOLS_DEFAULTS.sizeBy).toBe("observations");
    expect(MAP_TOOLS_DEFAULTS.colorBy).toBe("type");
  });

  it("focuses one hop, not the transitive closure", () => {
    // GD-A4, and inherited from knowledge-graph-map's GM-2: two hops out from a
    // well-connected node is most of the graph, which dims nothing and answers nothing.
    expect(MAP_TOOLS_DEFAULTS.hopRadius).toBe(1);
  });

  it("filters nothing until asked", () => {
    // `null` is "every relation type", NOT "no relation types". An empty array would be
    // a legitimate value meaning the opposite, so the distinction is load-bearing.
    expect(MAP_TOOLS_DEFAULTS.relationTypes).toBeNull();
    expect(MAP_TOOLS_DEFAULTS.minObservations).toBe(0);
  });

  it("searches names, not contents, until asked", () => {
    // GD-D1: content search costs a request. The instant client-side filter is the
    // default because it is what the input has always done.
    expect(MAP_TOOLS_DEFAULTS.searchScope).toBe("names");
  });
});

// Decides whether the reset control is offered. A reset button that cannot change anything is
// noise; one that stays lit after a reset is worse, because it implies leftover state.
describe("isDefaultTools", () => {
  it("recognises the untouched defaults", () => {
    expect(isDefaultTools(MAP_TOOLS_DEFAULTS)).toBe(true);
  });

  // Field-by-field, not by identity: useMapTools replaces the object on every change, so an
  // identity check would report "dirty" forever after the first click — including after a reset.
  it("recognises a fresh copy of the defaults, not just the same object", () => {
    expect(isDefaultTools({ ...MAP_TOOLS_DEFAULTS })).toBe(true);
  });

  it("spots each field individually", () => {
    const cases: Partial<typeof MAP_TOOLS_DEFAULTS>[] = [
      { minObservations: 1 },
      { sizeBy: "pagerank" },
      { colorBy: "community" },
      { hopRadius: 2 },
      { searchScope: "contents" },
      { relationTypes: ["knows"] },
    ];
    for (const over of cases) {
      expect(isDefaultTools({ ...MAP_TOOLS_DEFAULTS, ...over }), JSON.stringify(over)).toBe(false);
    }
  });

  // `[]` means "hide every relation" — a deliberate state, and precisely the one a member is most
  // likely to want undone. Treating it as the default would leave them with no way back.
  it("treats an empty relation-type list as dirty, not as 'all'", () => {
    expect(isDefaultTools({ ...MAP_TOOLS_DEFAULTS, relationTypes: [] })).toBe(false);
  });
});
