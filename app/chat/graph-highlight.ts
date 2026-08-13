import type { Core } from "cytoscape";
import type { PathResult } from "./graph-paths";

// What is lit and what recedes.
//
// THE SINGLE OWNER OF `faded` (NFR-4b). Selection and path both want to fade the complement of
// their own highlight, so as two separate effects whichever ran last would win and they would
// clobber each other — a path blinking out when a selection re-applies, and the reverse.
//
// Extracted from the view because it is the highest-risk logic in the feature and was the only
// part with no test at all. It takes a Core, so a headless instance exercises it in full: a
// headless graph carries classes perfectly well, it just does not draw.

export interface HighlightInput {
  selected: string | null;
  hopRadius: number;
  path: PathResult | null;
  pathMode: boolean;
  /** The first path endpoint, picked and awaiting a second. */
  pathFrom: string | null;
  /**
   * A legend row picked under a non-type colour encoding: which node data field carries
   * the encoding's value, and which value to light.
   *
   * Its own claimant on `faded`, at the LOWEST precedence, so it can be left standing
   * while the member selects a node or traces a path and comes back to it. Under the
   * `type` encoding the legend drives `typeFilter` instead — a hard filter — and this
   * stays null.
   */
  group?: { key: string; value: string } | null;
}

/**
 * Applies `faded` / `near` / `picked` / `path` to the live graph.
 *
 * Always clears first, and always applies from scratch. That is what makes it safe to call after
 * a rebuild — a fresh instance carries no classes, and `selected` will not have changed, so an
 * effect that skipped the reapply left an active selection silently unfaded.
 *
 * Precedence: a traced path beats a selection, which beats a legend group. Each is more
 * specific than the next, and was asked more recently.
 */
export function applyHighlight(cy: Core, input: HighlightInput): void {
  const { selected, hopRadius, path, pathMode, pathFrom, group } = input;
  cy.elements().removeClass("faded near picked path");

  if (path?.kind === "found" && path.steps.length > 0) {
    const nodes = cy.nodes().filter((n) => path.nodes.includes(n.id() as string));
    const edges = cy.edges().filter((e) => path.edgeIds.includes(e.id() as string));
    const route = nodes.union(edges);
    // An empty route would fade the entire graph and light nothing — which looks like a bug
    // rather than like an answer. Only possible if the path names elements this instance does
    // not have, so bail rather than blank the view.
    if (route.empty()) return;
    cy.elements().difference(route).addClass("faded");
    route.addClass("path");
    return;
  }

  // Mid-trace: mark the member's own first pick so it is visible while they choose the second.
  if (pathMode && pathFrom) {
    cy.getElementById(pathFrom).addClass("picked");
    return;
  }

  if (!selected) {
    applyGroup(cy, group);
    return;
  }
  const node = cy.getElementById(selected);
  if (node.empty()) {
    applyGroup(cy, group);
    return;
  }

  // Grown one hop at a time. `closedNeighborhood()` works on a collection as well as on a single
  // node, so this is iteration rather than a graph traversal of our own.
  let near = node.closedNeighborhood();
  for (let i = 1; i < hopRadius; i++) {
    near = near.union(near.nodes().closedNeighborhood());
  }
  cy.elements().difference(near).addClass("faded");
  near.edges().addClass("near");
  node.addClass("picked");
}

/**
 * Lights one legend group and recedes the rest.
 *
 * Nodes only: an edge belongs to two groups whenever it crosses between them, so there is no
 * honest answer for it. Leaving edges unfaded also keeps the picture readable — the point of
 * the encoding is seeing how clusters connect, and fading the connections would remove it.
 *
 * An empty match is left alone rather than fading everything: a group with nothing on screen is
 * an answer ("filtered out"), and a blank canvas reads as a bug.
 */
function applyGroup(cy: Core, group: HighlightInput["group"]): void {
  if (!group) return;
  const lit = cy.nodes().filter((n) => String(n.data(group.key) ?? "") === group.value);
  if (lit.empty()) return;
  cy.nodes().difference(lit).addClass("faded");
}
