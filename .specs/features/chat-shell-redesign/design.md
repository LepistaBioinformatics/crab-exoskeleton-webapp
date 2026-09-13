# chat-shell-redesign — Design

Spec: `./spec.md`. Requirement IDs below refer to it.

**Corrected on 2026-09-12 by DEC-14, after the owner used step 1.** Only the projects
screen takes the centre; the five workspace sections open in a pane beside the
conversation, under `rs`. Everything below is the corrected version — where a paragraph
argued for the reversed shape it is rewritten rather than annotated, and the reasoning
that was reversed is recorded in `spec.md`'s DEC-14, not duplicated here.

---

## The shape of the change

```
                         BEFORE

  ┌──────────────┬──────────────────────┬────┐
  │ brand        │ subscription · agent │ ▣  │
  ├──────────────┤──────────────────────┤ ◈  │
  │ ◀ workspaces │                      │ ◷  │
  │   ▓▓▓ chats  │      transcript      │ ⬡  │
  │ ── PROJECTS ─│                      │ 🔑 │
  │  · Legal     │                      │    │
  │  · TBDC      │                      │    │
  │ ═══ seam ═══ │                      │    │
  │ ── CHATS ────│                      │    │
  │  · Parecer   │                      │    │
  │  · Teste     │                      │    │
  ├──────────────┼──────────────────────┤    │
  │ email        │      composer        │    │
  └──────────────┴──────────────────────┴────┘
   ↑ sliding track     ↑ own header      ↑ rail

                         AFTER

  ┌──────────────┬──────────────────────┬───────────┐
  │ brand        │ Acme·alpha / Legal / │ Files   ✕ │
  ├──────────────┤ Parecer TBDC         ├───────────┤
  │ + New chat   ├──────────────────────┤           │
  │ ▣ Projects   │                      │  the open │
  │ ◈ Files   ◂──┼── opens the pane ────┼▸ section, │
  │ ◷ Tasks      │      transcript      │  resizable│
  │ ⬡ Memory     │        — or —        │  and      │
  │ ⌗ Graph      │   the projects grid  │  closable │
  │ 🔑 Secrets   │                      │           │
  ├──────────────┤                      │           │
  │ Chats  ⌕ ≡|⎇ │                      │           │
  │  · Parecer   │                      │           │
  │  · Teste     │                      │           │
  ├──────────────┼──────────────────────┤           │
  │ email        │      composer        │           │
  └──────────────┴──────────────────────┴───────────┘
   ↑ one column      ↑ `v`                ↑ `rs`
```

Three things move and two are deleted outright:

- **the project list** — sidebar → centre (`v=projects`)
- **the five workspace sections** — right *rail* → named rows in the sidebar. They still
  open where they always did, in the pane on the right (`rs=files|tasks|memory|graph|secrets`);
  what changes is that the way in is a labelled row instead of an unlabelled icon column
- **identity** — chat header + sidebar project row → one breadcrumb in the shell
- **the sliding track** — deleted; there is one list in the sidebar and nothing to slide
- **the right rail and its mobile menu** — deleted; the sidebar rows replace them

The two keys are the shape of the whole change: `v` says what the centre shows instead of
the conversation, `rs` says what is open beside it. Neither is consulted about the other.

---

## Module inventory

### New

| Module | Kind | What it owns |
|---|---|---|
| `app/chat/destination.ts` | pure | The `v` vocabulary and the centre-pane resolver. Replaces `sidebar-panel-state.ts`. |
| `app/chat/breadcrumb.tsx` | component | The three-segment path + its chevron menu (FR-3). |
| `app/chat/crumbs.ts` | pure | Fragment + names → the segment list. Separated from the component so the presence rules of FR-3.2 are testable without a DOM. |
| `app/chat/projects-screen.tsx` | component | The project grid (FR-2). |
| `app/chat/destination-screen.tsx` | component | The frame every centre-pane destination renders inside: heading, max-width column, scroll. One frame so six screens cannot drift. |
| `app/chat/media-refresh-bus.ts` | pure | Module-scope "the workspace's files changed" signal (FR-5.4). |
| `app/chat/sidebar-destinations.tsx` | component | One list, two kinds of row (FR-4.2, FR-4.3), and the row list itself — the collapsed rail reads it rather than building a second one. |
| `app/chat/workspace-screen.tsx` | component | Dispatches the open `rs` section to its panel body, inside the pane. |
| `app/chat/workspace-pane.tsx` | component | The pane's chrome and nothing else: width + `localStorage`, the drag handle, the heading, the close control, the mobile drawer. `uploads-sidebar.tsx`'s, extracted. |
| `app/chat/use-conversations.ts` | hook | `listConversations` + `onConversationsUpdated`, shared by the sidebar list and the breadcrumb. See *Risks*. |

