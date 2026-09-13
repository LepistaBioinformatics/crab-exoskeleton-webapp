# chat-shell-redesign — Tasks

Spec: `./spec.md`. Design: `./design.md`.

**Gate for every task:** `./node_modules/.bin/vitest run` green, and no test file edited
that the task does not name. (`yarn test` cannot write its cache on this host; call the
binary.) `npx next build` is the gate for the last task of each step, not for every one.

**Baseline:** 118 files, 1505 tests, all passing, recorded 2026-09-12 before any change.

**Where this stands (2026-09-12):** Step 1 is complete and Step 2 is under way. The suite
reads 120 files / 1542 tests, green, and `npx next build` exits 0. Nothing is committed —
the whole of it is working-tree changes on `spec/chat-shell-redesign`. What was verified
and, more importantly, what was NOT, is in `report.md` beside this file.

Tasks marked `[P]` have no dependency on each other and can run in parallel.

---

## Step 1 — Navigation (FR-1 to FR-5, FR-8, FR-9)

### T1.1 — DONE — `destination.ts` [P]

- **What:** The `v` vocabulary, `asDestination`, `destinationFromLegacy`, `resolveCentre`.
- **Where:** `app/chat/destination.ts` (new), `app/chat/destination.test.ts` (new).
- **Reuses:** the shape of `sidebar-panel-state.ts`; `SECTION_ORDER` from
  `workspace-sections.ts` for the five section names.
- **Done when:** the FR-1.3 table is expressed as one pure function, and unknown `v`
  text resolves to null rather than being cast.
- **Tests:** every row of FR-1.3; `rs=files`→`files`; `rs=menu`→`projects`; `rs` ignored
  when `v` is present; `v=garbage`→null.
- **Do not:** delete `sidebar-panel-state.ts` yet — T1.7 does, when its last caller goes.

### T1.2 — DONE — `v` in the fragment [P]

- **What:** `v` on `FragmentState`, in `readFragment`, and a `setDestination(d | null)`
  writer that preserves `sid` (FR-1.6) and preserves `p` (FR-1.5).
- **Where:** `app/chat/fragment.ts`, `app/chat/fragment-destination.test.ts` (new).
- **Done when:** the round trip passes — written by the setter, read back by
  `readFragmentForTest`. That export exists because `rs` once shipped written but
  unparsed and TypeScript could not catch it; `v` gets the same treatment.
- **Tests:** round trip; `setDestination` keeps `sid` and `p`; `setFragmentProject` still
  drops `sid` and `msg` (FR-9.3, asserted in the same file so the two rules are read
  together); `v=projects` with `p` set keeps `p`.

### T1.3 — DONE — `crumbs.ts` [P]

- **What:** `buildCrumbs`, the pure segment builder.
- **Where:** `app/chat/crumbs.ts` (new), `app/chat/crumbs.test.ts` (new).
- **Depends on:** T1.1 (the `Destination` type).
- **Tests:** the six-row presence table in design.md, including
  `v=projects` + `p` set → three crumbs with the project still named.

### T1.4 — DONE — `use-conversations.ts` [P]

- **What:** Lift `listConversations` + `onConversationsUpdated` out of
  `history-sidebar.tsx` into a shared hook.
- **Where:** `app/chat/use-conversations.ts` (new).
- **Reuses:** `use-projects.ts` and `use-workspaces.ts` — same shape, same 401 handling.
  A third hook that treats an expired session differently is the drift those two exist to
  prevent.
- **Done when:** `history-sidebar.tsx` renders from the hook and its existing tests pass
  unchanged.

### T1.5 — DONE — The media-changed channel

- **What:** `media-refresh-bus.ts`; publish at today's `chat-view.tsx:610` (the upload
  path, the only site that bumps the counter); the
  `@`-mention effect subscribes instead of reading local state.
- **Where:** `app/chat/media-refresh-bus.ts` (new), `app/chat/chat-view.tsx`.
- **Reuses:** `media-preview-bus.ts`, verbatim in pattern.
- **Done when:** `mediaRefresh` is no longer `ChatView` state and the mention list still
  refreshes after an upload.
