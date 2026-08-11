# graph-discovery-tools — Specification

Discovery tooling for the knowledge-graph **Map** tab. Webapp-only; nothing here writes
to the graph. Extends `knowledge-graph-map`, which built the map itself; the decisions
behind the scope are in `context.md`.

## Summary

The map today draws the graph correctly and says nothing about it. It supports one
question — "where is the entity called X" — through a substring filter on names. This
adds the questions a knowledge graph is actually explored with: what is central, what
clusters, what is isolated, how do two entities connect, and what does the picture in
front of me *mean*.

## The starting position, stated plainly

Verified in `app/chat/memory-graph-view.tsx` and `app/chat/graph-elements.ts`:

- `cose` layout with a deterministic phyllotaxis seed, adjustable spread (0.5x–8x), fit,
  fullscreen
- colour by `entityType`, node area ∝ √(observation count)
- selecting a node fades everything more than one hop away and opens the detail pane
- the map filter is a case-insensitive **substring over entity names**, debounced 250 ms,
  keeping one-hop neighbours of matches
- the type filter is shared with the Browse tab; a 300-node ceiling, reported not silent

**Four gaps this feature closes.** There is **no legend at all** — the colour encoding is
never explained anywhere in the UI, though `built.types` already exists and already feeds
the palette. There is **no hover** — the only way to learn anything about a node is to
click it and open a pane. The **Search tab's BM25 ranking never reaches the map**, so the
map cannot find an entity by anything only its observations say. And there is **no
analytic reading of any kind**.

---

## Block A — Legibility

- **GD-A1** A legend lists the values of the **active colour encoding** with their swatch
  and a count. Clicking a type row drives the panel's **existing** `typeFilter` — the same
  state the Browse tab uses — rather than introducing a second notion of type narrowing.
  When the encoding is community or component, rows select that group instead and do not
  touch `typeFilter`. Counts are of the **rendered** set, not of the whole graph: the legend
  exists to explain the picture on screen, and a count that disagreed with what is countable
  in front of the member would read as a defect. This is the opposite choice from GD-B4,
  deliberately — a legend describes the view, an insights list describes the graph.

  **The legend must not empty itself on click.** `typeFilter` is a hard gate, so if the
  legend's rows came from the rendered set, clicking "person" would leave `built.types` as
  `["person"]` and collapse the legend to one row — with no other type visible to switch to
  and no way back except a different control in a different section of the disclosure. So the
  legend's **domain is every type in the graph** (from `entityTypeCounts` over the unfiltered
  entities — the same source the Browse chips use) while its **counts are of the rendered
  set** and may legitimately read zero. The active row renders as a clearable chip, matching
  how `BrowseList` already treats `allLabel`.
- **GD-A2** Hovering a node shows its name, type, observation count and relation count
  without opening the detail pane. Positioned from `node.renderedPosition()` and **clamped
  to the stage box**. Cleared on `mouseout`, `pan`, `zoom` and `tapstart`.
- **GD-A3** Two facets join the existing type filter:
  - **relation type** — a multi-select over the relation types present. It gates **edges
    only**. Nodes that lose all their edges **stay drawn**: hiding relations must not
    delete entities, which is also how Bloom and Linkurious behave, and dropping nodes
    would move the whole layout on an edge-only control. **One qualification, so the spec
    and the implementation agree:** with a query active, *context* nodes — the ones pulled
    in only as a match's neighbour — are reached through **visible** relations only. So a
    hidden relation type can remove a context node. Entities the member actually matched are
    never removed by this facet, and with no query every entity is a match, which is where
    the promise matters.
  - **minimum observations** — a floor on `observationCount`. A hard gate on nodes.
- **GD-A4** The focus radius is selectable: **1 (default), 2 or 3 hops**. It governs
  **selection fading only** — deliberately *not* the one-hop neighbour expansion inside
  `buildElements`. Those are two different hop notions with two different costs: fading is
  a class change, expansion changes the element set and re-runs the layout. A single
  control driving both would make a display setting silently alter the result set.

## Block B — Analytic readings

