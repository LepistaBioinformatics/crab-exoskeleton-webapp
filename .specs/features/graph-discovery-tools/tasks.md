# graph-discovery-tools — Tasks

Waves land in order **0 → A → B → C → D**. Block A carries most of the usability the
request was actually about and depends on nothing else; the analytic and path work sits on
top of it.

**The app is run and looked at after every wave, in the column and in fullscreen.** The
map's first version "looked plausible in a screenshot and was unusable in practice" and
burned two rounds of fixes before being scrapped. Per-wave visual verification is the cheap
insurance against repeating that.

## The standard gate — real commands, measured baselines

Written out rather than assumed, because a gate naming a command that does not work gets
skipped. All three were run against the current tree on 2026-08-11:

| Command | Baseline | Meaning of "pass" |
|---|---|---|
| `npm test` | **59 files, 826 tests, all green** | still green, plus the new tests |
| `npm run build` | **exit 0** | exit 0. This is the real type-check gate for source. |
| `./node_modules/.bin/tsc --noEmit` | **5 errors, all in `.test.*` files, none in source** | **no NEW** errors — the 5 are pre-existing |

**Use `./node_modules/.bin/tsc`, never `npx tsc`.** From outside the webapp directory `npx tsc`
resolves to an unrelated npm package called `tsc` — it prints "This is not the tsc command you are
looking for" and **exits 1 with no error list**, which a `grep -c "error TS"` reads as zero errors.
A gate that reports "clean" when it did not run is worse than no gate. Hit during this feature's
own implementation.

**`npm run lint` is NOT a gate: it does not work in this repo.** It runs the deprecated
`next lint`, there is no ESLint config anywhere, and `eslint` is not a dependency — the
command drops into an interactive setup prompt and would hang a scripted gate. Fixing that is
out of scope here; it is recorded so nobody writes "lint clean" into a checklist again.

`lib/i18n/parity.test.ts` is part of `npm test` and fails loudly on a key added to `en` and
not `pt`. It is run per wave, not once at the end.

---

## Wave 0 — seams and the pre-existing bug

### T0.1 — One highlight effect, and fix its dependencies
- **What:** turn the selection effect into the **single owner of `faded`**, taking
  `(selected, hopRadius, path)` and computing the fade set once. Deps
  `[built, selected, hopRadius, path]`. `.picked` / `.near` / `.path` stay additive within it.
- **Where:** `app/chat/memory-graph-view.tsx`
- **Two problems, one fix:**
  1. **Pre-existing bug (NFR-4).** The effect depends on `[selected]` alone. After a rebuild
     the instance is fresh and carries no classes while `selected` has not changed, so an
     active selection loses its fading on any filter change. This scope adds five new rebuild
     triggers; fixing it afterwards means debugging it through all of them.
  2. **A bug this scope would otherwise introduce.** Selection and path both fade the
     complement of their highlight set, and the effect opens with
     `elements().removeClass("faded near picked")`. As two effects, whichever ran last would
     own the fade and they would clobber each other — the path blinking out when a selection
     re-applies, and the reverse.
- **Also settles** the case a split design leaves undefined: entering path mode with the
  detail pane open.
- **Done when:** selecting a node, then typing in the map filter, leaves the selection still
  faded-in. In wave 0 `path` is always null, so this is pure groundwork plus the bug fix.
- **Tests:** `graph-highlight.test.ts`, over a **headless** instance.
  **Corrected from the original plan**, which said "manual — this is Cytoscape-instance behaviour
  and jsdom has no canvas" and promised a `withinRadius` pure function that was never written. Both
  were wrong: a headless Cytoscape instance needs no container and carries classes perfectly well,
  as `graph-paths.test.ts` and `graph-metrics.test.ts` already demonstrate. The whole effect body
  moved to `app/chat/graph-highlight.ts` and is tested directly — which matters because this is the
  riskiest change in the feature and no visual pass ever ran.

### T0.2 — Consolidate the map's label props onto `copy`
- **What:** replace the view's twenty individual label props with `copy={t.memoryGraph}`.
- **Where:** `memory-graph-view.tsx`, `memory-graph-panel.tsx`
- **Reuses:** `EntityDetail` already takes `copy={t.memoryGraph}` — the pattern exists.
- **Why:** this scope would otherwise add ~25 more label props to a component that already
  has 20. Targeted improvement to the code being changed.
- **Done when:** no behaviour change; the view reads every label off `copy`.