- **Tests:** a bus test (subscribe/publish/unsubscribe), and the existing
  `uploads-sidebar.track.test.tsx` still green.

### T1.6 — DONE — The breadcrumb component

- **What:** `breadcrumb.tsx` rendering `buildCrumbs`, with the chevron menu.
- **Where:** `app/chat/breadcrumb.tsx` (new), `app/chat/breadcrumb.test.tsx` (new).
- **Depends on:** T1.3, T1.4.
- **Reuses:** the portal + placement code of `app/admin/breadcrumb.tsx`, copied with a
  note in both files saying it is a copy and why it is not shared.
- **Done when:** it mounts in the shell as a sibling of `ChatView` (FR-3.1) and the
  mobile top bar is it (FR-3.5).

### T1.7a — DONE — Destinations in the sidebar, track removed

- **What:** `sidebar-destinations.tsx`; `unified-sidebar.tsx` loses the track, the
  `armed` flag, the focus-request machinery and the workspace panel; `chat-shell.tsx`
  loses `railProjects`, `browsing` and `peeking`.
- **Where:** `app/chat/sidebar-destinations.tsx` (new), `app/chat/unified-sidebar.tsx`,
  `app/chat/chat-shell.tsx`.
- **Depends on:** T1.1, T1.2.
- **Deletes:** `workspace-nav.tsx`, `sidebar-panel-state.ts`, and their tests.
- **Tests:** `unified-sidebar.test.tsx` rewritten; a new test asserting the rendered rows
  and `DESTINATION_ORDER` are the same list.
- **Watch:** FR-9.1 — nothing may animate on first paint now that `armed` is gone; and
  FR-9.5 — focus after activating a destination row.

### T1.7b — DONE — Search and the view switch move to the list

- **What:** The search and the List | Tree switch move to a row at the head of the
  conversation list (FR-4.4); `ProjectsBar` and the draggable seam come out.
- **Where:** `app/chat/history-sidebar.tsx`.
- **Depends on:** T1.7a.
- **Deletes:** `projects-bar.tsx`, `split-boxes.ts`, and their tests.
- **Split from T1.7a deliberately:** together they are the highest-risk change in the
  feature, and both can break focus. Landing them apart is what says which one did.

### T1.8 — DONE — The projects screen

- **What:** `destination-screen.tsx` (the frame) and `projects-screen.tsx` (the grid,
  with create / edit / delete and the restart notice).
- **Where:** both new, plus `projects-screen.test.tsx`.
- **Depends on:** T1.1.
- **Reuses:** `workspace-grid.tsx`'s layout idiom (FR-2.3); `lib/projects.ts` unchanged;
  `ConfirmDialog` unchanged.
- **Tests:** create / edit / delete go through the same client calls `projects-bar.tsx`
  made; `projects_unsupported` renders nothing (FR-2.4); the card's date is `createdAt`
  and an empty string renders no date (DEC-11).

### T1.9 — DONE — The section destinations

- **What:** `UploadsSidebar` renders inside `DestinationScreen` keyed by `v`; the right
  pane and the rail come out of `chat-view.tsx`; `subscribeToPreviewRequests` calls
  `setDestination("files")` and keeps handing the file to `UploadsSidebar`'s existing
  `openFile` prop (FR-5.5 — the preview is that panel's own detail state, not a surface
  of its own).
- **Where:** `app/chat/chat-view.tsx`, `app/chat/uploads-sidebar.tsx`,
  `app/chat/chat-shell.tsx`.
- **Depends on:** T1.5, T1.7a, T1.8. **T1.7a must land first**: both tasks edit
  `chat-shell.tsx`'s main JSX and its `ResizablePane` call, and two agents editing that
  block concurrently is lost work, not a merge conflict.
- **Deletes:** `right-rail.tsx`, `section-menu.tsx`, `panel-header.ts`, and their tests.
- **Done when:** `rs` selects nothing and `v` selects everything; clicking an attachment
  chip in a message still lands on that document, now on the Files screen.
