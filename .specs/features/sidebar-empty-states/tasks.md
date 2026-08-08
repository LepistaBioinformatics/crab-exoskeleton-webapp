# Tasks — Consistent empty states across the sidebars

Spec: `./spec.md`

**Gate for every task** (run from `crab/crab-exoskeleton-webapp`):

```
yarn test && npx tsc --noEmit
```

`yarn test` includes `lib/i18n/parity.test.ts`, which fails on any leaf string
identical across `en` and `pt`. Treat it as part of the gate, not a follow-up.

Two caveats found while running these:

- `yarn lint` is `next lint`, deprecated in Next 15, and this repo has no ESLint
  config — it drops into an interactive setup prompt and gates nothing. Dropped.
- `npx tsc --noEmit` has a **baseline of 4 errors**, all in test files untouched by
  this feature (`canvas-activity.test.ts`, `scheduled-tasks.test.tsx`,
  `unified-sidebar.test.tsx`). The gate is "still 4", not "zero".

---

## T01 — The `PanelEmpty` primitive

**What:** Create the shared empty-state component.
**Where:** `components/ui/panel-empty.tsx` (new), `components/ui/panel-empty.test.tsx` (new)
**Depends on:** —
**Reuses:** `class-variance-authority` and the `cva` usage in `components/ui/badge.tsx`;
`cn`/`tailwind-merge` if the other `components/ui/*` files use it (check first).

Implements R1.1–R1.5:

- `PanelEmpty({ icon, title, body })`, no `useT`, no state (NG2).
- One anchor, `px-4 py-8`, with no variant (R1.3 as amended — the `align: "top" |
  "fill"` pair was built, looked at, and removed). No inline conditional or
  interpolated `className` anywhere (project rule).
- Anatomy exactly as R1.4.
- Wrapper carries `data-empty-state=""`.

**Done when:** rendering `<PanelEmpty title="x" />` and `<PanelEmpty title="x" body="y"
icon={Network} />` both produce the marker, neither emits `h-full` or
`justify-center`, and `body`/`icon` are genuinely optional.
**Tests:** `panel-empty.test.tsx`, `renderToStaticMarkup` (the suite is
`environment: "node"` — follow the pattern in `memory-graph-views.test.tsx`).
**Gate:** as above.

---

## T02 — Copy: all new keys, both locales

**What:** Add the 14 new key pairs from R5.2 and revise the existing titles per R5.3.
**Where:** `lib/i18n/chat.ts` (`en` block and `pt` block)
**Depends on:** —
**Reuses:** the file's own commenting convention — every non-obvious key carries a
comment saying *why* it is worded that way.

- Add: `memoryGraph.noneOfTypeHint`, `memoryGraph.mapNoMatchHint`,
  `memoryGraph.searchIdle.{title,body}`, `memoryGraph.noResultsHint`,
  `memoryGraph.recentCopy.nothingHint`, `uploads.{noneYetHint,noMatchesHint}`,
  `secrets.noneHint`, `history.{noneYetHint,noMatchesHint}`,
  `workspaceNav.{noneHint,noMatchHint}`.
- Shorten `workspaceNav.none` to a title and move "ask an operator to add you to one"
  into `workspaceNav.noneHint` (R4.4).
- Re-read every *existing* title touched by this feature: `memoryGraph.empty.title`,
  `memoryGraph.noResults`, `memoryGraph.noneOfType`, `memoryGraph.recentCopy.nothing`,
  `uploads.noneYet`, `uploads.noMatches`, `scheduledTasks.none`,
  `scheduledTasks.allFinished`, `secrets.none`, `history.noneYet`,
  `history.noMatches`. A title that reads as a paragraph gets split (R5.3).
- Bodies say what the member can do next.

**Done when:** `tsc` accepts the `pt: ChatDict` block and `parity.test.ts` passes with
no new entries in its `SHARED` whitelist (every new pt string is a real translation).
**Tests:** `lib/i18n/parity.test.ts` (existing).
**Gate:** as above.

---

## T03 — Graph: Entities, Search and Recent lists