### Changed

| Module | Change |
|---|---|
| `fragment.ts` | `v` added to `FragmentState` + `readFragment` + a `setDestination` writer; `rs` and `setRightSidebar` stay exactly as they were. `setFragmentSid`/`setFragmentProject`/`setFragmentProjectSid` each gain `params.delete("v")` and touch no `rs` (FR-1.7). |
| `chat-shell.tsx` | Owns the breadcrumb, the centre-pane switch AND the right pane; loses `railProjects`; keeps `TurnDock` and `RestartBanner` where they are. The pane is a SIBLING of `<main>` in the same flex row, like the sidebar on the other edge, so the centre reflows beside it instead of being covered. |
| `unified-sidebar.tsx` | Loses the `track`/`slot` cvas, the `armed` flag and the focus-request machinery; becomes header + `New chat` + destinations + list + footer. |
| `chat-view.tsx` | Loses its header (FR-3.4), `UploadsSidebar`, `RightRail`, `rightSidebar`/`openSection`, and `mediaRefresh` as local state — the pane is the shell's now, not the view's. `subscribeToPreviewRequests` writes `rs=files`. |
| `history-sidebar.tsx` | Loses `ProjectsBar`, `SectionHeader`, `SectionSplitter` and the split-box geometry; keeps the list, the tree, the search and the view toggle on one row (FR-4.4). |
| `uploads-sidebar.tsx` → `files-screen.tsx` | The listing only. `onClose`/`onSectionChange` drop out (the pane owns closing), `refreshSignal` becomes a bus subscription, and the width/drag/drawer chrome moves to `workspace-pane.tsx`. |
| `workspace-sections.ts` | Unchanged in what it lists. `nextSidebarValue` and `asSection` STAY here: `rs` is still a hand-editable string naming a section, and a section row still toggles a pane open and shut. |
| `globals.css` | `--surface`, `--elevated` in the light `:root` (FR-6.2). |

### Deleted

`right-rail.tsx`, `section-menu.tsx`, `projects-bar.tsx`, `sidebar-panel-state.ts`,
`split-boxes.ts`, `panel-header.ts` (FR-3.4), and `workspace-nav.tsx` — checked:
`unified-sidebar.tsx` is its only importer, and `WorkspaceGrid` builds its own tiles, so
removing the sidebar's workspace panel removes the component outright.

---

## The two vocabularies

Each key has one module that turns it into something typed, and the two never consult
each other. `destination.ts` owns `v`; `workspace-sections.ts` owns `rs` and has since
before this feature.

```ts
// destination.ts — what the CENTRE shows instead of the conversation.
export type Destination = "projects";

/** The fragment's `v`, or null. Unknown text resolves to null, never to a cast — a
 *  section name included, so a link written while `v` carried all six does not put
 *  Files back in the middle. */
export function asDestination(value: string | null | undefined): Destination | null;

// workspace-sections.ts — what the PANE shows beside the conversation. Both of these
// were written for the rail and both outlived it unchanged.
export function asSection(value: string | null | undefined): Section | null;
export function nextSidebarValue(current: string | null, clicked: Section): Section | null;
```

The row LIST that puts the two together — Projects, then `SECTION_ORDER` — lives in
`sidebar-destinations.tsx`, which is the surface that has to show both kinds. The
collapsed rail imports it rather than rebuilding it, so the two cannot disagree about
order or about what a click means.

```ts
export type Centre =
  | { kind: "loading" }
  | { kind: "agents" }                              // no workspace
  | { kind: "destination"; at: Destination }
  | { kind: "chat" };

export function resolveCentre(input: {
  resolved: boolean;
  workspace: Workspace | null;
  destination: Destination | null;
}): Centre;
```

`resolveCentre` is the FR-1.3 table and nothing else. It deliberately does **not** take
`sid`: a workspace with no `sid` is still a chat (an empty one), which is what
`ChatView`'s own empty state is for. It does not take `rs` either, and cannot: the pane
opens beside whatever this returns, so it can never change the answer.

### Why `v` was never merged into `rs`

`rs` means "a pane is open beside the conversation" and `v` means "this is the screen
instead of the conversation". Reusing the key would have made every old link assert a
new meaning, and `rs=files` in somebody's ticket would have started replacing the
recipient's conversation instead of opening beside it.

**This is the decision that made DEC-14 cheap.** When the sections went back to the pane,
`rs` still meant what it had always meant, so there was no migration to write and no
link to break — the redirect FR-5.3 once specified simply stopped being needed. The
alternative, one key with a branch on which render target each value implies, would have
put an "unless it is a pane one" clause on every rule in `fragment.ts`.

---

## The breadcrumb

`crumbs.ts` is pure and takes what the shell already has:

