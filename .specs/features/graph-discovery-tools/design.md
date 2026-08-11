# graph-discovery-tools — Design

Requirement IDs refer to `spec.md`; decisions to `context.md`.

## The constraint everything else is arranged around

`knowledge-graph-map`'s NFR-4 — restated here as NFR-2 — is the load-bearing rule: **a
rebuild re-runs the layout, so anything that is a display concern must not rebuild.** The
map's first version was scrapped partly because the picture moved under the member's
cursor.

This scope adds nine controls. Sorting them by that rule is the whole architecture:

| Control | Mechanism | Rebuilds? |
|---|---|---|
| relation-type facet, min-observations facet, name/content query, type filter | changes the element set | **yes** |
| size encoding, colour encoding | stylesheet swap over `data()` | no |
| focus radius, selection, path highlight | classes on the live graph | no |
| hover | absolutely-positioned div, no graph mutation | no |

Metrics therefore may **not** be inputs to `buildElements`: if they were, `built` would
depend on them and toggling to betweenness would re-run the layout, breaking GD-B5. They
are written into `node.data()` on the live instance instead — a data write does not trigger
a layout — and the stylesheet reads them.

## Files

| File | Responsibility | Status |
|---|---|---|
| `app/chat/graph-elements.ts` | projection → elements; **all** filtering | extend |
| `app/chat/graph-metrics.ts` | headless PageRank / betweenness / communities / components | new |
| `app/chat/graph-stylesheet.ts` | (palette, encodings) → Cytoscape stylesheet | new |
| `app/chat/graph-paths.ts` | shortest path → structured, renderable steps | new |
| `app/chat/use-map-tools.ts` | the tool state, owned where it survives a tab switch | new |
| `app/chat/memory-graph-tools.tsx` | the disclosure: facets, encodings, radius, path toggle | new |
| `app/chat/memory-graph-readouts.tsx` | legend, insights, path chain, hover tooltip | new |
| `app/chat/memory-graph-view.tsx` | Cytoscape lifecycle and the stage, nothing else | shrink |
| `app/chat/memory-graph-panel.tsx` | owns tool state + the BM25 hit set | extend |

Everything except the two `.tsx` surfaces and the view is pure and unit-tested (NFR-6).

## `graph-metrics.ts`

Split by cost, because the expensive metrics must not run on load (GD-B1):

```ts
computeBaseMetrics(entities, relations)   // pagerank + component + isolated — always
computeCommunities(entities, relations)   // markovClustering — only when colour = community
computeBetweenness(entities, relations)   // O(n·m) — only when size = betweenness
```

All three share one internal headless builder. `headless: true, styleEnabled: false` is
documented for browser use and is proven to construct with no container under vitest.

**Degree is not in this module.** `SummaryEntity.relationCount` already *is* the degree;
computing it would be inventing work.

Verified against the installed `cytoscape@3.34.0`, not assumed — these are **accessor
objects**, not per-node numbers:

- `pageRank({}).rank(node)` → number. Raw values sum to 1, so they are normalised against
  the max here; a raw PageRank is not a size.
- `betweennessCentrality({}).betweenness(node)` / `.betweennessNormalized(node)`.
  `directed` defaults to `false`.
- `markovClustering({ attributes: [() => 1] })` → `NodeCollection[]`. The weight accessor
  is passed explicitly rather than relied on to default.
- `components()` → `CollectionReturnValue[]`.

**Community coverage is asserted, not assumed.** Any entity that no returned cluster
contains is given its own community id, so the colour encoding can never fall through to a
default for a node the clusterer skipped.

Metrics depend on the **full** `entities`/`relations` props (D-2) and **not** on `built`, so
narrowing a facet does not recompute them.

## `graph-elements.ts` — the facets

`GraphFilter` gains `relationTypes`, `minObservations` and `matchNames`. A new pure
`relationTypeCounts(relations)` mirrors the existing `entityTypeCounts` and is computed from
the **unfiltered** relation list — computing the facet's domain from the filtered list would
collapse the options to whatever is already selected.

Order of operations, which matters:

1. gate `relations` by `relationTypes`
2. gate `entities` by `type` and `minObservations`
3. decide the match set: `matchNames` when block D supplied one, else the substring predicate
4. expand one hop over the **gated** relations
5. rank (matches first, then observation count), cap at `MAX_NODES`, report `truncated`
6. build edges from the gated relations, dropping any with a missing endpoint

**Why the relation gate comes first, and what it means for GD-A3.** Hiding a relation type
must not delete entities. With no query every pool entity is a match, so nothing is dropped
and that promise holds exactly where it matters. With a query, *context* nodes are reached
through visible relations only — which is the coherent reading, and it avoids drawing a
context node with no visible edge to explain why it is there. Matched nodes are never
dropped by the edge gate.

`matchNames` is intersected with the pool, so a BM25 hit excluded by the type filter stays
excluded: the type filter is a hard gate and must remain one.

## `graph-stylesheet.ts`

`buildStylesheet({ palette, sizeBy, colorBy, colorDomain })`.

Size keeps the existing intent — **width ∝ √value, so area ∝ value**, which is the current
`14 + √min(obs,100) · 4`. That formula is preserved verbatim for the default encoding;
degree reuses its shape, and the two normalised metrics use `14 + √v · 40` over `v ∈ [0,1]`.

Colour reads whichever of `type` / `community` / `component` the active encoding names, and
indexes `colorDomain` through the existing `typeColorIndex`. The palette is still read from
the app's CSS tokens at instance-creation time and stashed in a ref.

Re-applying a whole stylesheet via `instance.style(...)` does not re-run the layout and does
not clear element classes, so `.faded` / `.picked` / `.near` / `.path` survive an encoding
change.

## `graph-paths.ts`

```ts
findPath(cy, from, to): {
  kind: "found" | "unreachable" | "endpoint-missing";
  nodes: string[]; edgeIds: string[];
  steps: { from: string; to: string; relation: string; reversed: boolean }[];
  missing?: string[];
}
```

Takes a `Core` — the **live, rendered** instance in production (GD-C6), a headless one in
tests, which is what makes it testable at all.

**`kind` is decided on `distanceTo`, never on path length.** Proven in a throwaway spike
before this module was written: for an unreachable target, `distanceTo` is `Infinity` but
`pathTo` returns a collection of **length 1** — the target node alone. A `length === 0`
guard never fires, so a `length`-based check would highlight one unconnected node and
present it as a path. This is GD-C5 and it is the single worst silent failure in the scope.

`reversed` exists because a shortest path may traverse a directed edge backwards. Rendering
`A —relation→ B` for an edge that actually runs `B → A` would state a false direction, so
the chain renders `←` in that case.

## State ownership

Precedent, from `memory-graph-panel.tsx`: `typeFilter` lives in the panel because "the list
re-fetches on every visit, and a filter that reset itself each time would be useless".

The same is true of the new facets and encodings — and `MemoryGraphView` unmounts on a tab
switch. So they live in the **panel**, via `useMapTools()`, passed down as one object rather
than as sixteen more props.

Path state lives in the **view**: it is ephemeral, and GD-C3 requires the endpoints to
bypass the panel's `select()` entirely — that function toggles off on re-click and issues an
`openNodes` request per pick, so routing endpoints through it would fire two requests per
path and clear state mid-pick.

**Prop consolidation.** The view already takes twenty individual label props and this scope
would add roughly twenty-five more. `EntityDetail` already takes `copy={t.memoryGraph}`, so
the pattern exists; the map's labels are consolidated onto it. This is a targeted
improvement to the code being changed, not unrelated refactoring.

## Block D data flow

In the panel, alongside the existing debounce:

```
mapQuery ──250ms──▶ mapQueryApplied
                      │
       scope = names ──┴──▶ buildElements(substring predicate)
       scope = contents ───▶ searchGraph(ws, q, k = MAX_NODES) ──▶ Set<name> ──▶ matchNames
```

- `k = MAX_NODES` explicitly (GD-D3). The default is **10**, and ten hits seeding a map
  reads as the map hiding entities. Tying `k` to the node ceiling means the search cap can
  never bite before the cap that is already reported.
- A **monotonic stamp ref** guards the response, reusing the `selectStamp` pattern already
  in the panel — an async fetch behind a debounced input will otherwise apply a stale hit
  set (GD-D4).