**What:** Route the three pure list views through `PanelEmpty`. R2.1, R2.2, R2.6, R2.7.
**Where:** `app/chat/memory-graph-views.tsx`, `app/chat/memory-graph-panel.tsx`
(prop wiring only), `app/chat/memory-graph-views.test.tsx`
**Depends on:** T01, T02
**Reuses:** `PanelEmpty`; lucide `Network`, `Filter`, `SearchX`, `Clock`.

- `BrowseList`: empty-graph branch (`:84`) and type-filter branch (`:128`).
  Add a `noneOfTypeHint` string prop beside the existing `noneOfTypeLabel`; keep the
  props-as-strings contract (NG2).
- `SearchList`: no-hits branch (`:182`). Add a `noResultsHint` string prop.
- `RecentList`: `nothing` branch (`:236`). Extend its `copy` object with `nothingHint`.
- Wire the new props from `memory-graph-panel.tsx`.
- Update `memory-graph-views.test.tsx` for the new prop signatures; keep its existing
  assertions on `g.empty.title` / `g.empty.body`.

**Done when:** all three branches render `data-empty-state` with an icon, a title and a
body, and the existing empty-graph assertions still pass.
**Tests:** `memory-graph-views.test.tsx` (updated).
**Gate:** as above.

---

## T04 — Graph: Map pane and the Search idle state

**What:** R2.3, R2.4, R2.5.
**Where:** `app/chat/memory-graph-view.tsx`, `app/chat/memory-graph-panel.tsx`
**Depends on:** T01, T02
**Reuses:** `PanelEmpty`; lucide `Share2`, `Search`.

- `memory-graph-view.tsx:282-290`: replace the hand-rolled centered box. **Keep the
  `entities.length === 0 ? empty : noMatch` branch** (NG1) — it now picks between two
  full `PanelEmpty` configurations rather than two strings, so the component needs
  title+body props for each side (e.g. `emptyTitle`/`emptyLabel` and
  `noMatchLabel`/`noMatchHint`).
- `memory-graph-panel.tsx`: add the Search idle branch —
  `mode === "search" && hits === null && !loading` currently paints a blank pane.
  Place it inside the same `{!loading && ...}` fragment as the other mode branches so
  it cannot race the spinner.

**Done when:** opening Search paints a message instead of nothing; the map shows a
titled empty state on a fresh graph and a distinct one when the name filter hides
everything.
**Tests:** covered by T08's structural test for the map branch. The idle branch lives
in a stateful panel and is verified visually (T09).
**Gate:** as above.

---

## T05 — Files pane

**What:** R3.1, R3.2.
**Where:** `app/chat/uploads-sidebar.tsx:813-817`
**Depends on:** T01, T02
**Reuses:** `PanelEmpty`; lucide `FolderOpen`, `Search`.

Keep the `q ? noMatches : noneYet` branch (NG1); each side gets its own title+body.

**Done when:** both branches render through `PanelEmpty`, and
`uploads-sidebar.track.test.tsx` still passes (it renders first paint with no data).
**Tests:** `uploads-sidebar.track.test.tsx` (existing, must keep passing).
**Gate:** as above.

---

## T06 — Scheduled tasks and Agent secrets

**What:** R3.3, R3.4, R3.5, and the NG3 typography alignment.
**Where:** `app/chat/scheduled-tasks-panel.tsx:374-389`, `app/chat/secrets-drawer.tsx:259`,
`app/chat/memory-graph-views.tsx` (`EntityDetail` only)
**Depends on:** T01, T02
**Reuses:** `PanelEmpty`; lucide `CalendarClock`, `CheckCheck`, `KeyRound`.

- Tasks: the `nothing` and `allFiltered` branches become centered `PanelEmpty`. **Both
  branches stay** — the distinction between "no tasks" and "all tasks are finished and
  hidden" is the one NG1 names explicitly.
- Secrets: `t.secrets.none` gains a body and goes through `PanelEmpty`.
- NG3 sweep: `EntityDetail`'s `noObservations` (`:472`) and `noSources` (`:502`) stay
  inline `<p>` but are normalised to `mt-1 text-[11px] leading-snug text-fg-muted`.
  Leave `scheduledTasks.noRuns` (`:476`) alone beyond the same typography check.