### T0.3 — `useMapTools()`
- **What:** the tool state — `relationTypes`, `minObservations`, `sizeBy`, `colorBy`,
  `hopRadius`, `searchScope` — plus a typed setter.
- **Where:** `app/chat/use-map-tools.ts` (new), called in `memory-graph-panel.tsx`
- **Why in the panel:** `MemoryGraphView` unmounts on a tab switch, and the existing
  `typeFilter` lives in the panel for exactly this reason — "a filter that reset itself each
  time would be useless".
- **Done when:** state survives switching to Browse and back.
- **Tests:** `use-map-tools.test.ts` — defaults, and that a set of one key preserves the rest.

---

## Wave A — legibility (GD-A1…A4)

### TA.1 [P] — Facets in `buildElements`
- **What:** `GraphFilter` gains `relationTypes`, `minObservations`, `matchNames`; add pure
  `relationTypeCounts(relations)`.
- **Where:** `app/chat/graph-elements.ts`
- **Done when:** the six-step order in `design.md` holds — relation gate first, then the
  entity gates, then the match set, then one-hop expansion over gated relations, then the
  cap, then edges.
- **Tests:** `graph-elements.test.ts` — a hidden relation type drops the edge and **keeps**
  both nodes when there is no query; `minObservations` gates nodes; `matchNames` is
  intersected with the pool so a hit excluded by the type filter stays excluded;
  `relationTypeCounts` is computed from the **unfiltered** list.

### TA.2 [P] — Copy for wave A
- **What:** legend, hover, facet and radius labels in `en` and `pt`.
- **Where:** `lib/i18n/chat.ts`
- **Gate:** `lib/i18n/parity.test.ts` green.

### TA.3 — The disclosure shell + facet controls
- **What:** `memory-graph-tools.tsx` — the panel over the stage, open by default only in
  fullscreen (D-5). Groups: Filters, Focus. Encoding/Path/Insights groups are stubbed for
  later waves.
- **Depends on:** T0.2, T0.3, TA.1, TA.2
- **Done when:** all three facets narrow the map; the disclosure is collapsed in the column
  and open in fullscreen.

### TA.4 — Legend
- **What:** `memory-graph-readouts.tsx` — swatch, label, count per value of the active colour
  encoding. In wave A there is only one encoding (type), and type rows drive the panel's
  **existing** `typeFilter` (GD-A1).
- **Reuses:** `typeColorIndex`, `entityTypeCounts`, and `BrowseList`'s clearable-chip treatment
- **Domain vs counts, and why they differ:** rows come from `entityTypeCounts` over the
  **unfiltered** entities; counts are of the **rendered** set and may read zero. If rows came
  from the rendered set, clicking "person" would collapse the legend to one row — `typeFilter`
  is a hard gate — leaving no other type to switch to and no way back except a control in a
  different section of the disclosure. The active row is a **clearable chip**.
- **Done when:** every colour on screen is named; clicking a row narrows both the map and the
  Browse tab (same state); and the legend still lists every type **after** a click, with the
  active one clearable.
- **Tests:** `memory-graph-readouts.test.tsx` — rows come from the unfiltered domain, counts
  from the rendered set, a filtered legend still lists every type, and a click reports the
  type (and clears when the active row is clicked again).

### TA.5 — Hover tooltip
- **What:** name, type, observation count, relation count on `mouseover`. Positioned from
  `node.renderedPosition()` and **clamped to the stage box**. Cleared on `mouseout`, `pan`,
  `zoom`, `tapstart`.
- **Where:** `memory-graph-view.tsx` + a presentational piece in `memory-graph-readouts.tsx`
- **Done when:** hovering explains a node without opening the detail pane, and the tooltip
  never leaves the stage in the ~280px column.
- **Tests:** the clamp is a pure function and is unit-tested; the hover wiring is manual.

### TA.6 — Focus radius
- **What:** 1 (default) / 2 / 3, applied by iterating `closedNeighborhood()` **inside the
  single highlight effect from T0.1**. Selection fading **only** — the query expansion in
  `buildElements` is untouched (GD-A4).
- **Depends on:** T0.1
- **Done when:** radius 3 lights three hops and does **not** rebuild the graph — the layout
  must not move.
- **Tests:** `graph-highlight.test.ts` asserts each radius against a line graph `a—b—c—d`, which is
  the shape that makes an off-by-one hop visible; a star would not.

### TA.7 — Wave A gate
- Standard gate, plus: **run the app**; exercise a facet change **while a node is selected**
  (NFR-4); confirm the layout does not move on a radius change.

