# graph-discovery-tools — implementation report

Branch `feat/graph-discovery-tools`. All four waves implemented. **Not committed** — the repo
owner's standing instruction is that nothing is committed without an explicit request.

## Gate, as measured

| Command | Before | After |
|---|---|---|
| `npm test` | 59 files / 826 tests green | **66 files / 940 tests green** |
| `./node_modules/.bin/tsc --noEmit` | 5 errors, all pre-existing, all in `.test.*` | **5 — unchanged; none in source** |
| `npm run build` | exit 0 | **exit 0** |

**Not verified: the app running.** See "What is not verified" below. This is the one part of the
spec's own verification section that was not carried out.

## What the empirical checks changed

Five things were designed one way and built another because a measurement said so. All five were
found before the code depended on them.

### 1. `pathTo` on an unreachable target returns length 1, not 0

Measured in a throwaway spike before `graph-paths.ts` existed. `distanceTo` gives `Infinity`
correctly, but `pathTo` returns the target node **alone** — a collection of length one. A
`path.length === 0` guard never fires, so path mode would have highlighted a single unconnected
entity and presented it as a route. Became **GD-C5**, held by a test.

### 2. Cytoscape's `pageRank` is DIRECTED, with no undirected option

Found by a failing test, not by reading docs. On the fixture `a→hub`, `b→hub`, `c→hub`, the hub is
a rank sink and `c` — which has a relation — scored **exactly** what an entity with no relations
scored. This graph has no direction convention (the agent writes `a knows b` or `b knows a` as it
pleases), so the directed reading measures the convention instead of the content.

**Fix:** `graph-metrics.ts` builds its headless graph with **reciprocal edges** for PageRank and
Markov clustering. Betweenness keeps the plain graph — it computes undirected itself, and parallel
edges would change what it counts. Pinned by a test that names the failure.

### 3. `faded` needed one owner before path mode existed

Selection and path both fade the complement of their own highlight, and the selection effect opens
with `removeClass("faded near picked")`. As two effects, the last to run would win and they would
clobber each other. Restructured in wave 0 into a single highlight effect over
`(selected, hopRadius, path)`. Recorded as **NFR-4b**.

### 4. Node colours already shifted when the map was filtered

Pre-existing, and invisible until something named the colours. The stylesheet indexed
`built.types`, which shrinks under a filter — so narrowing to one type moved it to index 0 and
**every node changed colour**. With a legend that would have been a legend that lies. The colour
domain is now the whole graph's types, alphabetically, which is stable under every filter.

### 5. `npx tsc` silently does not run

From outside the webapp directory, `npx tsc` resolves to an unrelated npm package named `tsc`,
prints "This is not the tsc command you are looking for", and exits 1 **with no error list** — so
`grep -c "error TS"` reads zero and the gate reports clean. Two measurements were taken this way
before it was caught. Gate now specifies `./node_modules/.bin/tsc`.

### 6. Untyped entities had a colour the legend never named — a live defect, found in review

Reachable from data the codebase already expects. `colorDomain` and `buildElements` both normalise
a blank `entityType` to `"unknown"`, so such an entity is **drawn in a real colour** and even
counted under `"unknown"` by `renderedCounts` — but the legend's domain came from
`entityTypeCounts`, which opens with `if (!e.type) continue`. No row, nothing to explain the
colour, nothing to filter by. Directly contradicts GD-A1.

Every legend test used typed fixtures, which is why it survived to review.

**Fix:** a new `legendTypeCounts` beside `entityTypeCounts` in `lib/memoryGraph.ts`, normalising
before counting. `entityTypeCounts` is left alone — the Browse chip row genuinely does not want an
"unknown" chip. And because `typeFilter` is **shared** between the two tabs, `BrowseList`'s filter
now compares `(e.type || "unknown") === typeFilter` too; otherwise picking the new row narrowed the
map correctly and left the entity list empty.

### 7. The highest-risk logic had no test, and the stated reason was wrong

`tasks.md` T0.1 claimed the fade-set computation was "extracted as a pure function and is
unit-tested". It was neither: the logic stayed inline in the view, and `withinRadius` was never
written. The excuse given — Cytoscape-instance behaviour, jsdom has no canvas — is contradicted by
`graph-paths.test.ts` and `graph-metrics.test.ts`, which drive **headless** instances with no
container. A headless graph carries classes perfectly well; it just does not draw.

That gap mattered more than usual: the single-`faded`-owner restructure is the riskiest change in
the feature, it is why wave 0 exists, and with no visual pass nothing at all would have caught a
regression in it.