```ts
export interface Crumb {
  key: "workspace" | "project" | "leaf";
  label: string;
  /** Absent on the last crumb: the place you already are is not a link. */
  go?: () => void;
}

export function buildCrumbs(input: {
  workspace: Workspace | null;
  subscription: string | null;   // accountName(groups, t, s), already resolved by the shell
  project: Project | null;
  conversationTitle: string | null;
  destination: Destination | null;
  t: ChatDict;
}): Crumb[];
```

Presence rules, restating FR-3.2 as the table the test walks:

| workspace | project | destination | sid | crumbs |
|---|---|---|---|---|
| – | – | – | – | none (the agent grid names itself) |
| ✓ | – | – | – | `Acme · alpha` |
| ✓ | – | – | ✓ | `Acme · alpha` / `Parecer TBDC` |
| ✓ | ✓ | – | ✓ | `Acme · alpha` / `Legal` / `Parecer TBDC` |
| ✓ | ✓ | `projects` | ✓ | `Acme · alpha` / `Legal` / `Projects` |
| ✓ | – | `projects` | ✓ | `Acme · alpha` / `Projects` |

The fifth row is FR-1.5's case seen from the breadcrumb: with `p` set, `v=projects`
renders `Acme · alpha` / `Legal` / `Projects` — the project stays named because the
member is still in it.

**`rs` is not in this table**, which is the correction of 2026-09-12. The five section
names were leaves while they were centre destinations. A pane is not a place you are
standing, so `Acme · alpha` / `Legal` / `Files` over a transcript still on screen would
name somewhere the member has not gone — and the leaf would be wrong about the one thing
this bar exists to say.

The chevron menu reuses `app/admin/breadcrumb.tsx`'s portal + placement behaviour. It is
**reused, not shared**: that component's crumbs are `Split["crumbs"]` from the admin
column model, and generalising it to serve both would couple two navigation models that
have no reason to move together. What is copied is the menu's positioning code, and the
copy is noted in both files.

---

## The centre screen, and the pane

Two frames, because there are two render targets.

`destination-screen.tsx` is the CENTRE's: a max-width column with a heading and its own
scroll. Only `ProjectsScreen` uses it, and it renders its own rather than being wrapped
by the shell, because the create control belongs to the screen that holds the draft state
and an agent whose proxy has no projects must render nothing at all (FR-2.4).

`workspace-pane.tsx` is the PANE's, and is where `uploads-sidebar.tsx`'s chrome went:

```
<aside style={{width}}>              ← resizable, persisted, mobile drawer + backdrop
  <div role="separator" …/>          ← the drag handle, on the LEFT edge
  <header>  <h2>Files</h2> ⟳ ✕ </header>
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <WorkspaceScreen … />            ← dispatches `rs` to one of the five bodies
  </div>
</aside>
```

**The height chain is the part with no test behind it.** Each of the five panels is a
flex column that sizes its scrolling region from its parent, so it needs a parent with a
definite height, and the chain is: the shell's flex row (`min-h-0 flex-1` under `h-dvh`)
→ the `<aside>`, stretched by that row → a `shrink-0` header → this `min-h-0 flex-1`
body. While the sections filled the centre, `destination-screen.tsx` grew with its
content instead, a `flex-1` child had nothing to be 1 of, and `workspace-screen.tsx`
carried an `h-[70dvh] min-h-80` workaround for exactly that. The pane gives the height
back and the workaround is gone with it.

`h2`, not `h1`: the centre holds the heading for where the member is, and this is what is
open beside it.

The panels are still 300px-column components and the pane is still roughly a 300px
column, which is the one thing the reversal makes simpler — FR-5.1's "widen their
internals" follow-up is no longer owed.

### The two channels

```ts
// media-refresh-bus.ts — "the workspace's files changed"
export function publishMediaChanged(): void;
export function subscribeToMediaChanged(fn: () => void): () => void;
```

Published at today's `chat-view.tsx:610` (the member uploaded or dropped a file — the
only site that bumps the counter). Subscribed by the
composer's `@`-mention list — which is inside `ChatView` and keeps working exactly as it
does — and by the Files screen, which is not. This is `media-preview-bus.ts`'s pattern,
and that file's own comment already explains why a channel beats a prop here.

`subscribeToPreviewRequests` keeps its current shape. Its handler changes from
`setRightSidebar("files")` to `setDestination("files")` — and that is the whole change,
because the preview is not a separate surface. `FilePreview` renders inside
`uploads-sidebar.tsx:1057` as the files section's detail state, and `UploadsSidebar`
already turns its `openFile` prop into that state at `uploads-sidebar.tsx:336`. The
request's comment — "a document with no panel around it has nowhere to render" — is
satisfied by the Files screen exactly as it was by the Files pane, at three times the
width (FR-5.5).

