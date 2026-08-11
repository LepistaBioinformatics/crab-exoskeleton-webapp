import type { Core, EdgeSingular, NodeSingular } from "cytoscape";

// "How are these two entities connected" — the question a knowledge graph exists for and the one
// the map could not answer at all.
//
// Runs against a Core rather than over the raw projection, and against the LIVE instance in
// production: a path that cannot be drawn cannot be shown (GD-C6). Passing a headless Core is
// what makes it testable.

export interface PathStep {
  from: string;
  to: string;
  /** The relation type. Empty when the agent stored the relation without one. */
  relation: string;
  /**
   * True when the path walks this relation against the direction it was stored in.
   *
   * A shortest path in an undirected reading can traverse a directed edge backwards. Rendering
   * `A —relation→ B` for an edge the agent wrote as `B → A` would assert a relation that does
   * not exist, so the chain renders an arrow the other way instead.
   */
  reversed: boolean;
}

export interface PathResult {
  /**
   * - `found` — there is a route
   * - `unreachable` — both entities are drawn, and nothing connects them
   * - `endpoint-missing` — at least one endpoint is not on the map
   *
   * The last two are separate because their fixes are: clear a filter, versus accept that the
   * agent has not related these two.
   */
  kind: "found" | "unreachable" | "endpoint-missing";
  /** The entities along the route, in order. */
  nodes: string[];
  /** The Cytoscape edge ids along the route, for highlighting. */
  edgeIds: string[];
  steps: PathStep[];
  /** Endpoints that are not on the map. Only ever populated for `endpoint-missing`. */
  missing: string[];
}

const NOTHING = { nodes: [], edgeIds: [], steps: [], missing: [] };

export function findPath(cy: Core, from: string, to: string): PathResult {
  const a = cy.getElementById(from);
  const b = cy.getElementById(to);

  const missing = [from, to].filter((id) => cy.getElementById(id).empty());
  if (missing.length > 0) return { ...NOTHING, kind: "endpoint-missing", missing };

  // Picking the same entity twice. Answering "found, no steps" is truthful and needs no
  // special case anywhere downstream.
  if (from === to) return { ...NOTHING, kind: "found", nodes: [from] };

  // UNDIRECTED, which is `dijkstra`'s own default — so this passes no option rather than
  // passing `directed: false` and implying the default is the other way. Weights default to 1
  // per edge, which is what "shortest" should mean on a graph of named relations.
  const search = cy.elements().dijkstra({ root: a });

  // Decided on the DISTANCE, never on the path length. `pathTo` on an unreachable target
  // returns the target node ALONE — length 1, not 0 — so a length check never fires and this
  // would highlight one unconnected entity and present it as a route. Measured, not assumed.
  if (!Number.isFinite(search.distanceTo(b as NodeSingular))) {
    return { ...NOTHING, kind: "unreachable" };
  }

  const path = search.pathTo(b as NodeSingular);
  const nodes: string[] = [];
  const edgeIds: string[] = [];
  const steps: PathStep[] = [];

  // The collection alternates node, edge, node, edge, node — so an edge's endpoints are the
  // elements either side of it, and which of them is the stored `source` is what tells us
  // whether the walk went with the relation or against it.
  for (let i = 0; i < path.length; i++) {
    const el = path[i];
    if (el.isNode()) {
      nodes.push(el.id());
      continue;
    }
    const edge = el as EdgeSingular;
    const previous = nodes[nodes.length - 1];
    const next = path[i + 1];
    if (!next) break;
    edgeIds.push(edge.id());
    steps.push({
      from: previous,
      to: next.id(),
      relation: edge.data("label") ?? "",
      reversed: edge.data("source") !== previous,
    });
  }

  return { kind: "found", nodes, edgeIds, steps, missing: [] };
}
