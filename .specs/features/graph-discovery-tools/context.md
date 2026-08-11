# graph-discovery-tools — context

User decisions for the gray areas, captured before implementation. Each was a real
fork: the alternatives are recorded because they were considered, not to pad the doc.

## The research that framed the choice

The user asked for a survey of knowledge-graph discovery techniques, ranked by how
commonly they appear in practice, with implementation cost. Fourteen were tabled. The
ranking was judgement drawn from the sources below, not a measured statistic, and it
was presented as such.

Sources: [Knowledge Graphs in Practice](https://arxiv.org/html/2304.01311v4) ·
[Interactive Dynamics for Visual Analysis (CACM)](https://cacm.acm.org/practice/interactive-dynamics-for-visual-analysis/) ·
[yFiles KG guide](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs) ·
[Cambridge Intelligence](https://cambridge-intelligence.com/learn/graph-visualization/) ·
[Neo4j Bloom](https://neo4j.com/docs/bloom-user-guide/current/about-bloom/) ·
[Linkurious vs Bloom](https://linkurious.com/blog/linkurious-enterprise-neo4j-bloom/) ·
[Visual network analysis survey](https://arxiv.org/pdf/2501.08500) ·
[Cytoscape.js](https://js.cytoscape.org/)

## D-1 — Scope: blocks A, B, C, D. Layout variants stay out.

**Chosen.** Legibility (A), analytic readings (B), path between entities (C) and
server-side search feeding the map (D).

**Deliberately excluded: layout variants** (radial, hierarchical, concentric). The
existing `knowledge-graph-map` spec put them out of scope on the argument that one
force layout answers the question the tab exists for. That decision was re-opened and
**re-affirmed**, including the narrow version (concentric rings by centrality) that
would have paired with block B.

**Also excluded, and why it is not a gap:**

- **Expand-on-demand** — the single most common pattern in Bloom/Linkurious/KeyLines,
  and the one with the *least* return here. It exists for graphs of millions of nodes.
  This graph is per member per agent: tens to low hundreds of entities, which already
  fit on screen. It would also cost the most: the render model rebuilds on
  `[built, spread]`, and rebuilding re-runs the layout, so incremental expansion means
  reworking the invariant that NFR-4 protects.
- **Temporal exploration** — `SummaryEntity` carries no timestamp. This is the only
  candidate that would genuinely break NFR-1, because it needs a field the browse
  projection does not have. Deferred, not rejected.
- **Compound-node grouping** — needs `cytoscape.js-expand-collapse` plus a restructured
  element model.
- **Semantic / embedding similarity** — blocked upstream, not deferred. The proxy
  rejected embeddings on purpose: no Python sidecar, so search is BM25
  (`internal/memgraph/search.go`). There is nothing to build against.

## D-2 — Centrality is computed over the WHOLE graph.

**Chosen** over "only what is rendered" and over a hybrid with a node-count fallback.

"Most central" is a property of the graph, not of the member's current filter. Computing
post-filter is what most tools do and it is cheaper, but the ranking then changes as you
narrow, which reads as a bug rather than as a definition.

**Cost accepted:** one extra headless Cytoscape construction per graph load.

**Consequence, which D-6 exists to resolve:** the scores then describe entities the map
may not be drawing.

## D-3 — One colour encoding at a time, chosen by the member.

**Chosen:** a selector — colour by type (default) | community | component.

Colour is already spoken for: it means `entityType` today. Community detection wants the
same channel.

- **Rejected: type in fill, community on the border.** The border already carries two
  meanings — selection (`.picked`) and whether a node matched the filter or is only
  context (`node[!match]`). A third would be three meanings in the same pixels.
- **Rejected: community as a background hull.** More legible than the border, but convex
  hulls are not built into Cytoscape and would have to be drawn by hand — the single
  most expensive item in the whole scope, for a secondary encoding.

## D-4 — Path mode is UNDIRECTED.

**Chosen** over directed, and over a toggle.

The question the mode answers is "how are A and B connected", and ignoring arrow
direction answers it in far more cases. The graph is written by an agent with no
direction convention, so a directed search returns "no path" often enough to make the
feature read as broken. Arrowheads stay drawn — the direction is still *shown*, it is
just not a constraint on the search.

Confirmed against the installed library rather than assumed: `dijkstra` defaults to
`directed: false`, so this is the default and needs no option.

A toggle was rejected as one more control in a column that is already tight.

## D-5 — Controls live in an adaptive disclosure.

**Chosen:** a "Tools" button opening a panel over the stage — collapsed by default in
the sidebar column, expanded by default in fullscreen.

The column is ~280px. The reasoning: the column is for *looking at* the graph, fullscreen
is for *operating* it.

- **Rejected: an always-visible compact bar.** Best discoverability, but it eats vertical
  room from the stage exactly where the stage is already smallest.
- **Rejected: fullscreen only.** Simplest, but it hides the whole feature from a member
  who never clicks expand.

## D-6 — The insights list is global, with off-map rows LABELLED.

**Chosen** over two alternatives, to resolve the consequence D-2 created.

Because scores are global (D-2) while the map draws at most `MAX_NODES` and fewer under a
filter, the "most central" list can name an entity that is not on screen. Clicking it
opens the detail pane — `select()` already handles a name outside the current list, via
`openNodes` — but the map highlights nothing, so the click looks dead.

The list stays global and rows that are not drawn say so.

- **Rejected: click clears the filters that hid it.** More helpful, but the click gains a
  side effect nobody asked for, and it cannot fix the case where the node was cut by the
  node ceiling rather than by a filter.
- **Rejected: scope the list to rendered nodes** (keeping scores global). Every click
  would work; in exchange the most central entity in the graph can be absent from the
  list of most central entities.

## D-7 — Hover uses a follow tooltip. Decided without asking; low stakes.

`node.renderedPosition()` is a library call that already accounts for pan and zoom, so
this is not the hand-rolled `viewBox` arithmetic that sank the map's first version. It
clears on `mouseout`, `pan`, `zoom` and `tapstart`, and is clamped to the stage box —
in a 280px column an unclamped tooltip overflows constantly.