---

## Wave B — analytic readings (GD-B1…B5)

### TB.1 — `graph-metrics.ts`
- **What:** `computeBaseMetrics` (PageRank + components + isolated), `computeCommunities`,
  `computeBetweenness`, over one shared headless builder.
- **Where:** `app/chat/graph-metrics.ts` (new)
- **Isolated on purpose:** this was the highest-uncertainty piece in the scope and does not
  share a task with UI work.
- **Already verified in a spike** (`cytoscape@3.34.0`, 7/7 green) and **must be re-asserted
  here**: `pageRank({}).rank(node)`, `betweennessCentrality({}).betweenness(node)` and
  `markovClustering({attributes:[() => 1]})` are accessors/collections, not per-node numbers;
  `headless: true, styleEnabled: false` constructs with no container under vitest;
  `components()` separates a lone node; and **`dijkstra` on an unreachable target gives
  `distanceTo === Infinity` with a `pathTo` of length 1**.
- **Tests:** `graph-metrics.test.ts` — the spike's assertions, plus: PageRank normalised to
  `(0,1]` against the max; **every entity gets a community id** even if the clusterer skipped
  it; `isolated` finds exactly the size-one components; degree is *not* computed here.

### TB.2 [P] — `graph-stylesheet.ts`
- **What:** `buildStylesheet({palette, sizeBy, colorBy, colorDomain})`.
- **Done when:** the default encoding reproduces the current `14 + √min(obs,100)·4`
  **verbatim**; normalised metrics use `14 + √v·40`; area stays ∝ value.
- **Tests:** `graph-stylesheet.test.ts` — the default node rule is byte-identical to today's;
  each `colorBy` reads the matching data key; a value outside `colorDomain` still resolves.

### TB.3 [P] — Copy for wave B
- Encoding names, metric names, insights and isolated-entity labels, and the **off-map** row
  label, in `en` and `pt`.

### TB.4 — Wire metrics and encodings into the view
- **What:** the metrics-into-`data()` effect and the stylesheet effect, per the dependency
  table in `design.md`.
- **Depends on:** TB.1, TB.2, TB.3
- **Critical:** metrics are **not** inputs to `buildElements`. If they were, `built` would
  depend on them and switching to betweenness would re-run the layout (GD-B5).
- **`colorDomain` must be memoized** — off the `built` memo or its own. Computed inline it is
  a new array identity each render and re-applies the whole stylesheet continuously.
- **The create effect builds with `buildStylesheet(...)` from the start**, not with a default
  that the stylesheet effect then replaces — otherwise a member whose saved encoding is not
  the default sees a flash on every rebuild.
- **Done when:** switching size or colour recolours/resizes with the layout **completely
  still**; betweenness is computed only when selected; communities only when selected.

### TB.5 — Insights list
- **What:** top entities by the active size metric, plus the isolated-entity count. Global
  scores, with rows not currently drawn **labelled off-map** (D-6). A row calls the panel's
  `select()`.
- **Done when:** an off-map row is visibly marked as such and its click opens the detail pane
  without pretending the map responded.
- **Tests:** off-map rows are flagged against a rendered-name set; ordering follows the
  active metric.

### TB.6 — Wave B gate
- Standard gate, plus: **run the app**; confirm the layout is still on every encoding switch;
  confirm the legend follows the active colour encoding.

---

## Wave C — path between entities (GD-C1…C7)

### TC.1 — `graph-paths.ts`
- **What:** `findPath(cy, from, to)` returning `kind`, `nodes`, `edgeIds`, `steps`.
- **GD-C5, the worst trap in the scope:** `kind` is decided on **`distanceTo === Infinity`**,
  never on path length. `pathTo` returns length **1** for an unreachable target, so a
  `length === 0` guard never fires and the mode would highlight one unconnected node and
  present it as a path.
- **Undirected** (D-4) — which is `dijkstra`'s default, so no option is passed.
- `reversed` per step, because a shortest path may traverse a directed edge backwards and
  rendering `A —rel→ B` for an edge that runs `B → A` would state a false direction.
- **Tests:** `graph-paths.test.ts` over a headless instance — a found path with correct
  alternating nodes/edges; `unreachable` via a disconnected node; `endpoint-missing`;
  `reversed` set on a backwards traversal; an undirected path found where a directed one
  would not be.

