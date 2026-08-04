import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

// Positions for a knowledge-graph node-link diagram.
//
// d3-force computes the layout; nothing else about the drawing is delegated.
//
// It was worth a dependency: force-directed placement that settles well is fiddly maths,
// and d3-force is the engine inside the prettier graph libraries anyway. What it does NOT
// do is touch the DOM — it only assigns coordinates — which is the property that matters
// here, because the rendering is what has to match this app.
//
// It never touches the DOM, which is why this module is pure and testable and why the
// drawing stays hand-rolled SVG like the rest of this app's figures. That is what lets the
// graph inherit the theme: the app's CSS vars, the brand colours and the global
// reduced-motion guard all apply, none of which a canvas or WebGL renderer picks up.
//
// The simulation is run to completion HERE rather than animated. A settling graph is a
// nice demo and a bad tool: labels move while you are trying to read them, and clicking a
// node means chasing it. Ticked synchronously, the member gets a stable picture.

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  type: string;
  /** How much the agent has recorded about it — drives the node's radius. */
  observations: number;
  relations: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  source: GraphNode;
  target: GraphNode;
  label: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The bounding box of the settled layout, so the view can frame it. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Ticks to run. Enough to settle a few hundred nodes; cheap at this size. */
const TICKS = 300;
/**
 * Node radius from observation count, on a square root so a heavily-observed entity does
 * not swamp the canvas — area grows with the count rather than the radius.
 */
export function radiusFor(observations: number): number {
  return 5 + Math.sqrt(Math.min(observations, 100)) * 2.2;
}

export function layoutGraph(
  entities: SummaryEntity[],
  relations: Relation[],
  { width, height }: { width: number; height: number },
): GraphLayout {
  const nodes: GraphNode[] = entities.map((e) => ({
    id: e.name,
    type: e.type,
    observations: e.observationCount,
    relations: e.relationCount,
    x: 0,
    y: 0,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Relations whose endpoints are not both present are DROPPED, not invented. The browse
  // projection can return an edge to an entity outside the page, and a link to a node that
  // is not drawn would either crash the simulation or render as an edge into empty space.
  const links: SimulationLinkDatum<GraphNode>[] = [];
  const edges: GraphEdge[] = [];
  for (const r of relations) {
    const source = byId.get(r.from);
    const target = byId.get(r.to);
    if (!source || !target) continue;
    links.push({ source, target });
    edges.push({ source, target, label: r.relationType });
  }

  const sim = forceSimulation(nodes)
    .force("link", forceLink<GraphNode, SimulationLinkDatum<GraphNode>>(links).distance(90).strength(0.6))
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(width / 2, height / 2))
    // Collision keyed to the drawn radius, so labels have room and nodes never overlap in
    // a way that makes two entities look like one.
    .force("collide", forceCollide<GraphNode>((n) => radiusFor(n.observations) + 12))
    .stop();

  sim.tick(TICKS);

  const bounds = nodes.reduce(
    (acc, n) => ({
      minX: Math.min(acc.minX, n.x),
      minY: Math.min(acc.minY, n.y),
      maxX: Math.max(acc.maxX, n.x),
      maxY: Math.max(acc.maxY, n.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  return {
    nodes,
    edges,
    bounds: nodes.length
      ? bounds
      : { minX: 0, minY: 0, maxX: width, maxY: height },
  };
}

/**
 * The nodes one hop from `name`, plus the edges that connect them.
 *
 * Used to dim everything else on selection. One hop, not the whole component: on a graph
 * of any size the transitive closure is "most of it", which dims nothing and answers
 * nothing.
 */
export function neighbourhood(
  layout: GraphLayout,
  name: string,
): { nodes: Set<string>; edges: Set<GraphEdge> } {
  const nodes = new Set<string>([name]);
  const edges = new Set<GraphEdge>();
  for (const e of layout.edges) {
    if (e.source.id === name || e.target.id === name) {
      nodes.add(e.source.id);
      nodes.add(e.target.id);
      edges.add(e);
    }
  }
  return { nodes, edges };
}