---

## Tokens and the divider grammar

### Light surface steps (FR-6.2)

Measured, not eyeballed. The dark theme's tonal span is what the reference screenshots
demonstrate works; light should reproduce it:

| pair | dark (today) | light (today) | light (proposed) |
|---|---|---|---|
| `--bg` / `--surface` | 1.085 | 1.056 | **1.114** |
| `--surface` / `--elevated` | 1.141 | 1.059 | **1.109** |
| `--bg` / `--elevated` | **1.238** | 1.119 | **1.236** |

```css
/* :root, light */
--surface:  #f0f3f5;   /* was #f7f9fa */
--elevated: #e2e8ec;   /* was #eef3f5 */
```

The total span lands within 0.2% of dark's, and the two steps come out nearly equal
(1.114 / 1.109) where dark's are uneven (1.085 / 1.141) — so light is, if anything, the
more consistent of the two. `--bg` stays `#ffffff`: moving it would tint every page in
the product including the landing's hero.

### The named hairline set (FR-6.0)

`border-brand/*` appears 136 times at six opacities. After this change there are two
values and they mean different things:

| token | value | where |
|---|---|---|
| `--rule` | `color-mix(in srgb, var(--brand) 22%, transparent)` | a boundary inside one surface — a table row, a form's field group |
| `--rule-strong` | `color-mix(in srgb, var(--brand) 40%, transparent)` | a boundary that is also a control's edge — an input, a button outline |

Everything that today separates two *regions* (`border-r` on the sidebar, `border-b` on
a header, `border-l` on the rail) is deleted, because the regions now differ in tone.
Anything that cannot be expressed as one of the two is a case the design missed, and it
is raised rather than given a third value.

---

## Test migration

| Test | Fate | Why |
|---|---|---|
| `sidebar-panel-state.test.ts` | rewritten as `destination.test.ts` | the resolver survives in a new shape |
| `unified-sidebar.test.tsx` | rewritten | the component survives; the track does not |
| `split-boxes.test.ts` | deleted | the seam is gone |
| `right-sidebar-switch.test.tsx` | deleted | it mounted the pane through the panel that is now two components |
| `fragment-right-sidebar.test.ts` | folded into `fragment-destination.test.ts`, minus the `menu` cases | `rs` still selects a section, so its round trip is still load-bearing — and next to `v`'s, the opposite rules about `sid` cannot be applied to the wrong key |
| `right-rail.test.tsx`, `section-menu.test.tsx` | deleted | surfaces removed |
| `workspace-panel-scope.test.ts` | rewritten against `v` | the scoping rule survives |
| `fragment-workspace-project.test.ts` | **kept, untouched** | FR-9.3/FR-9.4 are exactly what it guards |
| `scheduled-tasks*.test.tsx`, `uploads-sidebar.*.test.tsx`, `memory-graph-*.test.tsx` | kept; mount point updated | the panels' behaviour is unchanged |
| `app/admin/*.test.*` (25 files) | **untouched** | FR-7.3 |

New, beyond what the spec's Verification lists: a test that `DESTINATION_ROWS` and the
sidebar's rendered rows are the same list, so a sixth section cannot be added to one and
not the other; and `workspace-pane.test.ts`, which is `right-sidebar-switch.test.tsx`'s
default-width assertions kept for the surface that still has a width.

---

## Risks

- ~~**`UploadsSidebar` at 900px.**~~ Gone with DEC-14: the panels are back in a column
  about the width they were written for.
- **The height chain has no gate behind it.** The suite runs `environment: "node"` and
  computes no layout, so a broken chain renders a zero-height panel that every test still
  passes. It is the one thing in this design that has to be confirmed by eye.
- **The breadcrumb needs the conversation's title**, which today only the sidebar list
  has. It is **not** in `history-cache.ts` — that holds `HistoryMessage[]`, not titles.
  It is on `ConversationSummary`, from `listConversations(workspace)`, which the sidebar
  already fetches. So the fetch is lifted into a shared `useConversations(workspace)`
  hook, the third of a pattern this repo already runs twice (`useWorkspaceGroups`,
  `useProjects`) and for the reason `projects-bar.tsx` states about its own: "two fetches
  would drift the moment this section created or deleted one". The existing
  `onConversationsUpdated` channel is what keeps a rename visible in the breadcrumb.

  Passing the title up from `ChatView` is the alternative and is rejected: it would put
  the shell's chrome behind `ChatView`'s mount, which is the FR-3.1 mistake wearing a
  different hat.
- **Focus after a destination change** (FR-9.5). The track's focus-request machinery is
  being deleted; the destination rows are ordinary links in a list, so focus stays on the
  row that was activated. The mobile drawer is where this has to be checked, because
  closing the drawer moves focus whether or not anybody asked it to.
