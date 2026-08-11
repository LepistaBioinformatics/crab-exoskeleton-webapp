import cytoscape, { type Core } from "cytoscape";
import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

// Whole-graph metrics for the map's analytic readings.
//
// Computed over the WHOLE graph, not over what is currently drawn (context.md D-2): "most
// central" is a property of the graph, and a ranking that changed as the member narrowed a
// filter would read as a bug rather than as a definition. The cost is one headless Cytoscape
// construction per call.
//
// Split into three functions by COST, not by tidiness. PageRank and connected components are
// cheap enough to run on every load; Markov clustering and betweenness are not, so they only
// run when the encoding that needs them is actually selected (GD-B1).
//
// DEGREE IS NOT HERE. `SummaryEntity.relationCount` already is the degree, and it is the degree
// in the whole graph — computing it would be inventing work and inviting disagreement.
//
// Every function here returns plain Maps keyed by entity name. Cytoscape's own results are
// ACCESSOR OBJECTS (`pageRank(...).rank(node)`, `betweennessCentrality(...).betweenness(node)`),
// which is the detail that makes code written against the obvious guess return undefined while
// still compiling — so the conversion happens once, here, and never leaks out.

/**
 * A headless graph over the full projection.
 *
 * `headless: true` with `styleEnabled: false` is the documented way to get a Core in a browser
 * with no container and no styling work. It also works under vitest's `node` environment, which
 * is what makes all of this testable.
 *
 * Relations with an endpoint outside the projection are DROPPED, the same rule buildElements
 * uses — Cytoscape throws on an edge naming a node that does not exist, and here that would
 * take down the whole panel rather than just the metric.
 *
 * `reciprocal` adds the reverse of every relation. **This is not optional decoration for
 * PageRank.** Cytoscape's `pageRank` is DIRECTED and has no undirected option, and this graph
 * has no direction convention — the agent writes `a knows b` or `b knows a` as it pleases. On
 * the directed reading, an entity every relation points AT becomes a rank sink and every entity
 * pointing at it scores exactly what an entity with no relations at all scores. That was
 * measured, not assumed: `c → hub` gave `c` the same rank as an unconnected entity.
 *
 * Betweenness passes `false`: it computes undirected itself, and handing it two parallel edges
 * per relation would change what it is counting.
 */
function headlessGraph(
  entities: SummaryEntity[],
  relations: Relation[],
  reciprocal = false,
): Core {
  const present = new Set(entities.map((e) => e.name));
  const edges = relations.filter((r) => present.has(r.from) && present.has(r.to));
  return cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [
      ...entities.map((e) => ({ data: { id: e.name } })),
      ...edges.map((r, i) => ({
        data: { id: `${r.from}→${r.to}#${i}`, source: r.from, target: r.to },
      })),
      ...(reciprocal
        ? edges.map((r, i) => ({
            data: { id: `${r.to}←${r.from}#${i}`, source: r.to, target: r.from },
          }))
        : []),
    ],
  });
}

/**
 * Divide through by the largest value, so the result is a proportion of the strongest entity.
 *
 * Raw PageRank sums to 1 across the graph, which on a few hundred entities means every value is
 * a thousandth of something — unusable as a node diameter. Betweenness is unbounded above for
 * the same reason in reverse.
 *
 * A max of zero returns zeros rather than NaN: on a graph where nobody lies between anybody
 * (a single edge, or none at all) the divisor is legitimately zero.
 */
function normalise(raw: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  if (max === 0) return new Map([...raw.keys()].map((k) => [k, 0]));
  return new Map([...raw.entries()].map(([k, v]) => [k, v / max]));
}

export interface BaseMetrics {
  /** PageRank, normalised to (0, 1] against the strongest entity. */
  pagerank: Map<string, number>;
  /** An arbitrary but stable component id per entity. Equal ids mean "reachable from". */
  component: Map<string, number>;
  /** Entities alone in their own component — what the agent knows but never connected. */
  isolated: string[];
}

/** The metrics cheap enough to compute on every graph load. */
export function computeBaseMetrics(
  entities: SummaryEntity[],
  relations: Relation[],
): BaseMetrics {
  if (entities.length === 0) {
    return { pagerank: new Map(), component: new Map(), isolated: [] };
  }

  // Reciprocal: see headlessGraph. A directed PageRank on this graph scores a leaf the same as
  // an orphan, which is worse than not offering the metric.
  const cy = headlessGraph(entities, relations, true);
  try {
    const pr = cy.elements().pageRank({});
    const raw = new Map<string, number>();
    for (const e of entities) raw.set(e.name, pr.rank(cy.getElementById(e.name)));

    const component = new Map<string, number>();
    const isolated: string[] = [];
    cy.elements()
      .components()
      .forEach((comp, i) => {
        const names = comp.nodes().map((n) => n.id() as string);
        for (const name of names) component.set(name, i);
        if (names.length === 1) isolated.push(names[0]);
      });

    return { pagerank: normalise(raw), component, isolated: isolated.sort() };
  } finally {
    cy.destroy();
  }
}

/**
 * Betweenness centrality, normalised. On demand only.
 *
 * O(n·m): fine for the few hundred entities a member's graph holds, and not something to run
 * speculatively on a graph the server only caps at 4 MiB of encoded JSON.
 *
 * Undirected, which is Cytoscape's default and the right reading here — the agent writes this
 * graph with no direction convention, so directed betweenness would measure a structure that
 * is not really there.
 */
export function computeBetweenness(
  entities: SummaryEntity[],
  relations: Relation[],
): Map<string, number> {
  if (entities.length === 0) return new Map();

  const cy = headlessGraph(entities, relations);
  try {
    const bc = cy.elements().betweennessCentrality({});
    const raw = new Map<string, number>();
    for (const e of entities) {
      raw.set(e.name, bc.betweenness(cy.getElementById(e.name)));
    }
    return normalise(raw);
  } finally {
    cy.destroy();
  }
}

/**
 * Community id per entity, from Markov clustering. On demand only.
 *
 * `attributes` is passed explicitly rather than left to default: the algorithm needs an edge
 * weight, and every relation here counts the same.
 *
 * **Every entity gets an id, whether the clusterer returned it or not.** MCL makes no promise
 * to cover every node, and a name missing from this map would fall through to whatever the
 * colour encoding treats as unknown — painting unrelated entities the same colour and calling
 * it a community. Leftovers each get their own id, which is the honest answer: not clustered.
 */
export function computeCommunities(
  entities: SummaryEntity[],
  relations: Relation[],
): Map<string, number> {
  if (entities.length === 0) return new Map();

  // Reciprocal for the same reason: MCL simulates flow, and one-way flow through a graph with
  // no direction convention clusters the convention rather than the content.
  const cy = headlessGraph(entities, relations, true);
  try {
    const clusters = cy.elements().markovClustering({ attributes: [() => 1] });
    const community = new Map<string, number>();
    clusters.forEach((cluster, i) => {
      for (const n of cluster.nodes()) community.set(n.id() as string, i);
    });

    let next = clusters.length;
    for (const e of entities) {
      if (!community.has(e.name)) community.set(e.name, next++);
    }
    return community;
  } finally {
    cy.destroy();
  }
}