**Fix:** extracted to `app/chat/graph-highlight.ts` with 13 headless tests covering hop radius 1/2/3
on a line graph, path-beats-selection precedence, falling back to the selection when a path clears,
the mid-trace endpoint mark, an unreachable path leaving the graph alone, a path naming absent
elements bailing rather than blanking the view, and reapplication after a rebuild being idempotent.

## Spec deviations

| # | Deviation | Reason |
|---|---|---|
| 1 | `relationTypeCounts` lives in `lib/memoryGraph.ts`, not `app/chat/graph-elements.ts` as `tasks.md` said | `entityTypeCounts` is already there and the two are the same kind of function. Consistency beat the plan. |
| 2 | **Legend rows are read-only under the community and component encodings.** GD-A1 said they would "select that group". | There is no group filter among the facets to drive, and inventing one would put a third claimant on `faded` alongside selection and path — which NFR-4b forbids. Marked `SPEC_DEVIATION` in `memory-graph-readouts.tsx`. The discovery value (seeing and counting the clusters) is unaffected. |
| 3 | Node data gained `relations` (the degree) — not in the original element spec | The hover card and the degree size encoding both need it, and `SummaryEntity.relationCount` already carries it. Taken from the projection rather than counted off drawn edges, so it does not shrink when the member filters. |
| 4 | The no-match state now keeps the tools panel on screen | Not in the spec, and a dead end without it: the old branch returned a bare empty state, stranding a member who filtered everything away with no control able to undo it. Same class of dead end as the legend's. |
| 5 | PageRank and Markov clustering run on a reciprocal graph | See finding 2 above. GD-B1 did not anticipate it. |
| 6 | **NFR-7 not met.** `memory-graph-view.tsx` went from 391 to **697** lines, where the plan was for it to shrink to "the Cytoscape lifecycle and the stage". | Presentation *did* move out (`memory-graph-tools.tsx`, `memory-graph-readouts.tsx`) and the pure logic *is* in four new tested modules. What accumulated instead is derivation: `colorDomain`, `legendDomain`, `renderedCounts`, `insightRows`, `groupKey` and the metric memos. Stated rather than claimed met. |

**Follow-up, not done here:** the derivations in deviation 6 are a clean extraction into a
`useGraphDerivations(entities, relations, built, tools)` hook — pure, no Cytoscape, directly
testable. Deliberately not attempted at the end of a large change, because it touches every
dependency list in the file and those are this feature's declared failure surface (NFR-3).

## What is not verified

**The app was never run and looked at.** The spec asks for per-wave visual verification and it did
not happen. What blocks it:

- The stack is up in Docker, but `chat-webapp` serves a **built image**, so it would need
  `docker compose up -d --build chat-webapp` to pick up this tree — a rebuild of a running service
  in the owner's environment, which was not authorised.
- A host-side `next dev` is not a substitute: `chat-webapp-postgres` publishes **no host port**, so
  the dev server cannot reach the database.
- Reaching the panel needs an authenticated browser session and a workspace whose agent has
  actually written a graph.

**What this means for confidence.** The pure logic is well covered — 114 new tests over filters,
metrics, encodings, paths, highlighting and the readouts, several of them written to pin behaviour
that had already been measured wrong once. What is NOT covered is anything only a browser shows: whether
the tools panel is usable at ~280px, whether the hover card lands where the clamp says it does,
whether the layout genuinely holds still across an encoding switch, and whether the path highlight
reads clearly on a dense graph.

That last set is exactly the category the map's first version failed in — it "looked plausible in a
screenshot and was unusable in practice". So this is a real gap, not a formality.

## Suggested verification order, once the app is running

1. Open the Map tab in the sidebar column. The tools button sits top-left; the truncation notice
   moved to top-right to make room.
2. Open the legend. Every colour on screen should be named. Click a type — **the legend must still
   list every type**, with the filtered-out ones reading 0.
3. Select a node, then change a facet. **The selection must keep its fading** (this is the wave-0
   bug fix).
4. Switch size to Influence, then colour to Cluster. **The layout must not move at all.**
5. Trace a path between two entities on opposite sides of the graph. Check the chain's arrows
   against the graph's own arrowheads — a `←` means the walk went against the stored direction.
6. Trace to an isolated entity: should say "nothing connects these two", not show a lone node.
7. Switch the filter scope to Contents and search for a word that appears only in an observation,
   never in a name. The entity should appear with its neighbours as context.
8. Enter fullscreen. The tools panel should open by itself; leaving fullscreen should close it.
