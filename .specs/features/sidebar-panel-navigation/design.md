# Design — Sidebar panel navigation

## Component map

```
ChatShell
└── ResizablePane                    (unchanged: width, collapse, mobile drawer)
    └── UnifiedSidebar               (REWORKED: owns the two-panel track)
        ├── brand header             (unchanged)
        ├── track  ── overflow-hidden viewport, 200%-wide flex row
        │   ├── SidebarPanel "workspaces"
        │   │   └── WorkspaceNav     (REWORKED: no open/onToggle, auto-select)
        │   └── SidebarPanel "chats"
        │       └── HistorySidebar   (REWORKED: no open/onToggle, back header)
        ├── AdminLink / InstallAppButton
        └── account footer
```

`SidebarPanel` is `sidebar-group.tsx` renamed and reduced: it renders a header
row (a caller-supplied node plus optional actions) and a `min-h-0 flex-1
overflow-auto` body. It keeps the one hard-won layout rule from `SidebarGroup` —
the header's main element is `min-w-0 flex-1`, never `w-full`, or the actions get
pushed past the column's right edge.

## The track

```tsx
<div className="relative min-h-0 flex-1 overflow-hidden">
  <div
    className={track({ panel })}   // cva: workspaces → translate-x-0
  >                                //      chats      → -translate-x-1/2
    <div className="flex w-1/2 min-h-0 shrink-0 flex-col">…workspaces…</div>
    <div className="flex w-1/2 min-h-0 shrink-0 flex-col">…chats…</div>
  </div>
</div>
```

The track is `flex h-full w-[200%] transition-transform duration-300
motion-reduce:transition-none`. Each panel is `w-1/2` of the track, i.e. exactly
the viewport width, so the translate is a clean half.

Percent widths here are safe in a way the old `max-h-[40%]` was not: this is a
**width** against a definite inline size (the pane's `--pane-w`, or the mobile
drawer's fixed `300px`), not a height against a flex-resolved parent.

The off-screen panel keeps `aria-hidden` and `inert` so it stays out of the tab
order mid-slide.

## Panel derivation

Extracted as a pure function so the node-environment suite can test it without
mounting anything — the same reason `sidebar-tree.ts` is React-free.

```ts
// app/chat/sidebar-panel-state.ts
export type SidebarPanel = "workspaces" | "chats";

export function resolvePanel(input: {
  hasWorkspace: boolean;
  browsing: boolean;
  forceWorkspaces: boolean;
}): SidebarPanel;
```

In `UnifiedSidebar`:

```tsx
const [browsing, setBrowsing] = useState(false);
const panel = resolvePanel({
  hasWorkspace: workspace !== null,
  browsing,
  forceWorkspaces,
});
```

- back control → `setBrowsing(true)`
- `WorkspaceNav.onSelect` → `setBrowsing(false)`

Nothing else writes it. There is deliberately no `clearWorkspace` in
`fragment.ts`: back is a panel move, not a deselection, so the chat on the right
never blanks and the fragment stays a valid shareable link.

## Auto-selection

Lives inside `WorkspaceNav`, which already holds `groups`, `plan` and `fragment`.
Lifting the `/api/subscriptions` fetch up to `UnifiedSidebar` just so the parent
could count leaves would be a much larger diff to remove a brief spinner.

```tsx
const autoSelected = useRef(false);

useEffect(() => {
  if (autoSelected.current || !autoSelect) return;   // autoSelect = !browsing
  if (fragment === null || activeKey) return;        // null = not read yet
  if (!groups) return;
  const leaves = planLeaves(plan.nodes);
  if (leaves.length !== 1) return;
  autoSelected.current = true;
  onPick(leaves[0]);
}, [...]);
```

`planLeaves` already exists and is exported. `onPick` is the manual path
unchanged — `createConversation` then `setWorkspace` then `onSelect?.()` — so
auto-selection lands on a fresh conversation, as specified (R4.1), and clearing
`browsing` falls out of the existing `onSelect` wiring.

The count is taken from `plan.nodes` (the filtered plan), but auto-select only
runs before the member has touched anything, when the filter is empty and the two
counts agree.

`autoSelected` is a ref, not state: it must not re-trigger a render, and it must
survive the `groups` update that follows the fetch.

## Chats panel header

Replaces `SidebarGroup`'s `identity` + collapse chevron:

```tsx
<button onClick={onBack} className={backRow()}>
  <ChevronLeft size={16} />
  <Bot size={14} />
  <span className="truncate capitalize">{workspace.r}</span>
</button>
```

with the List/Tree segmented control as the panel's `actions`. The word
"Conversations" comes off the header — the panel holds nothing else, and the
agent name is the information a member actually needs there. `t.shell.workspaces`
still titles panel 1, so `t.shell.conversations` survives only if another caller
uses it (checked at implementation time).

`aria-label` is `t.nav.backToWorkspaces`; the visible text is the agent name.

## Canvas

`ChatShell` passes `forceWorkspaces={canvas}` where it passed
`hideConversations={canvas}`. The derivation (R1.2) does the rest — no branch in
the render, and the chats panel keeps its state while pinned off-screen, so
leaving canvas returns to exactly the list that was there.

## Height

Every group-height rule dies with the accordion:

- `max-h-[40vh]` and its comment (the vh-not-% argument is moot — nothing is
  capped any more).
- `shrink-0` on the workspaces wrapper.
- the `chat-sidebar-groups` localStorage key, `GroupState`, `BOTH_OPEN`,
  `persist`, and the restore effect.

Each panel is now `flex min-h-0 flex-1 flex-col` with its body scrolling.

## Files

| File | Change |
|---|---|
| `app/chat/sidebar-panel-state.ts` | new — `resolvePanel`, React-free |
| `app/chat/sidebar-panel.tsx` | renamed from `sidebar-group.tsx`, collapse removed |
| `app/chat/unified-sidebar.tsx` | rewritten around the track |
| `app/chat/workspace-nav.tsx` | drop `open`/`onToggle`, always-available filter, auto-select |
| `app/chat/history-sidebar.tsx` | drop `open`/`onToggle`, back header |
| `app/chat/sidebar-tree.ts` | drop `FILTER_THRESHOLD` / `needsFilter` |
| `app/chat/chat-shell.tsx` | `hideConversations` → `forceWorkspaces` |
| `lib/i18n/chat.ts` | `+nav.backToWorkspaces`, `-nav.pickWorkspaceForConversations` |
| `app/chat/unified-sidebar.test.tsx` | rewritten |
| `app/chat/sidebar-panel-state.test.ts` | new |
| `app/chat/sidebar-tree.test.ts` | drop the threshold block |

## Risks

**A slide to a blank panel.** Guarded by R1.4: both panels mount for the whole
transition, and back preserves the workspace so `HistorySidebar` never loses its
required prop. The one remaining hole is the very first pick, when panel 2 has no
workspace yet — the track only ever moves to `chats` once `workspace` is set, so
that state is unreachable, but panel 2 still renders a placeholder when
`workspace` is null rather than crashing on a required prop.

**Auto-select loops.** Guarded by the ref (fires once) and by `browsing` (R4.3).
The dangerous shape would be a derived-invariant "if one workspace then select
it" evaluated every render; this is a one-shot effect instead.

**Percent width inside the mobile drawer.** The drawer is `w-[300px]`, definite,
so `w-1/2` of a `w-[200%]` track resolves correctly. Verified against
`resizable-pane.tsx`, where both the mobile (`max-md:w-[300px]`) and desktop
(`md:w-[var(--pane-w)]`) branches give the column a definite width.
