# memory-graph-mcp (webapp) — spec

The member-facing half of the proxy's knowledge-graph memory. The proxy side ships
four read-only endpoints and no screen; this is the screen.

Proxy spec: `crab-shell-proxy/.specs/features/memory-graph-mcp/spec.md`. Read its
`context.md` for the wire shapes — three of them are easy to read wrongly in a way
that compiles and renders blank.

## Problem

The agent now accumulates a knowledge graph on its own, through MCP tools the
member never sees. Without a screen, "what does it actually remember about me" is
answerable only by asking the bot and trusting the answer — which is exactly the
thing a memory feature must not require.

## Functional requirements

### FR-W1 — BFF routes

- **FR-W1.1** `GET /api/memory-graph`, `/nodes`, `/search`, `/recent` proxy the
  matching proxy routes, mirroring `app/api/memory/route.ts`: session attached
  here, `role` selects the gateway service path and is **never forwarded**,
  `tenant_id`/`subs_acc_id` are forwarded, 401 clears the session,
  `MyceliumConnectivityError` becomes 502.
- **FR-W1.2** Forwarded query parameters are an **allowlist** per route, not a
  pass-through of everything the browser sent.
- **FR-W1.3** No write route exists — the proxy exposes none to call.

### FR-W2 — The workspace panel's sliding track

> **Revised after first use.** This first shipped as an overlay drawer. Two problems
> showed up immediately: its trigger lived *inside* `UploadsSidebar`, which on mobile
> is itself a right-edge overlay, so the two competed for the same edge and the
> backdrop landed behind a still-interactive sidebar; and a drawer of fixed width is
> the wrong container for a graph. It is now a pane of the panel's own sliding track.

- **FR-W2.1** The workspace panel is a **two-pane sliding track**, the same idiom
  `unified-sidebar` uses. The root pane lists the three things a workspace holds —
  **workspace memory**, **knowledge graph**, **files** — each a button with a
  one-line blurb; clicking one slides to a detail pane rendering it, with a back
  control in the header.

  Two panes, not four: the animation is identical and the incoming pane simply
  renders different content. Both panes stay **mounted** through the slide —
  unmounting the outgoing one animates to a blank column — and the off-screen pane
  leaves the tab order via `inert`.

- **FR-W2.1a** Order is memory, graph, files. Memory and the graph answer "what does
  it know about me"; files are housekeeping. Asserted by position so a reshuffle is
  deliberate.

- **FR-W2.1b** The panel resizes with **no fixed maximum** — the graph is the reason,
  and a member inspecting it wants the column as wide as their screen. The only
  ceiling is the viewport, so the resize handle (the panel's left edge) can never be
  dragged off-screen and leave the width unrecoverable. The clamp is applied on
  **read** as well as on drag, or a width persisted on a wide monitor would swallow
  the whole screen on a laptop.

- **FR-W2.1c** The memory-document editor loses its collapsible header. As a section
  stacked in the panel it needed one; as a destination it meant clicking the section,
  watching it slide, then clicking a second closed header with the same title.
  Mounting is opening, so the document loads on mount.
- **FR-W2.2** Three tabs: **Entities** (`read_graph` summary), **Search**
  (BM25), **Recent** (24h).
- **FR-W2.3** Selecting an entity opens a detail pane with every observation, its
  timestamp, its confidence when present, and the entity's relations.
- **FR-W2.4** The visible label is "Knowledge graph" / "Grafo de conhecimento" —
  never "memory". The panel already has a memory, and `t.memory.*` is
  `MEMORY_CUSTOM.md`. Two different things need two different names, and they now sit
  in the same menu, which makes the distinction load-bearing rather than cosmetic.
- **FR-W2.5** The browse list is re-fetched on every open, never cached. The agent
  writes between openings, and a stale list is the one failure that would make this
  panel actively lie about what the bot knows.
- **FR-W2.6** An empty graph — the state of every graph in every environment until
  an agent writes one — explains itself rather than looking broken.
- **FR-W2.7** Archived and merged entities are labelled in the detail pane. They
  are reachable by name even though the browse list hides them, and an unlabelled
  retired fact reads as a current one.

### FR-W3 — Wire shapes

- **FR-W3.1** `read_graph`'s summary projection names the entity type **`type`**;
  only the full projection uses **`entityType`**. Modelled as two distinct types
  (`SummaryEntity`, `Entity`), because conflating them renders an empty badge on
  every browse row and still type-checks.
- **FR-W3.2** `searchResults[].entity_name` is snake_case inside a camelCase
  envelope. Preserved, not normalised — it is deliberate fidelity to the upstream
  project the proxy's tools were ported from.
- **FR-W3.3** `Observation.confidence` is **absent**, not zero, when the record
  never carried one, and `timestamp` is epoch **milliseconds**.
- **FR-W3.4** A single-entity `open_nodes` returns **no relations** — the proxy
  keeps only edges with both endpoints among the requested names. The detail pane
  therefore derives edges from the list already loaded, via `relationsFor`.

## Out of scope

- **Writing.** No curation (archive/delete/merge), no manual entity creation. The
  proxy has no write route; adding one is a proxy change first.
- **Node-link visualisation.** A list with a detail pane answers "what does it
  remember"; a force-directed graph answers "what does the shape look like", which
  nobody asked for.
- **Admin surface.** All four proxy routes are member-scoped
  (`authorizeSecret`); there is no admin route to build against.

## Known limitation

An entity opened from **Recent**, or an archived one the browse list omits, shows
only the relations present in whatever is currently loaded (FR-W3.4). Showing its
full neighbourhood needs a per-entity read the proxy does not expose. Stated here
rather than left for someone to discover.