- Only names cross this boundary. Structure still comes wholly from the browse projection,
  which is what keeps NFR-1 intact.
- Both archived and merged entities are excluded from the browse projection *and* from
  search (`visibleEntities` in `internal/memgraph/search.go`), so the two agree and a hit
  can never name something the map may not draw for that reason.

## Effects in the view, and their dependencies

Dependency lists are the failure surface here (NFR-3), so they are specified:

| Effect | Deps | Note |
|---|---|---|
| create instance | `[built, spread]` | builds with `buildStylesheet(...)`, not a default |
| write metrics into `data()` | `[built, base, communities, betweenness]` | no layout |
| apply stylesheet | `[built, sizeBy, colorBy, colorDomain]` | reads `paletteRef` |
| **highlight (single owner)** | `[built, selected, hopRadius, path]` | see below |
| resize/fit | `[expanded]` | as today |

`built`'s own memo must list every facet: `[entities, relations, typeFilter, query, matchNames, relationTypes, minObservations]`. A missing entry makes a control do nothing,
silently.

### `faded` has exactly ONE owner

Selection and path both need to fade the complement of their highlight set, and the current
selection effect opens with `instance.elements().removeClass("faded near picked")`. Split
across two effects, whichever ran last would own the fade and they would clobber each other:
a path highlight blinks out when a selection re-applies, and the reverse.

So there is **one** highlight effect. It takes `(selected, hopRadius, path)`, computes the
fade set **once**, and applies it; `.picked`, `.near` and `.path` are additive classes
applied within it. This also settles the case the split design left undefined — entering path
mode while the detail pane is open.

### Reference-typed memo deps are the jitter trap

`matchNames` and `colorDomain` are a `Set` and an array. Built inline — `new Set(hits.map(...))` in the panel body or in JSX — each is a **new identity every render**, so the
memo never hits, `built` changes on every render, the create effect re-runs, and **the layout
re-runs on every render**. That does not present as a dependency bug; it presents as "the
graph jitters", which is precisely the failure NFR-2 exists to prevent.

Therefore, pinned rather than left to implementation:

- **`matchNames` is state** in the panel, set once per search response inside the stamp
  guard — never derived in the render body.
- **`colorDomain` comes off the `built` memo** (or its own memo), never computed inline in the
  stylesheet effect's dep list.
- `relationTypes` is already safe: `useMapTools` holds it in state.

### The instance is created with its real stylesheet

The create effect builds its stylesheet inline today. It must call `buildStylesheet(...)`
from the start rather than constructing with a default and letting the stylesheet effect
replace it — otherwise a member whose saved encoding is not the default sees a visible flash
on every rebuild.

**The NFR-4 bug being fixed:** the selection effect currently depends on `[selected]` alone.
After a rebuild the instance is fresh and carries no classes while `selected` has not
changed, so an active selection loses its fading on any filter change. Pre-existing; this
scope multiplies its triggers, and the verification step exercises it directly.

`paletteRef` is set inside the create effect, which React runs before the stylesheet effect
on the same commit, so the ordering is guaranteed rather than hoped for.

## Focus radius

`closedNeighborhood()` iterated `hopRadius` times, unioning. Applies to selection fading
only — `buildElements`' one-hop query expansion is left alone (GD-A4), because the two have
different costs: fading is a class change, expansion changes the element set and re-runs the
layout.

## Layout of the disclosure

One `<details>`-style panel over the stage, open by default only when `expanded`
(fullscreen) is true — D-5. Groups, in order: **Filters** (type, relation type, minimum
observations) · **Encoding** (size, colour) · **Focus** (1/2/3 hops) · **Path** (mode
toggle) · **Legend** · **Insights**.

The legend's type rows drive the panel's existing `typeFilter` (GD-A1) rather than a second
type-narrowing state. Community and component rows select the group locally instead, because
there is no panel-level equivalent to reuse and inventing one would give the Browse tab a
filter it cannot express.

## i18n

`chatCopy.memoryGraph` grows in both `en` and `pt` (NFR-5). `lib/i18n/parity.test.ts` fails
on a key present in one and not the other, and is run per wave rather than once at the end.