- **GD-B1** Per-entity metrics are computed over the **whole** graph (D-2), memoized per
  load, and written into `node.data()` at build time:
  - **degree** — free. `SummaryEntity.relationCount` already is the degree; nothing is
    computed for it.
  - **PageRank** — always computed.
  - **betweenness** — **on demand only**, never on load. It is O(n·m), and the server caps
    a workspace graph at 4 MiB of encoded JSON, which is thousands of entities.
- **GD-B2** Node **size** encoding is selectable: observations (default), degree, PageRank,
  betweenness.
- **GD-B3** Node **colour** encoding is selectable: type (default), community
  (`markovClustering`), component (`components()`). One at a time (D-3); the legend
  follows the active one.
- **GD-B4** An insights list shows the **top five** entities by the active size metric, and
  the count of **isolated entities** — components of size one, which is the direct answer to
  "what does the agent know but has not connected to anything". The list is **global**, and
  rows not currently drawn are **labelled as off-map** (D-6). Selecting a row calls the
  panel's `select()`.
- **GD-B5** Switching either encoding **must not re-run the layout**. Metrics live in node
  data, so an encoding change is a stylesheet swap, not a rebuild. See NFR-2.

## Block C — Path between entities

- **GD-C1** A path mode: pick an origin, pick a target, and the shortest path is
  highlighted while the rest of the graph fades.
- **GD-C2** The search is **undirected** (D-4). Arrowheads stay drawn; direction is shown
  but is not a constraint.
- **GD-C3** Endpoint picking is owned **inside the view** and does **not** go through the
  panel's `select()`. That function toggles off on re-click and issues an `openNodes`
  request per pick — so routing endpoints through it would fire two network calls per path
  and clicking an already-selected node would clear state mid-pick. Only an explicit "open
  this entity" action routes to the panel.
- **GD-C4** The path is also rendered as a readable chain — `A —relation→ B —relation→ C` —
  because a highlighted path on a dense graph is still hard to read edge by edge.
- **GD-C5** **No path** is a distinct, explicitly stated state, decided on the
  **distance**, never on the path length. Verified against the installed library: for an
  unreachable target `dijkstra` returns `distanceTo === Infinity` but `pathTo` returns a
  collection of **length 1** — the target node alone. A `length === 0` guard never fires,
  and the mode would highlight a single unconnected node and read as a hit.
- **GD-C6** A path is computed over the **rendered** graph, because a path that cannot be
  drawn cannot be shown. When an endpoint is not on the map, that is stated rather than
  reported as "no path" — the two are different facts with different fixes.
- **GD-C7** Path mode is escapable, and its highlight survives an unrelated re-render.

## Block D — Server-side search feeding the map

- **GD-D1** The map's filter input gains a "search contents" mode that uses the server's
  BM25 ranking (`searchGraph`), which matches entity name, type **and observation text** —
  so the map can find an entity by something only its observations say.
- **GD-D2** **Only the hit NAMES are used.** Elements keep coming entirely from the browse
  projection; BM25 replaces the *match predicate* (`name.includes(q)` → `hits.has(name)`)
  and nothing else. The map does not gain a second source of structure, only a second
  source of selection. This is why NFR-1 survives — see the amendment below.
- **GD-D3** `k` is passed **explicitly**. `searchGraph(workspace, query, k = 10)` defaults
  to ten, and seeding a map from ten hits reads as "the map is hiding entities". Whatever
  ceiling is used is **reported**, the way `truncatedLabel` already reports the node cap.
- **GD-D4** Responses are guarded by a **monotonic request stamp**, reusing the
  `selectStamp` pattern already in `memory-graph-panel.tsx`. An async fetch behind a
  debounced input will otherwise apply a stale hit set.
- **GD-D5** A failed or empty content search is distinguishable from a filter that matched
  nothing.

---

## Non-functional requirements

- **NFR-1 (amended)** The map's **elements** derive exclusively from the browse projection.
  **Amendment:** block D adds a request that supplies a **set of names** and no structure
  (GD-D2). The original intent — that the map cannot quietly become a second data path with
  its own structural request per visit — is preserved. Block B adds no request at all.
