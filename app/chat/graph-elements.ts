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
  /** How many nodes the limit dropped. Zero when the whole graph is drawn. */
  truncated: number;
  nodes: {
    data: {
      id: string;
      label: string;
      type: string;
      observations: number;
      /**
       * The entity's DEGREE, straight off `SummaryEntity.relationCount`.
       *
       * Carried rather than computed: the projection already counts it, and it is the degree
       * in the WHOLE graph — which is the honest number — whereas counting the drawn edges
       * would silently change with every filter.
       */
      relations: number;
      /** True when this node matched the filter itself, false when it is context. */
      match: boolean;
    };
    /** Deterministic seed position — see seedPosition. */
    position: { x: number; y: number };
  }[];
  edges: { data: { id: string; source: string; target: string; label: string } }[];
  /** The entity types present, so the legend and the palette agree on the set. */
  types: string[];
}

/**
 * Narrows the graph before it is drawn.
 *
 * `type` reuses the panel's existing type filter, so switching between the list and the map
 * keeps the same narrowing rather than each tab having its own idea of it. It is a HARD
 * gate: "show me only the people" has to stay true, which is also what it means in the list.
 *
 * `query` is a case-insensitive SUBSTRING match over the entity name — deliberately not the
 * Search tab's ranking, which is BM25 over names, types and observation text on the server.
 * Calling this a search would promise that; it filters what is already loaded, which is why
 * it is instant and why it cannot find an entity by something only its observations say.
 *
 * A query KEEPS THE NEIGHBOURS of what it matched. Reducing a graph to the matching nodes
 * alone strips exactly what a graph is for: an isolated node says nothing, and its
 * neighbours are the context that answers "how does this connect". Matches are flagged so
 * the drawing can tell them from the context it pulled in with them.
 *
 * One hop, not the closure — two hops out from a well-connected node is most of the graph.
 */
export interface GraphFilter {
  type?: string | null;
  query?: string;
  /**
   * Which relation types to draw. `null` or absent means EVERY type; `[]` means none.
   *
   * This is the one facet that does not remove entities. Hiding relations must not delete the
   * things they connect — a member asking to see fewer kinds of edge is not asking for the
   * layout to move, and an edge-only control that dropped nodes would move all of it.
   *
   * It gates the relations BEFORE the one-hop expansion, so with a query active, context nodes
   * are reached through visible relations only. Otherwise the map would draw a context node
   * with no visible edge to explain why it is there. Entities the member MATCHED are never
   * removed by this, and with no query every entity is a match — which is where the promise
   * above has to hold.
   */
  relationTypes?: string[] | null;
  /** Floor on observationCount, inclusive. Zero or absent draws everything. */
  minObservations?: number;
  /**
   * The match set, supplied instead of computing one from `query`.
   *
   * This is how the server's BM25 ranking reaches the map (GD-D2). Only NAMES cross that
   * boundary: the elements still come wholly from the browse projection, so the map does not
   * gain a second source of structure — only a second source of selection.
   *
   * An EMPTY set means "the server matched nothing", which is a real answer and draws nothing.
   * Treating it as "no filter" would silently answer a question nobody asked.
   */
  matchNames?: Set<string> | null;
  /** Hard ceiling on rendered nodes — see MAX_NODES. */
  limit?: number;
}

/**
 * The most nodes the map will draw.
 *
 * Not a style preference: `cose` computes all-pairs repulsion synchronously on the main
 * thread, so cost grows with the SQUARE of the node count and a big enough graph freezes the
 * tab rather than rendering slowly. The server only caps a workspace's graph at 4 MiB of
 * encoded JSON, which is thousands of entities, so the ceiling has to be here.
 *
 * Truncation is REPORTED, never silent: a capped picture that looks complete is worse than
 * one that says what it left out.
 */
export const MAX_NODES = 300;

export function buildElements(
  entities: SummaryEntity[],
  relations: Relation[],
  filter: GraphFilter = {},
): GraphElements {
  // The relation gate FIRST: this list is what both the expansion and the edges are built
  // from, so hiding a relation type hides it consistently in one place. `[]` is truthy, which
  // is what lets "no types" mean no edges rather than falling through to "all types".
  const visibleRelations = filter.relationTypes
    ? relations.filter((r) => filter.relationTypes!.includes(r.relationType))
    : relations;

  // Then the entity gates, so neighbours pulled in by a query still respect them.
  let pool = filter.type
    ? entities.filter((e) => (e.type || "unknown") === filter.type)
    : entities;
  const floor = filter.minObservations ?? 0;
  if (floor > 0) pool = pool.filter((e) => e.observationCount >= floor);

  // The match set. `matchNames` wins over `query` when both are present rather than
  // intersecting them — they are two implementations of the SAME predicate (which entities did
  // the member ask for), and combining them would apply a client-side name filter on top of a
  // server ranking that already read the observation text.
  const q = filter.query?.trim().toLowerCase();
  const names = filter.matchNames;
  const matched = new Set(
    names
      ? pool.filter((e) => names.has(e.name)).map((e) => e.name)
      : q
        ? pool.filter((e) => e.name.toLowerCase().includes(q)).map((e) => e.name)
        : pool.map((e) => e.name),
  );

  // Expand one hop, within the pool and over VISIBLE relations only. Only when something
  // narrowed: with no query and no supplied names every node is already a match and there is
  // nothing to expand.
  const narrowing = !!names || !!q;
  const keep = new Set(matched);
  if (narrowing) {
    const inPool = new Set(pool.map((e) => e.name));
    for (const r of visibleRelations) {
      if (matched.has(r.from) && inPool.has(r.to)) keep.add(r.to);
      if (matched.has(r.to) && inPool.has(r.from)) keep.add(r.from);
    }
  }

  const kept = pool.filter((e) => keep.has(e.name));

  // Capped by observation count, and MATCHES FIRST: a cap that dropped the entity somebody
  // just searched for would be indefensible. Within each group the most-observed come first,
  // as the closest available stand-in for "most substantial".
  const limit = filter.limit ?? MAX_NODES;
  const ranked = [...kept].sort((a, b) => {
    const am = matched.has(a.name) ? 1 : 0;
    const bm = matched.has(b.name) ? 1 : 0;
    if (am !== bm) return bm - am;
    return b.observationCount - a.observationCount;
  });
  const truncated = Math.max(0, ranked.length - limit);
  const entitiesShown = ranked.slice(0, limit);

  entities = entitiesShown;
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
      relations: e.relationCount,
      // False for a node kept only as a matched node's neighbour, so the drawing can show
      // which of these the member actually asked for.
      match: matched.has(e.name),
    },
    position: seedPosition(i, ordered.length),
  }));

  // Relations whose endpoints are not both present are DROPPED. The browse projection can
  // carry an edge to an entity outside the page, and Cytoscape throws on an edge naming a
  // node that does not exist — so this is not cosmetic, it is what keeps the graph from
  // failing to build at all.
  const edges = visibleRelations
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

  return { nodes, edges, types, truncated };
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