**Done when:** the two task branches and the secrets branch render `data-empty-state`;
`scheduled-tasks.test.tsx` still passes.
**Tests:** `scheduled-tasks.test.tsx` (existing, must keep passing).
**Gate:** as above.

---

## T07 — Left sidebar

**What:** R4.1–R4.5. *Separable: drop this task if the scope is narrowed back to the
right sidebar.*
**Where:** `app/chat/history-sidebar.tsx:365-369`, `app/chat/conversation-tree.tsx:240`,
`app/chat/workspace-nav.tsx:233-237`
**Depends on:** T01, T02
**Reuses:** `PanelEmpty`; lucide `MessageSquare`, `Search`, `LayoutGrid`.

- `history-sidebar`: keep the `query.trim() ? noMatches : noneYet` branch (NG1).
- `conversation-tree`: the `bursts.length === 0` branch reuses R4.1's copy.
- `workspace-nav`: `groups.length === 0` and `nodes.length === 0` are distinct states
  and stay distinct; both move from left-aligned to the shared centered anatomy.

**Done when:** all five branches render through `PanelEmpty`.
**Tests:** none existing; covered structurally by T08 where the component is pure.
**Gate:** as above.

---

## T08 — Structural test: every branch goes through the component

**What:** R6.2 — mechanical proof of componentisation.
**Where:** `app/chat/empty-states.test.tsx` (new)
**Depends on:** T03, T04, T05, T06, T07
**Reuses:** the `renderToStaticMarkup` pattern and the fixture builders already in
`memory-graph-views.test.tsx` and `scheduled-tasks.test.tsx`.

Render every branch that is reachable without effects and assert each emits exactly one
`data-empty-state` wrapper, a title and a body:

- `BrowseList` empty graph; `BrowseList` with a `typeFilter` matching nothing
- `SearchList` with no hits
- `RecentList` with nothing in 24h
- `MemoryGraphView` with no entities, and with entities but a filter matching nothing

Panels that only reach their empty branch through a fetch (Files, Tasks, Secrets, the
Search idle state) are **not** asserted here — say so in a comment rather than writing
a test that passes for the wrong reason. They are covered by T09.

**Done when:** the test fails if any of those branches is reverted to hand-rolled
markup.
**Gate:** as above.

---

## T09 — Visual verification

**What:** R6.3. The suite is `environment: "node"`; no test sees what a member sees.
**Where:** running app
**Depends on:** T08

Start the app (the `run` skill, or `yarn dev`) and look at, in one sitting so they can
be compared against each other:

1. Graph › Entities on a fresh workspace (empty graph)
2. Graph › Entities with a type filter that matches nothing
3. Graph › Map, empty; then with a name filter that matches nothing
4. Graph › Search before typing; then with a query that returns nothing
5. Graph › Recent with nothing in 24h
6. Files with no uploads; then with a filter that matches nothing
7. Scheduled tasks with none; then with "Hide finished" on and everything finished
8. Agent secrets with none set

Check both locales (the language switcher is in the sidebar footer) and both themes.

**Done when:** the eight states share one visual rhythm, and every message names both
the situation and the next step. Capture what was actually observed — a screenshot or a
written note per state — rather than asserting it from the diff.

**Status: NOT DONE.** No browser automation was available in the session that
implemented T01–T08, so nobody has looked at these states yet. T01–T08 are verified by
`yarn test` (731 passing, including the 6 structural assertions in T08) and by `tsc`;
none of that is evidence about how the panes *look*, which is the entire premise of the
feature. A dev server against the running stack:

```
MYCELIUM_INTERNAL_URL=http://localhost:8080 \
DATABASE_URL=postgresql://chatwebapp:chatwebapp@<postgres-container-ip>:5432/chatwebapp \
PORT=3005 yarn dev
```

(the container IP comes from
`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' zombie-crab-project-chat-webapp-postgres-1`
— the postgres port is not published to the host).
