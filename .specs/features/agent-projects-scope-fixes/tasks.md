# agent-projects-scope-fixes — Tasks (webapp)

Requirements live in the proxy repo:
`crab-shell-proxy/.specs/features/agent-projects-scope-fixes/spec.md`. Read it
first — the picoclaw facts behind B1 and the three-layer shape of B2 are recorded
there and are not repeated here.

These tasks are independent of the proxy's. Each layer of B2's fix is separately
harmless (an extra ignored form field) and jointly required, so the two repos can
ship in either order.

Gate for every task: `yarn test` green, `yarn build` clean.

---

## P1 — B2/B3, the two defects the member actually hit

### T-01 — send the project with an upload
- **What:** `uploadMedia` sets `project` on the FormData when `workspace.p` is
  set, and omits the field entirely when it is not.
- **Where:** `lib/media.ts:47-58`.
- **Reuses:** the spread idiom every other writer in this file already uses
  (`...(workspace.p ? { project: workspace.p } : {})`). `withProject` does not
  apply — it takes `URLSearchParams`, and this is a multipart body.
- **Done when:** FR-6, AC-6.
- **Tests:** `lib/media.test.ts` — the form carries `project` for a project
  workspace and has no `project` key for a project-less one. The negative case is
  the one that matters: a `project=""` field would reach the proxy as an unknown
  project and 404 every global upload.

### T-02 — forward the project through the three hand-written media routes
- **What:** `POST /api/media` adds `project` to the `upstream` FormData it
  rebuilds; `DELETE /api/media` and `GET /api/media/download` add it to their
  query.
- **Where:** `app/api/media/route.ts:124-127` (POST), `:71` (DELETE),
  `app/api/media/download/route.ts:23`.
- **Reuses:** the pattern already correct in the same file's `GET`
  (`app/api/media/route.ts:28-29`).
- **Done when:** FR-7, FR-11, FR-12.
- **Tests:** each route forwards `project` when present and omits it when absent.
- **Note:** these three are hand-written rather than going through `proxyRead` /
  `proxyMediaWrite`, which is exactly why they were missed. Do not refactor them
  onto those helpers as part of this fix — `proxyRead` is for JSON reads and
  neither helper handles a multipart body or a streamed binary response. Leave a
  one-line comment on each saying the project must be forwarded by hand here.

### T-03 — re-fetch every panel when the project changes
- **What:** add `workspace.p` to the dependency list of all eleven effects.
- **Where:**
  - `app/chat/uploads-sidebar.tsx:329`
  - `app/chat/memory-editor.tsx:42, 68`
  - `app/chat/memory-graph-panel.tsx:146, 172, 193, 211`
  - `app/chat/scheduled-tasks-panel.tsx:162, 189, 207`
- **Done when:** FR-9, FR-9a, AC-7.
- **Tests:** at least the files tree and the tasks list — render with
  `p: null`, re-render with `p: "x"`, assert a second fetch against the project's
  query. Those two are what the report named.
- **Note on `scheduled-tasks-panel.tsx:207`:** it is keyed on
  `open?.run.basename`, and a basename only identifies a file *within* the
  sessions dir it was listed from. The same basename under another scope is a
  different transcript, so this effect needs `p` as much as the others do.

### T-04 — do not show another scope's content while loading
- **What:** on a project change, clear the panel's loaded state before the new
  fetch resolves.
- **Where:** the same four components. `uploads-sidebar.tsx:317` already does it
  (`setFiles(null)`); memory, graph and tasks do not.
- **Depends on:** T-03 (without it the effect never re-runs, so there is nothing
  to clear).
- **Done when:** FR-10. Switching into a project never shows the global memory
  document, graph or task list as though it belonged to the project.

---

## Not in this batch

**B4** (the agent losing context around an upload) has no confirmed root cause.
It is specified as blocked in the proxy's `spec.md`, with the two commands needed
to settle it.

One webapp consequence to hold until then: the comment at
`app/chat/turn-store.ts:68` asserts that *"after an upload, picoclaw reloads to
pick up the new workspace file"*, and the `UPLOAD_SETTLE_MS` delay below it exists
to wait for that reload. No such reload was found — the proxy never calls
picoclaw's `/reload`, and the shipped template sets `gateway.hot_reload: false`.
**Do not remove the delay yet:** it may be papering over whatever B4 turns out to
be, and removing it before B4 is diagnosed would change two variables at once.
Correct or delete both once B4 is settled.
