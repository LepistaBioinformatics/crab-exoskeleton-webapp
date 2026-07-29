# Tasks — Sidebar panel navigation

Gate for every task: `yarn tsc --noEmit` and `yarn vitest run` clean.

## T1 — Panel derivation, React-free

- **What:** `app/chat/sidebar-panel-state.ts` exporting `SidebarPanel` and
  `resolvePanel({ hasWorkspace, browsing, forceWorkspaces })`.
- **Depends on:** —
- **Done when:** `forceWorkspaces` wins over everything; no workspace ⇒
  `workspaces`; workspace + `browsing` ⇒ `workspaces`; workspace alone ⇒
  `chats`.
- **Tests:** `sidebar-panel-state.test.ts`, the full truth table.
- **Requirements:** R1.2, R5.2

## T2 — `SidebarGroup` → `SidebarPanel`

- **What:** rename `sidebar-group.tsx` to `sidebar-panel.tsx`; drop `open`,
  `onToggle`, `title`, `identity` and the chevron. New shape: `header`
  (ReactNode), `actions` (ReactNode), `children`. Body always rendered.
- **Depends on:** —
- **Reuses:** the `min-w-0 flex-1` / never-`w-full` rule for the header element,
  and the `min-h-0 flex-1 overflow-auto` body.
- **Done when:** no consumer passes collapse state.
- **Requirements:** R6.2

## T3 — Drop the workspace-filter threshold

- **What:** remove `FILTER_THRESHOLD` and `needsFilter` from `sidebar-tree.ts`;
  remove the threshold block and the two imports from `sidebar-tree.test.ts`.
- **Depends on:** —
- **Done when:** no reference to either symbol remains in the repo.
- **Requirements:** R2.2, R6.4

## T4 — i18n keys

- **What:** add `nav.backToWorkspaces` to `en` and `pt`; remove
  `nav.pickWorkspaceForConversations` from both.
- **Depends on:** —
- **Done when:** `ChatDict` compiles and the two locales differ for the new key.
- **Requirements:** R6.3, R8.1

## T5 — `WorkspaceNav`: panel-shaped, always-filterable, auto-selecting

- **What:** drop `open`/`onToggle`; render through `SidebarPanel` with
  `t.shell.workspaces` + sole-tenant identity as the header and the magnifier as
  the action; make the magnifier unconditional; add the one-shot auto-select
  effect behind a new `autoSelect: boolean` prop.
- **Depends on:** T1, T2, T3
- **Reuses:** `planWorkspaceTree`, `planLeaves`, `onPick`, the existing
  clear-on-close filter behaviour.
- **Done when:** the filter toggle renders at any leaf count; auto-select fires
  once, only with exactly one leaf, only when the fragment resolved without a
  workspace, and never while `autoSelect` is false.
- **Requirements:** R2.1–R2.5, R4.1–R4.4

## T6 — `HistorySidebar`: back header

- **What:** drop `open`/`onToggle`; render through `SidebarPanel` with a back
  button (chevron + agent name, `aria-label` = `t.nav.backToWorkspaces`) as the
  header and the List/Tree control as the action; new `onBack: () => void` prop.
- **Depends on:** T2, T4
- **Done when:** the list, search, new-chat, spotlight and enrichment behaviour
  are untouched; back calls `onBack` and writes nothing to the fragment.
- **Requirements:** R3.1–R3.5

## T7 — `UnifiedSidebar`: the track

- **What:** replace the stacked groups with the `overflow-hidden` viewport and
  the 200%-wide `transition-transform` track; own `browsing`; derive `panel` via
  `resolvePanel`; `hideConversations` → `forceWorkspaces`; delete
  `GROUPS_KEY`/`GroupState`/`BOTH_OPEN`/`persist`/the restore effect and the
  `max-h-[40vh]` wrapper; `aria-hidden` + `inert` on the off-screen panel;
  `motion-reduce:transition-none`.
- **Depends on:** T1, T2, T5, T6
- **Done when:** both panels stay mounted in every state; the chats panel renders
  a placeholder rather than crashing when `workspace` is null.
- **Requirements:** R1.1–R1.5, R2.1, R6.1

## T8 — `ChatShell` wiring

- **What:** pass `forceWorkspaces={canvas}` instead of
  `hideConversations={canvas}`.
- **Depends on:** T7
- **Done when:** entering canvas pins the workspaces panel; leaving it returns to
  the chats panel with its previous state.
- **Requirements:** R5.1, R5.2, R7.1

## T9 — Rewrite `unified-sidebar.test.tsx`

- **What:** replace the four obsolete assertions (see spec § Test impact) with
  first-paint assertions for the new model: which panel the track is translated
  to per input, both panels present in the markup, the back label in both
  locales, the reduced-motion class.
- **Depends on:** T7, T8
- **Done when:** the suite passes and no assertion references `max-h-[40vh]`,
  `pickWorkspaceForConversations`, or both group titles co-present.
- **Requirements:** all
