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
  nodes: { data: { id: string; label: string; type: string; observations: number } }[];
  edges: { data: { id: string; source: string; target: string; label: string } }[];
  /** The entity types present, so the legend and the palette agree on the set. */
  types: string[];
}

export function buildElements(
  entities: SummaryEntity[],
  relations: Relation[],
): GraphElements {
  const present = new Set(entities.map((e) => e.name));

  const nodes = entities.map((e) => ({
    data: {
      id: e.name,
      label: e.name,
      type: e.type || "unknown",
      observations: e.observationCount,
    },
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
