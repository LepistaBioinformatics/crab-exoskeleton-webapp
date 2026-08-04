import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

// The knowledge graph as Cytoscape elements.
//
// Cytoscape owns the layout, the rendering, pan/zoom, hit-testing and the label collision
// handling — all of which were hand-rolled before and were the reason the map read as a
// quarter-scale thumbnail with overlapping text. What stays ours is this: turning the
// browse projection into elements, which is the part that has to agree with the panel.
//
// Pure and separate from the component so it can be tested without a canvas: jsdom has no
// WebGL and Cytoscape needs a real container, so a render test would prove nothing while
// the mapping is where a wrong answer is invisible.

export interface GraphElements {
  nodes: {
    data: { id: string; label: string; type: string; observations: number };
    /** Deterministic seed position — see seedPosition. */
    position: { x: number; y: number };
  }[];
  edges: { data: { id: string; source: string; target: string; label: string } }[];
  /** The entity types present, so the legend and the palette agree on the set. */
  types: string[];
}

export function buildElements(
  entities: SummaryEntity[],
  relations: Relation[],
): GraphElements {
  const present = new Set(entities.map((e) => e.name));

  // Sorted by name so the seed depends on the SET of entities, not on the order the API
  // happened to return them. Two visits to an unchanged graph then seed identically.
  const ordered = [...entities].sort((a, b) => a.name.localeCompare(b.name));

  const nodes = ordered.map((e, i) => ({
    data: {
      id: e.name,
      label: e.name,
      type: e.type || "unknown",
      observations: e.observationCount,
    },
    position: seedPosition(i, ordered.length),
  }));

  // Relations whose endpoints are not both present are DROPPED. The browse projection can
  // carry an edge to an entity outside the page, and Cytoscape throws on an edge naming a
  // node that does not exist — so this is not cosmetic, it is what keeps the graph from
  // failing to build at all.
  const edges = relations
    .filter((r) => present.has(r.from) && present.has(r.to))
    .map((r, i) => ({
      data: {
        // Cytoscape requires unique edge ids, and two entities can be related twice with
        // different relation types — so the index is part of the id rather than just the
        // endpoint pair.
        id: `${r.from}→${r.to}#${i}`,
        source: r.from,
        target: r.to,
        label: r.relationType,
      },
    }));

  const types = [...new Set(nodes.map((n) => n.data.type))].sort();

  return { nodes, edges, types };
}

/**
 * A deterministic starting point for node `i` of `n`, on a phyllotaxis spiral.
 *
 * This exists so the map is REPRODUCIBLE. Cytoscape's cose layout randomises initial
 * placement, so leaving the tab and coming back reshuffled the whole picture — which
 * destroys the thing a graph view is for: a member builds a mental map of their own graph
 * and expects it to still be there. Seeded from a sorted index and run with
 * `randomize: false`, the same entity set lays out the same way every time.
 *
 * A spiral rather than a grid because cose relaxes from it: a grid seeds rows that survive
 * as visible banding, while a spiral has no axis to leave behind.
 */
export function seedPosition(i: number, n: number): { x: number; y: number } {
  // Golden angle: the classic even-spread spiral, and it needs no randomness.
  const angle = i * 2.399963229728653;
  const radius = 30 * Math.sqrt(i + 0.5);
  // Centred on nothing in particular — cose recentres — but scaled with the node count so a
  // large graph does not start with everything piled at the origin.
  const scale = 1 + Math.log10(Math.max(n, 1));
  return {
    x: Math.round(radius * Math.cos(angle) * scale),
    y: Math.round(radius * Math.sin(angle) * scale),
  };
}

/**
 * A stable colour index per entity type.
 *
 * By TYPE rather than per entity: the type is the one axis that partitions the graph
 * cleanly (one value per entity), so colouring by it means the picture answers "where are
 * the people / the systems" at a glance. Index rather than a literal colour, because the
 * palette has to come from the app's CSS vars at render time — a baked hex would not flip
 * with the theme.
 */
export function typeColorIndex(types: string[], type: string, paletteSize: number): number {
  const i = types.indexOf(type);
  return i < 0 ? 0 : i % paletteSize;
}
