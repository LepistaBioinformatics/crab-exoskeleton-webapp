# knowledge-graph-map — Specification

> Written alongside the implementation, from a suggestion the user chose off a shortlist.
> The alternatives and the library decision are recorded because both were deliberate.

## Summary

A **Map** tab in the knowledge-graph panel: the graph as a node-link diagram, where
selecting an entity opens the provenance the panel already had. Webapp-only.

## Why this, and why it was not already possible

The panel offered three ways to read *rows* — browse, search, recent — and none showed
the **shape**: what clusters, what is central, what is isolated. Separately, the graph has
carried per-observation provenance for a while (`sourceSessionId`, plus `entitySources`
to order a conversation list) and there was no surface that made a member ask "where did
this come from". The map is the way in; the answer was already built.

## Functional requirements

- **GM-1** A fourth tab renders every entity as a node and every relation as an edge, laid
  out force-directed. Node **area** tracks observation count on a square root, so one
  heavily-observed entity cannot swamp the view.
- **GM-2** Selecting a node dims everything more than **one hop** away. Not the transitive
  closure: on a graph of any size that is "most of it", which dims nothing and answers
  nothing.
- **GM-3** Selecting a node calls the panel's existing `select()`, so it opens the same
  detail pane the browse list opens — which already lists the conversations behind each
  observation and navigates to them. **This reuse is the feature.**
- **GM-4** Clicking the background clears the selection; pan and zoom are available, with
  a reset.
- **GM-5** A relation whose endpoint is not among the rendered entities is **dropped**.
  The browse projection can carry an edge to an entity outside the page, and drawing it
  would be a line into empty space.

## Non-functional requirements

- **NFR-1** The map derives from **exactly** the browse projection the list already
  fetches — no field only the full projection carries. Asserted by a test, so it cannot
  quietly become a second data path with its own request per visit.
- **NFR-2** The simulation is ticked to completion, not animated. A settling graph moves
  labels while they are being read and makes clicking a node a chase.
- **NFR-3** ~~Layout comes from a library; drawing does not.~~ **Superseded:** the library
  draws too. The theme is read from the app's tokens and passed into Cytoscape's
  stylesheet. See "The library decision" — inheriting the vars for free was not worth an
  unreadable graph.
- **NFR-4** Selection is applied as classes on the live graph, never by rebuilding it: a
  rebuild re-runs the layout, so clicking a node would rearrange the picture around it.

## The library decision — revised after the first attempt failed

**Outcome: Cytoscape.js renders the map. The reasoning below is kept because the first
decision was wrong and the way it was wrong is the useful part.**

The first version used `d3-force` for the layout and hand-rolled the SVG, on the argument
that only hand-rolled SVG inherits the app's CSS vars. That argument was real and it was
not worth what it cost: the layout spanned far more than the panel's column so the fit
reduced everything to roughly a quarter scale, labels drew unconditionally and overlapped,
edges had no arrowheads, and pan/zoom was hand-written viewBox arithmetic that did not
work. Two rounds of fixes did not make it usable, because every remaining defect was
something a graph library already solves.

**Neo4j's library is legally unusable here.** `@neo4j-nvl/*` ships under a Neo4j licence
that permits use only with Neo4j Aura or Neo4j's proprietary commercial database products;
this knowledge graph is a Go store on disk (`internal/memgraph`). `neovis.js` is the
Apache-2.0 alternative in that ecosystem — last published 2023, 25 MB unpacked because it
bundles vis-network.

**Cytoscape.js**: MIT, published 2026-06, 5.5 MB unpacked. Its built-in `cose` layout is
used rather than `cytoscape-fcose`, which has been stale since 2023. The trade, which
reverses the original argument: Cytoscape styles through its own stylesheet, so the theme
is READ from the app's tokens at graph-build time and passed in rather than inherited.

What the library gives that the hand-rolled version did not: label collision handling
(hidden rather than stacked), arrowheads for direction, working pan/zoom and hit-testing,
and colour by entity type.

## The library decision (original, superseded)

`d3-force`, chosen against `cytoscape`, `sigma`, `react-force-graph-2d` and
`@xyflow/react` (all verified live on the npm registry, August 2026).

The deciding factor is **scale, not performance**: the graph is per member per agent —
tens to low hundreds of entities. Sigma's WebGL solves 100k nodes, a problem this does not
have, and charges for it in theming (a canvas cannot read the app's CSS vars) plus
`graphology` as a second dependency. Cytoscape is the richest toolkit and arrives at
5.5 MB unpacked with an imperative API for behaviour mostly not needed here.

`d3-force` is 87 KB unpacked with three small deps, and is the engine inside the prettier
libraries anyway — so "reliable" is well founded. Its published date (2021) is maturity in
a maths library, not abandonment: it assigns coordinates and has no surface that moves
with the DOM.

**Cost accepted:** pan/zoom and hit-testing are hand-rolled. There is precedent — the
Canvas timeline already hand-rolls its drag and scroll.

**Rejected mid-flight:** hand-rolling the simulation too. It was started when an install
appeared blocked, and reverted on the user's instruction to prefer a library. The
environment problem turned out to be an interrupted install, not the network.

## Out of scope

| Thing | Why |
|---|---|
| Editing the graph from the map | The whole graph surface is read-only; the agent writes it. |
| Layout variants (hierarchical, radial) | One force layout answers the question this tab exists for. |
| Rendering archived or merged entities | The browse projection excludes them unless asked; naming an entity is how you inspect a retired one. |