- **Do not:** widen `UploadsSidebar`'s internals. It renders at its natural width inside
  the frame; making five panels fill 900px is a separate feature.

### T1.10 — DONE — Copy

- **What:** New keys for the destination labels, the breadcrumb, the projects screen;
  removal of keys whose only home was a deleted surface.
- **Where:** `lib/i18n/chat.ts`, every locale.
- **Depends on:** T1.6, T1.7a, T1.7b, T1.8, T1.9.
- **Gate:** `lib/i18n/parity.test.ts` green (FR-8.1), plus `npx next build`.

### T1.11 — DONE — Step 1 verification

- **What:** Walk FR-9 by hand, since most of it is a behaviour no unit test sees:
  no animation on load (FR-9.1); the turn dock survives an agent switch (FR-9.2); a
  docked chip opens with its project (FR-9.4); focus lands somewhere reachable after a
  destination change, checked inside the mobile drawer (FR-9.5); the composer is not
  covered by the soft keyboard (FR-9.6).
- **Done when:** each is checked and the result is written into a `report.md` beside this
  file — including anything that failed **and anything that could not be checked**.
  FR-9.1, FR-9.5 and FR-9.6 are browser behaviours; whoever runs this task without a
  browser records them as unverified with the reason, and does not let them pass as done
  by omission. The same rule applies to T2.1's light-mode check.

---

## Step 2 — Grammar, `/chat` (FR-6)

Separate branch. Step 1 must be merged first: applying this to components Step 1 deletes
is wasted work, and mixing 136 border edits into a structural diff makes the structural
diff unreviewable.

### T2.1 — DONE — The tokens

- **What:** `--surface: #f0f3f5`, `--elevated: #e2e8ec` in the light `:root`; add
  `--rule` and `--rule-strong` with their `@theme inline` mappings.
- **Where:** `app/globals.css`.
- **Done when:** the three contrast ratios in design.md's table are what the file
  produces. **Check by eye in light mode** — this is the one requirement in the feature
  whose failure is invisible to every test in the repository (FR-6.2).
- **Note:** this repaints the landing page too (FR-6.2.1, DEC-12). Expected, accepted,
  and the reason this is its own change.

### T2.2 — Region borders out, `/chat`

- **What:** Delete the `border-*-brand/*` that separate two *regions* now differing in
  tone; map the survivors onto `--rule` / `--rule-strong`.
- **Where:** the 34 files under `app/chat` and `components/ui` that carry them.
- **Depends on:** T2.1.
- **Done when:** no `border-brand/<number>` remains under `app/chat` or `components/ui`.
  A case that fits neither token is raised, not given a third value.

### T2.3 — Type

- **What:** FR-6.3 — the destination rows, the breadcrumb and the conversation rows at
  the reference's weight; the `text-xs uppercase tracking-wide` eyebrow treatment goes
  with the sections it labelled.
- **Depends on:** T2.2.
- **Gate:** `vitest` green, `npx next build`, and both themes checked by eye.

---

## Step 3 — Grammar, `/admin` (FR-7)

Separate branch again, and droppable: `/chat` is complete without it.

### T3.1 — `/admin` borders and type

- **What:** The same two tokens across the 28 admin files listed in FR-7.2 (55
  occurrences).
- **Depends on:** T2.1.
- **Done when:** no `border-brand/<number>` remains under `app/admin`, and **all 25 admin
  test files are untouched** (FR-7.3). Having to edit one is the signal to stop and
  record the case rather than to change the test.
- **Gate:** `vitest` green with the admin suites unmodified, `npx next build`.

---

## Not in scope, recorded here so it is not discovered as scope creep

- Widening `UploadsSidebar`'s five panels to use the space a full-width screen gives
  them (T1.9's *Do not*).
- The conversation tree as a full-width destination — the idea was raised and rejected
  for this feature (DEC-13); `conversation-tree-view` keeps working in the sidebar.
- Any proxy or BFF change (DEC-9). Every screen here rearranges data the webapp already
  fetches.
- OQ-1, how much of the destination list the mobile drawer keeps, is answered during
  T1.7a and written into the spec when it is.
