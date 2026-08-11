import { describe, expect, it } from "vitest";
import { buildStylesheet, colorIndexFor, nodeDiameter } from "./graph-stylesheet";

// The encodings, as pure functions. `buildStylesheet` wraps them in a Cytoscape stylesheet, but
// the decisions worth pinning are the arithmetic and the colour mapping — and the colour mapping
// has to be shared with the legend, because a legend that disagreed with the graph is worse than
// no legend at all.

const PALETTE = ["#a", "#b", "#c", "#d", "#e", "#f"];

describe("nodeDiameter", () => {
  const data = { observations: 9, relations: 4, pagerank: 0.25, betweenness: 1 };

  // The map has drawn observations this way since it existed. A member who never opens the
  // encoding control must see the graph unchanged, so this formula is pinned literally.
  it("reproduces the map's existing observation sizing exactly", () => {
    expect(nodeDiameter("observations", data)).toBe(14 + Math.sqrt(9) * 4);
  });

  it("caps observations, so one heavily-observed entity cannot swamp the view", () => {
    const huge = nodeDiameter("observations", { ...data, observations: 100_000 });
    expect(huge).toBe(14 + Math.sqrt(100) * 4);
  });

  it("sizes degree on the same scale as observations, since both are counts", () => {
    expect(nodeDiameter("degree", data)).toBe(14 + Math.sqrt(4) * 4);
  });

  // Width ∝ √value means AREA ∝ value, which is the whole reason the observation encoding used
  // a square root. The normalised metrics have to keep that property or the two encodings would
  // exaggerate differently.
  it("keeps area proportional to the value for the normalised metrics", () => {
    expect(nodeDiameter("pagerank", data)).toBe(14 + Math.sqrt(0.25) * 40);
    expect(nodeDiameter("betweenness", data)).toBe(14 + Math.sqrt(1) * 40);
  });

  it("puts the strongest entity at the same size under either normalised metric", () => {
    const top = { observations: 0, relations: 0, pagerank: 1, betweenness: 1 };
    expect(nodeDiameter("pagerank", top)).toBe(nodeDiameter("betweenness", top));
  });

  // Metrics are written into node data by an effect AFTER the graph is built, and betweenness is
  // only computed when it is selected. So the stylesheet will be asked to size a node whose
  // metric is not there yet, and it must draw a small node rather than NaN — a NaN width makes
  // Cytoscape drop the node silently.
  it("treats a metric that has not arrived yet as zero, never as NaN", () => {
    const bare = { observations: 0, relations: 0 };
    expect(nodeDiameter("pagerank", bare)).toBe(14);
    expect(nodeDiameter("betweenness", bare)).toBe(14);
    expect(Number.isFinite(nodeDiameter("betweenness", bare))).toBe(true);
  });

  it("never returns a diameter below the floor", () => {
    for (const m of ["observations", "degree", "pagerank", "betweenness"] as const) {
      expect(nodeDiameter(m, { observations: 0, relations: 0 })).toBeGreaterThanOrEqual(14);
    }
  });
});

describe("colorIndexFor", () => {
  const domain = ["person", "project", "system"];

  it("is stable per entity type", () => {
    expect(colorIndexFor("type", "project", domain, 6)).toBe(
      colorIndexFor("type", "project", domain, 6),
    );
    expect(colorIndexFor("type", "person", domain, 6)).not.toBe(
      colorIndexFor("type", "system", domain, 6),
    );
  });

  it("maps a community or component id straight onto the palette", () => {
    expect(colorIndexFor("community", "0", domain, 6)).toBe(0);
    expect(colorIndexFor("community", "3", domain, 6)).toBe(3);
    expect(colorIndexFor("component", "2", domain, 6)).toBe(2);
  });

  it("wraps rather than running off the end of the palette", () => {
    for (let i = 0; i < 30; i++) {
      const idx = colorIndexFor("community", String(i), domain, 6);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(6);
    }
  });

  // A node whose community has not been computed yet carries no id. Falling through to a
  // negative or NaN index would ask Cytoscape for palette[NaN] and paint nothing.
  it("falls back to the first colour for a missing or unparseable value", () => {
    expect(colorIndexFor("community", "", domain, 6)).toBe(0);
    expect(colorIndexFor("community", "not a number", domain, 6)).toBe(0);
    expect(colorIndexFor("type", "never seen", domain, 6)).toBe(0);
  });
});

describe("buildStylesheet", () => {
  const palette = {
    types: PALETTE,
    fg: "#111",
    muted: "#888",
    bg: "#fff",
    edge: "#333",
  };
  const sheet = () =>
    buildStylesheet({
      palette,
      sizeBy: "observations",
      colorBy: "type",
      colorDomain: ["person"],
    });

  it("keeps the selectors the map's highlighting depends on", () => {
    // These classes are applied to the live graph and would silently stop meaning anything if
    // a stylesheet rebuild dropped their rules.
    const selectors = sheet().map((r) => r.selector);
    for (const s of [
      ".faded",
      "node.picked",
      "edge.near",
      "node.path",
      "edge.path",
      "node[!match]",
      "node",
      "edge",
    ]) {
      expect(selectors).toContain(s);
    }
  });

  // The traced route is an answer to a specific question, so its relation names are shown while
  // every other edge keeps them hidden.
  it("shows relation names on the traced path", () => {
    const edge = sheet().find((r) => r.selector === "edge.path")!;
    const style = (edge as unknown as { style: Record<string, unknown> }).style;
    expect(style["text-opacity"]).toBe(1);
  });

  it("hides relation labels by default, so they are not permanent noise", () => {
    const edge = sheet().find((r) => r.selector === "edge")!;
    // StylesheetJsonBlock is a union, so the style bag needs narrowing to be indexed.
    const style = (edge as unknown as { style: Record<string, unknown> }).style;
    expect(style["text-opacity"]).toBe(0);
  });
});