- **NFR-2 (inherited, extended)** Nothing that is a *display* concern may rebuild the graph,
  because a rebuild re-runs the layout and rearranges the picture under the member's cursor.
  Selection already obeys this. Extended to cover both encodings (GD-B5), the focus radius
  (GD-A4) and the path highlight (GD-C1) — all applied as classes or stylesheet swaps. Only
  the facets, which genuinely change the element set, rebuild.
- **NFR-3** Every new facet threaded into `buildElements` must join the `useMemo` dependency
  list that produces `built`. A missing dependency makes the control do nothing, with no
  error — the failure recorded in this project's history as a parameter silently dropped in
  one layer.
- **NFR-4** The selection effect currently depends on `[selected]` alone. After a rebuild,
  `cy.current` is a fresh instance carrying no classes while `selected` has not changed — so
  **an active selection loses its fading after any filter change**. Pre-existing, and this
  feature multiplies the triggers for it. `built` joins that effect's dependencies.
- **NFR-4b** The `faded` class has **exactly one owner**. Selection and path both fade the
  complement of their highlight set, so as two effects whichever ran last would own the fade
  and they would clobber each other. One highlight effect takes `(selected, hopRadius, path)`
  and computes the fade set once; `.picked`, `.near` and `.path` are additive within it.
- **NFR-4c** No reference-typed value may enter a memo or effect dependency list unless it is
  held in state or itself memoized. `matchNames` (a `Set`) and `colorDomain` (an array) are
  both new identities if built in the render body, which makes `built`'s memo miss, re-runs the
  create effect, and **re-runs the layout on every render**. It presents as "the graph jitters"
  rather than as a dependency bug, and it is the same class of failure as NFR-3.
- **NFR-5** All new copy goes through `chatCopy` in both locales. `lib/i18n/parity.test.ts`
  fails on a key added to `en` and not `pt`; it is run per wave, not once at the end.
- **NFR-6** Metrics, facets, stylesheet construction and path formatting are **pure modules,
  tested without a canvas**. jsdom has no WebGL and Cytoscape needs a real container, so a
  render test proves little while these are where a wrong answer is invisible. The headless
  instance used for metrics needs no container and is proven to work under vitest.
- **NFR-7** `memory-graph-view.tsx` is 391 lines and this scope would roughly double it. The
  view keeps the Cytoscape lifecycle and the stage; everything else moves out. See
  `design.md`.

## Verification

Per wave, not once at the end — the map's first version "looked plausible in a screenshot
and was unusable in practice" and burned two rounds of fixes before being scrapped.

- `npm test` green, including `lib/i18n/parity.test.ts` (baseline: 59 files / 826 tests)
- `npm run build` exit 0 — this, not `tsc`, is the source type-check gate
- `npx tsc --noEmit` shows **no new** errors (5 pre-existing, all in `.test.*` files)
- **not a gate:** `npm run lint` is non-functional in this repo — deprecated `next lint`, no
  ESLint config, `eslint` not a dependency. See `tasks.md`.
- **the app run and looked at**, in the sidebar column *and* in fullscreen
- specifically exercised: a facet applied **while a node is selected** and **while a path is
  highlighted** — both highlights must survive (NFR-4)

## Out of scope

| Thing | Why |
|---|---|
| Editing the graph from the map | The whole graph surface is read-only; the agent writes it. |
| Layout variants (radial, hierarchical, concentric) | `knowledge-graph-map` excluded them; re-opened and re-affirmed (D-1). |
| Expand-on-demand incremental exploration | Solves a scale this graph does not have, at the highest cost in the scope (D-1). |
| Temporal filtering / animation | `SummaryEntity` carries no timestamp. The one candidate that would truly break NFR-1. Deferred. |
| Compound-node grouping / expand-collapse | Needs an external extension and a restructured element model. |
| Semantic / embedding similarity | Blocked upstream: the proxy has no embedding path by design. |
| Minimap (overview+detail) | Needs `cytoscape-navigator`, whose maintenance was not audited. |
| Saved views, annotations | No demand, and it would need somewhere to persist per member. |
