# shell-path-and-landing — tasks

Three groups, in the order they were built: the path, the collapsed sidebar, the
landing. C is the one that moves an invariant and went last.

**ONE PR, not three.** The plan said one per group and that was wrong: all three touch
`chat-shell.tsx`, so they are stacked rather than independent, and a PR whose branch
carries the other two is not a reviewable unit. The commits stay one per group, which is
where the separation is real.

## Group A — the path (FR-1, FR-2)

**A1 — `Projetos` becomes a segment.**
Where: `app/chat/crumbs.ts`, `app/chat/crumbs.test.ts`.
Done when: `Crumb.key` includes `"projects"`; `buildCrumbs` takes `onProjects` and
`onProject` with the targets in design §1; the four `p`/`v` cases produce the four paths;
`go` is stripped from the last crumb unless it is `workspace`.
Tests: the four paths; `Projetos` links to the list and the project does not; the root
keeps its link when it is the only crumb.

**A2 — the shell wires the two callbacks.**
Depends on: A1.
Where: `app/chat/chat-shell.tsx`.
Done when: `onProjects` is `setDestination("projects")` and `onProject` is
`setFragmentProject(openProject.id)`.

**A3 — the chevron is guarded by the leaf.**
Depends on: A1.
Where: `app/chat/breadcrumb.tsx`, `app/chat/breadcrumb.test.tsx`, `chat-shell.tsx`.
Done when: the menu renders iff the last crumb's key is `"leaf"` and a `sessionId` is
present; the shell passes `sessionId` unconditionally.
Tests: a workspace with no conversation renders no chevron (watch it fail first — this is
report 2); a `sid` absent from the conversation list renders no chevron; a named
conversation still renders one and still renames.

## Group B — the collapsed sidebar (FR-4)

**B1 — destinations only while expanded.**
Where: `app/chat/unified-sidebar.tsx`, `app/chat/chat-shell.tsx`,
`app/chat/unified-sidebar.test.tsx`.
Done when: `showDestinations` is a prop, the shell passes `!collapsed`, and a false value
wraps the rows in `md:hidden` rather than dropping them (design §2 — the mobile drawer
has no rail to fall back on).
Tests: expanded renders the six rows; collapsed renders them inside the `md:hidden`
container; the new-chat action and the conversation list are present in both.

**B2 — verify the rail already changes section.**
Where: new test beside `resizable-pane`/`chat-shell`.
Done when: a test pins that clicking a rail icon while collapsed opens that section.
Record in the spec whether it passed unchanged. **If it passes with no production
change, that is the deliverable** — do not invent work to justify the task.

## Group C — the landing (FR-3)

**C1 — `landing` as a centre kind.**
Where: `app/chat/destination.ts`, `app/chat/destination.test.ts`.
Done when: `resolveCentre` takes `sid` and returns `{kind:"landing"}` for a workspace with
no sid and no destination; the module comment that says the opposite is rewritten.
Tests: the five branches, including `p` set and `p` absent both landing.

**C2 — the shared search hook.**
Where: new `app/chat/use-conversation-search.ts`; `app/chat/history-sidebar.tsx` moves to
it; new test.
Done when: `HistorySidebar` behaves identically and its inline effect is gone.
Tests: the existing sidebar search tests still pass; the hook debounces, aborts, and
skips the content pass for a query with no free text.

**C3 — the landing screen.**
Depends on: C1, C2.
Where: new `app/chat/landing-screen.tsx` + test; `chat-shell.tsx` renders it for
`centre.kind === "landing"`; copy in both locales.
Done when: composer on top, search and the scope's conversations below, a row opens the
conversation; the attach control is disabled (OQ-1).
Tests: rows come from the project-scoped list; a row click writes the sid; the search box
filters.

**C4 — the mint effect goes, and the project survives it.**
Depends on: C3.
Where: `app/chat/chat-view.tsx`; new test.
Done when: `ChatView` mounted without a `sid` creates nothing; a send from the landing
calls `createConversation(workspace, project)` with the project, writes both keys in one
fragment write, and enqueues the text so the first message lands after the switch.
Tests: `landing-screen.test.tsx` "creates nothing on arrival" is where FR-3.5 is pinned,
**not** a `ChatView` mount. Once `resolveCentre` answers `landing` for an absent `sid`,
`ChatView` is never mounted in that state, so a restored effect there would be dead code
and a test of it would assert nothing. The two that carry the property are
`destination.test.ts` (that state resolves to the landing) and the landing's own. And a
landing send inside a project passes that project — FR-3.6, the invariant the deleted
comment protected.

**C4b — new-chat navigates instead of creating.** Found during execution: the sidebar's
button and the rail's action both called the same eager mint, so FR-3.5 would have been
false for them. `newChat` drops `sid` now. This is FR-3.8.

**C5 — i18n parity.**
Where: `lib/i18n/chat.ts`, `lib/i18n/parity.test.ts`.
Done when: every new key exists in both locales and the parity suite is green.

## Gate, per group

`./node_modules/.bin/vitest run` and `npx next build`. Not `yarn test` (it cannot write
its cache); `yarn lint` does not run and `tsc` has pre-existing errors — neither gates.