### TC.2 — Path mode in the view
- **What:** mode toggle, endpoint picking owned **inside the view** (GD-C3 — never through
  the panel's `select()`, which toggles off on re-click and fires `openNodes` per pick), path
  applied as classes, escapable.
- **Depends on:** TC.1, T0.1
- **Feeds the single highlight effect from T0.1** — it does **not** add a second effect that
  touches `faded`. That is the whole reason T0.1 restructured it in wave 0.
- **Done when:** picking two nodes highlights the path with the layout still; Esc and the
  toggle both leave the mode; the highlight survives an unrelated re-render; a selection and a
  path do not clobber each other's fading.

### TC.3 — Path chain readout + states
- **What:** the readable `A —rel→ B ←rel— C` chain, and three distinct states: found,
  unreachable, endpoint-not-on-map (GD-C6 — a different fact with a different fix than "no
  path").
- **Where:** `memory-graph-readouts.tsx`, copy in `lib/i18n/chat.ts`

### TC.4 — Wave C gate
- Standard gate, plus: **run the app**; verify a facet change **while a path is highlighted**
  keeps the highlight (NFR-4); verify all three path states are reachable and readable.

---

## Wave D — server-side search feeding the map (GD-D1…D5)

### TD.1 — Verify the search route passes `k`
- **What:** confirm `app/api/memory-graph/search/route.ts` forwards `k` to the proxy.
- **Why a task:** `k` is the whole point of GD-D3 and it crosses three layers — the exact
  shape this project's history records as "the parameter silently lost in one layer".
- **Done when:** a non-default `k` is observed reaching the proxy.

### TD.2 — Content-search scope in the panel
- **What:** `searchScope: "names" | "contents"`. On `contents`, call
  `searchGraph(ws, q, MAX_NODES)`, keep **only the hit names** as `matchNames`.
- **Depends on:** TA.1, T0.3, TD.1
- **`matchNames` must be STATE**, set inside the stamp guard — never a `Set` derived in the
  render body or built inline in JSX. A fresh `Set` identity each render makes `built`'s memo
  miss, re-runs the create effect, and **re-runs the layout on every render**. It presents as
  "the graph jitters", not as a dependency bug, and it is exactly what NFR-2 forbids.
- **`k = MAX_NODES` explicitly** — the default is 10, and ten hits seeding a map reads as the
  map hiding entities. Tying `k` to the node ceiling means the search cap can never bite
  before the cap that is already reported (GD-D3).
- **Monotonic stamp ref** guarding the response, reusing the panel's existing `selectStamp`
  pattern rather than inventing one — an async fetch behind a debounced input will otherwise
  apply a stale hit set (GD-D4).
- **Done when:** an entity findable only by its observation text appears on the map, with its
  neighbours as context.

### TD.3 — The scope toggle and its states
- **What:** the names/contents toggle on the map's filter input, plus copy. A **failed** or
  **empty** content search is distinguishable from a filter that matched nothing (GD-D5).
- **Done when:** all three outcomes read differently.

### TD.4 — Wave D gate
- Standard gate, plus: **run the app**; type fast enough to race two searches and confirm the
  stamp guard holds; confirm NFR-1 by review — no field the browse projection does not carry
  reaches the element builder.

---

## Traceability

| Req | Tasks |
|---|---|
| GD-A1 | TA.4 |
| GD-A2 | TA.5 |
| GD-A3 | TA.1, TA.3 |
| GD-A4 | TA.6 |
| GD-B1 | TB.1 |
| GD-B2, GD-B3, GD-B5 | TB.2, TB.4 |
| GD-B4 | TB.5 |
| GD-C1, C2, C4, C5 | TC.1, TC.3 |
| GD-C3, C7 | TC.2 |
| GD-C6 | TC.1, TC.3 |
| GD-D1, D2 | TD.2 |
| GD-D3 | TD.1, TD.2 |
| GD-D4 | TD.2 |
| GD-D5 | TD.3 |
| NFR-1 | TD.2, TD.4 |
| NFR-2 | TB.4, TA.6, TC.2 |
| NFR-3 | TA.1, TA.3 |
| NFR-4 | T0.1, TA.7, TC.4 |
| NFR-4b | T0.1, TA.6, TC.2 |
| NFR-4c | TB.4, TD.2 |
| NFR-5 | TA.2, TB.3, TC.3, TD.3 |
| NFR-6 | TA.1, TB.1, TB.2, TC.1 |
| NFR-7 | T0.2, T0.3, TA.3, TA.4 |
