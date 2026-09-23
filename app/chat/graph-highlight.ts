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
  /**
   * The member's multi-select, the same set the entity list ticks into.
   *
   * Applied as its own class and OUTSIDE the precedence chain below, because it is not a
   * claimant on `faded` — it answers "which nodes did I tick", which stays true while a
   * path is traced or another entity is opened. Applied here rather than in a second effect
   * for the reason this module exists: a rebuild hands back an instance carrying no
   * classes, and only the owner of the reapply can put them all back.
   */
  checked?: ReadonlySet<string>;
  /**
   * The names a share would actually carry — the ticked seeds plus everything the hop
   * control reaches out to. **The very set the share button sends**, handed down rather
   * than recomputed here: a map that disagreed with the payload would be worse than no
   * highlight at all, and a second expansion is how the two drift apart.
   *
   * It includes the seeds, so `reached` is drawn on the DIFFERENCE: a node the member
   * ticked and a node the hops pulled in are not the same act, and drawing them alike
   * would lose the only distinction that matters here.
   *
   * It is also the second claimant on the fading in the selection branch — see there.
   */
  shareNames?: ReadonlySet<string>;
}

/**
 * Applies `faded` / `near` / `picked` / `path` / `checked` / `reached` to the live graph.
 *
 * Always clears first, and always applies from scratch. That is what makes it safe to call after
 * a rebuild — a fresh instance carries no classes, and `selected` will not have changed, so an
 * effect that skipped the reapply left an active selection silently unfaded.
 *
 * Precedence: a traced path beats a selection, which beats a legend group. Each is more
 * specific than the next, and was asked more recently.
 */
export function applyHighlight(cy: Core, input: HighlightInput): void {
  const { selected, hopRadius, path, pathMode, pathFrom, group, checked, shareNames } = input;
  cy.elements().removeClass("faded near picked path checked reached");

  // Before every branch below, and never returned from early: whether a node is ticked is
  // independent of whether a path or a selection is lit.
  if (checked && checked.size > 0) {
    cy.nodes()
      .filter((n) => checked.has(n.id() as string))
      .addClass("checked");
  }

  // The share's reach, drawn for the same reason and in the same place as the ticks: it
  // answers "what am I about to publish", which stays true while a path is traced.
  //
  // DISJOINT from `checked`. The seeds are in `shareNames` too, and marking them both would
  // say the member ticked everything the hops reached.
  const shared =
    shareNames && shareNames.size > 0
      ? cy.nodes().filter((n) => shareNames.has(n.id() as string))
      : cy.collection();
  shared.filter((n) => !checked?.has(n.id() as string)).addClass("reached");

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
  // The share's reach is exempt from the fading, and that exemption is the whole fix rather
  // than a nicety. `hopRadius` (how much stays LIT around the open entity) and the share's
  // hop control are deliberately different numbers, so raising the share's hops normally
  // reaches past the focus radius — and a node at `opacity: 0.1` carrying a border class is
  // still a map that looks identical while the count climbs.
  //
  // The edges BETWEEN shared nodes come too: the mangrove extracts the relations among the
  // names it is given, so a fragment drawn as unconnected dots would misdescribe the payload.
  // They are exempt from the fade but do NOT get `near` — that class means "inside the focus
  // radius", which these are not.
  const sharedArea = shared.union(shared.edgesWith(shared));
  cy.elements().difference(near.union(sharedArea)).addClass("faded");
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
