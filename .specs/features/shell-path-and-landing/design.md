# shell-path-and-landing — design

Four corrections, three of which are independent. They are written here in the order
they should ship: the path first (small, self-contained), then the sidebar (small), then
the landing (large, and the only one that moves an invariant).

## 1. The path (FR-1, FR-2)

### `crumbs.ts` — `Projetos` becomes a segment, not the leaf

`Crumb.key` gains `"projects"`, and `buildCrumbs` takes two callbacks where it took one:

| Callback | Where it goes | Which crumb carries it |
|---|---|---|
| `onWorkspace` | the agent grid | `workspace` |
| `onProjects` | the projects list (`v=projects`, `p` kept) | `projects` |
| `onProject` | **the project's landing** (`p` kept, `sid`/`v` dropped) | `project` |

`onProject` changing target is the navigation half of the inversion. Today the project's
own name leads to the list of projects; with `Projetos` above it, "up one level" from a
conversation is the project itself, which is the landing FR-3 builds.

Presence, stated as the four cases rather than as a chain of conditionals:

| `p` | `v=projects` | Path |
|---|---|---|
| — | — | `assinatura · agente / <conversa>` |
| — | yes | `assinatura · agente / Projetos` |
| set | — | `assinatura · agente / Projetos / MeuProjeto / <conversa>` |
| set | yes | `assinatura · agente / Projetos / MeuProjeto` |

So `Projetos` is emitted when **either** a project is open or the list is showing
(FR-1.5), and the conversation leaf is emitted only when there is no destination.

**The link-stripping rule generalises.** It currently reads "if the last crumb is a
`leaf`, rebuild it without `go`", which was a proxy for "unless the whole path is just
the root". With three possible last crumbs it becomes exactly that: strip `go` from the
last crumb **unless it is `workspace`**. The root keeps its link however short the path
is, for the reason already recorded — the agent grid is reached from that segment and
nowhere else.

### `breadcrumb.tsx` — the menu is guarded by the leaf, not by a sessionId

The component already documents the assumption it cannot check: *"the conversation the
last crumb names, when it names one"*. Make it checkable by passing the fact instead of
a correlate. The chevron renders iff `crumbs[last].key === "leaf"` **and** a `sessionId`
is present; the shell stops computing `destination === null && sessionId`, because
`destination !== null` already produces a non-`leaf` last crumb.

This is what closes FR-2.2 without depending on the landing: a minted-but-unsaved `sid`
produces no leaf today, so the menu disappears the moment the guard is the leaf.

## 2. The collapsed sidebar (FR-4)

`UnifiedSidebar` gains one prop — `showDestinations: boolean` — and the shell passes
`!collapsed`.

**The gate is CSS at the `md` breakpoint, not a bare boolean.** `collapsed` is a
desktop-only state: below `md` the pane is an off-canvas drawer and the rail does not
exist, so hiding the destinations on a phone because the desktop pane happens to be
collapsed would take the only way to reach them. So when `showDestinations` is false the
rows are wrapped in a `md:hidden` container: present below `md`, gone at `md+`, which is
exactly where the rail stands in for them.

Nothing else about the peek changes. `onCollapse` stays `undefined` while collapsed (the
preview shows the pane in the state it is already in), the new-chat action stays — it is
an action, not a menu option, and the rail carries it too.

FR-4.3 is a **verification task**, not an implementation one: `railDestinations` in
`chat-shell.tsx` already maps every row to `setDestination`/`setRightSidebar`. If the
test passes on unchanged code, it is recorded as a test that pins behaviour rather than
as work.

## 3. The landing (FR-3)

### A fourth centre kind

`resolveCentre` gains `sid` as an input and `Centre` gains `{ kind: "landing" }`:

```
!resolved            → loading
!workspace           → agents
destination          → destination
!sid                 → landing      ← new
otherwise            → chat
```

The module's own comment currently says the opposite — *"No `sid`: a workspace with no
conversation open is still the chat, an empty one, and ChatView's own empty state is what
says so"* — and it has to be rewritten rather than left standing, because the reason it
gave (deciding emptiness in two places) is now the reason for the new kind: the landing
is not an empty chat, it is a different screen with a list in it.

### The mint effect goes, and its invariant does not

`chat-view.tsx:516` is deleted. Its comment names the defect it was preventing and that
defect is now the landing's to prevent: **`createConversation(workspace, project)` — the
project is passed at send time, not omitted.** A conversation minted without it is
answered by the main agent and reads its history from the wrong workspace.

The send path on the landing is three calls in one handler, in this order:

1. `createConversation(workspace, project)` — mints the id, persists nothing.
2. `setFragmentProjectSid(project, id)` — one write, so the history stack never holds a
   half-state (the same reason `newChat` in the shell already uses this setter).
3. enqueue the text against that sid through the turn store, the way `ChatView`'s own
   send does.

Step 3 is what makes the first message land rather than being lost to the remount: the
centre switches from `landing` to `chat` on the fragment write, and the turn store is
module scope, so the queued text survives the switch.

### The list and its search

`useConversations` is already scoped by `workspace.p`, so "the project's conversations at
the root of a project, the agent's at the root of the agent" needs no new fetch — the
landing reads the same hook the sidebar and the breadcrumb do, which is what keeps the
three from disagreeing.

The search pipeline — parse, sync filters, 300ms debounce, abortable content filter over
fetched transcripts — is currently one 40-line effect inside `HistorySidebar`. It becomes
`use-conversation-search.ts`, consumed by both. Extracted rather than copied because
FR-3.4 asks for the *same* grammar, and two copies is how the two surfaces start
accepting different queries.

`ConversationSearchBar` is already a standalone component and is used as-is.

**What the landing's rows do NOT do:** rename, delete, tag, or tree. Those live in the
sidebar's row and in the breadcrumb's menu. A row here opens a conversation
(`setFragmentSid`), and that is all — three similar rows beat one component that has to
know which surface it is on.

### Shape

```
┌──────────────────────────────────────────┐
│  assinatura · agente / Projetos / MeuProj │
├──────────────────────────────────────────┤
│                                          │
│   [ composer — start a conversation ]    │
│                                          │
│   Conversas                              │
│   [ search: tag: alias: text: date: ]    │
│   ─ Relatório Q3                  há 2h  │
│   ─ Onboarding                   ontem   │
│   ─ Migração                     3 dias  │
└──────────────────────────────────────────┘
```

The composer is `Composer` with its attach control disabled (OQ-1): it uploads against a
`sessionId` and there is not one yet.

## Test plan

| Area | Kind | Where |
|---|---|---|
| the four paths, the two links, the leaf-stripping | pure, `environment: "node"` | `crumbs.test.ts` |
| chevron present/absent by last-crumb kind | jsdom | `breadcrumb.test.tsx` |
| `resolveCentre` answering `landing` | pure | `destination.test.ts` |
| `ChatView` with no sid creates nothing | jsdom, mocked `chatSession` | new |
| a landing send carries the project | jsdom, mocked `chatSession` | new |
| destinations expanded vs. collapsed | jsdom | `unified-sidebar.test.tsx` |
| rail icons change section while collapsed | jsdom | new, may pass unchanged (FR-4.3) |

Gate: `./node_modules/.bin/vitest run` (not `yarn test` — it cannot write its cache) plus
`npx next build`. `yarn lint` does not run and `tsc` has pre-existing errors; neither is
a gate.
