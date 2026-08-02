# memory-graph-mcp (webapp) — report

## Delivered

| File | What |
|---|---|
| `lib/memoryGraphProxy.ts` | Shared BFF plumbing — session, `role`→gateway path, allowlisted query forwarding, error mapping |
| `app/api/memory-graph/{route,nodes,search,recent}` | Four read-only BFF routes |
| `lib/memoryGraph.ts` | Typed client + `relationsFor` |
| `app/chat/memory-graph-drawer.tsx` | The drawer: three tabs, list, detail pane |
| `app/chat/uploads-sidebar.tsx` | Entry point beside the memory-document editor |
| `app/chat/chat-view.tsx` | Drawer mounted beside `SecretsDrawer` |
| `lib/i18n/chat.ts` | `memoryGraph` namespace, en + pt-BR |

## Gate — measured

```
npx tsc --noEmit     clean
npx vitest run       40 files, 534 tests passed  (was 38 / 504)
npx next build       clean; all four /api/memory-graph* routes registered
```

30 new tests: `lib/memoryGraph.test.ts` 13, `app/chat/memory-graph-drawer.test.tsx` 17.

`lib/i18n/parity.test.ts` passes with no additions to its `SHARED` allowlist — every
new leaf differs between en and pt-BR.

**`next lint` was not run**: it is unconfigured in this repo and opens an
interactive ESLint setup prompt. Configuring a linter is not part of this feature.

## One real bug, caught before it shipped

The detail pane originally took its relations from the `open_nodes` response. That
response filters edges to those with **both** endpoints among the names requested —
so asking for one entity returns its observations and an **empty** relation list,
every time. The relations section would have been permanently blank while looking
perfectly correct.

Fixed by deriving edges from the list already in hand (`relationsFor`), which costs
no extra request. It is an exported pure function with a test that states the reason,
so a future "simplify this" has something to fail against.

## Verifying that it renders, without a running stack

Every graph is empty until an agent writes one, and the proxy's live acceptance
criteria were never executed — so "it renders" could not be checked by looking at
the app. The suite runs `environment: "node"`, where effects never fire and no fetch
resolves, so the presentational pieces are exported and rendered directly against
the shapes the proxy actually returns.

That covers the three shapes that fail silently: the summary projection's `type`
versus the full one's `entityType` (both asserted, on different components, so a
"unify these" refactor breaks a test), an absent `confidence` rendering nothing
rather than `0%`, and epoch milliseconds.

Two of those assertions were wrong on the first run and the render was right:
`"90%"` contains `"0%"` so a naive absence check passed regardless (now counted),
and React escapes the apostrophe in the archived label to `&#x27;` (now unescaped in
the test rather than the copy being reworded to suit it).

## Three defects found by review after the gate was green

All invisible to the suite, because it runs `environment: "node"` — **no effect in
this component has ever executed** in a test.

1. **Both fetch effects depended on `workspace` (the object), not its fields.**
   `ChatShell` rebuilds it with `toWorkspace(fragment)` on every one of its own
   renders, so the whole graph re-fetched on any unrelated shell re-render — a
   sidebar toggle, a viewport resize. Not an infinite loop (the drawer's own state is
   local, so `setLoading` does not change the prop's identity), but a stream of
   pointless requests. `MemoryEditor`, in the same panel with the same prop,
   destructures for exactly this reason and carries a comment about it; this now
   matches.
2. **Mobile z-index.** The trigger lives inside `UploadsSidebar`, which on a phone is
   itself a right-edge overlay at `max-md:z-50`. At the SecretsDrawer's z-40/z-50 the
   backdrop rendered BEHIND that still-interactive sidebar: tap-outside did nothing
   and two overlays stacked on the same edge. Now z-[55]/z-[56] — above the sidebar,
   still below the z-[60] dialogs use.
3. **`select()` had no cancellation.** Click A then B quickly and A's response could
   land last, setting `detail` to A while `selected` was B. The pane looks the entity
   up by name, so it found nothing and silently vanished. Now stamped with a
   monotonic request id.

## Second round: the sliding track and provenance

The drawer is gone. The workspace panel is now a two-pane sliding track — a root
listing **workspace memory / knowledge graph / files**, each a button that slides to
its detail — and the panel resizes with no fixed maximum, clamped only by the viewport
so the handle cannot be dragged off-screen. `memory-graph-drawer.tsx` was deleted; its
presentational pieces moved to `memory-graph-views.tsx`, which is why their 17 tests
survived the move intact.

The memory-document editor lost its collapsible header: as a destination it meant
clicking the section, watching it slide, and then clicking a second closed header with
the same title. That change also surfaced a hardcoded English `Save`/`Saved` the
parity test could never see, because it never reached a locale dict.

Provenance renders in the entity detail pane as a **"where this came from"** list,
newest conversation first, each row navigating by fragment. Three states, all tested:
a live conversation (a link), one deleted from the webapp's own store while the graph
kept its id (rendered unavailable, never a link that goes nowhere), and no recorded
source at all — which is legitimate and gets a sentence explaining why rather than an
empty box.

`entitySources` is exported and pure: an entity built over months carries many
observations and a handful of sources, and getting the dedup or the newest-first
ordering wrong is invisible in a screenshot.

## Still not verified

The full path — member opens the drawer, sees entities an agent actually wrote —
needs the live stack, and depends on the proxy's AC-1/AC-2, which were never run.
What is proven: the routes build and register, the client sends the right queries,
and the views render real API shapes correctly.

Also unverified by anything automated: the mobile layout. Fix 2 above was reasoned
from the class lists, not observed at a narrow viewport. Worth a look on a phone
before trusting tap-to-dismiss.
