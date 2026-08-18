# admin-breadcrumb-nav — Specification

**Status:** Implemented · **Size:** Medium-Large (one pure derivation added, one whole model
deleted, three components reworked)
**Context:** `context.md` (DEC-1 … DEC-5)
**Amends** `admin-column-browser`: supersedes its FR-3 (the strip), FR-5 (mobile) and the
`trail` half of its signature. Everything else there stands.

## Problem

The column browser draws every level of the path as a column. Five columns at 12rem is
~1000px of navigation for a screen whose work happens in the panel, and four of those
columns show a question that is already answered.

## Goals

- [ ] At most one column on screen, ever.
- [ ] The answered path lives in a breadcrumb at the top, and any level can be changed from
      there without re-walking the ones after it.
- [ ] One layout for both breakpoints — no second navigation for mobile.
- [ ] The panel gets the full width once the path is complete.

## Out of Scope

| Item | Reason |
| --- | --- |
| The column model (`buildColumns`) | Unchanged. This feature only decides how much of its output is drawn as columns. |
| Panel internals, the panel header, `RestartChrome` | Untouched. |
| `admin-column-browser`'s selection rules (no default scope, discard-on-change, re-click keeps the tail, URL as source of truth) | All preserved. |

## Requirements

### FR-1 — Splitting the path

- **FR-1.1** A column whose rows contain a selection is a CRUMB. The one whose question is
  unanswered is the OPEN COLUMN. The split is a pure function over `Column[]`, with a truth
  table.
- **FR-1.2** There is at most one open column: `buildColumns` only produces column *n* once
  *n−1* is answered, so only the last can lack a selection.
- **FR-1.3** The SECTIONS column is never a crumb: it stays drawn as a sidebar whether or
  not a section is chosen. Agent, tenant and subscription are decided once and then worked
  under, so folding them into a line of text costs nothing; the section is switched
  repeatedly while working, and a list used that often belongs on screen rather than behind
  a click. The panel takes the full width only when no column exists at all — branding.
- **FR-1.4** The root column is always answered (branding or agents), so the breadcrumb is
  never empty while the screen has any authority.

### FR-2 — The breadcrumb

- **FR-2.1** It sits at the top of the content area, above both the open column and the
  panel, and does not scroll with either.
- **FR-2.2** One segment per crumb, in path order, separated by a chevron. Each names the
  SELECTED row of its column — not the column's heading.
- **FR-2.3** The trailing segment is where the admin is: drawn solid. Earlier segments are
  quieter. This is where `admin-column-browser`'s current-vs-trail distinction lives now
  (DEC-5).
- **FR-2.4** When the drawn column is still ASKING — no row selected — the breadcrumb ends
  with its heading as a non-interactive trailing hint (`… › Innovation › Where?`). A
  sections column with a section chosen is not an open question, so the hint is absent and
  the last segment is the current one. `isAsking` is that predicate, pure and tested.
- **FR-2.5** Clicking a segment opens that level's siblings in a dropdown anchored to it,
  with the current one marked. Choosing applies the same selection rule a column click
  would; dismissing changes nothing.
- **FR-2.5.1** The dropdown is PORTALLED to `<body>` and positioned from the segment's
  rect. Rendered in place it did nothing at all: the bar carried `overflow-x-auto`, and per
  the CSS overflow spec a non-`visible` value on one axis forces the other off `visible`
  too, so the bar clipped its own absolutely-positioned menu. The bar no longer scrolls;
  segments truncate instead.
- **FR-2.5.2** The outside-click check covers BOTH the bar and the portalled menu. Checking
  only the bar closes the menu on mousedown over its own item and swallows the click that
  was choosing something.
- **FR-2.5.3** The captured position goes stale, so the menu closes on scroll and resize,
  and shifts left when it would overrun the viewport.
- **FR-2.6** The dropdown closes on `Escape`, on outside click, and on choosing. Focus
  returns to the segment.
- **FR-2.7** Segments truncate individually with the full value on hover/focus; the bar
  scrolls horizontally rather than wrapping to a second line or forcing page scroll.

### FR-3 — The open level has two shapes

- **FR-3.0** A CHAIN level still open — agent, tenant, subscription — is drawn as a
  centered list of large options, not as a column. At that moment the screen is asking a
  question and nothing else is on it: a 14rem list against the left edge has the shape of
  chrome, and was read as chrome rather than as the thing to do. There is no panel to sit
  beside either — a panel exists only once a section is chosen, and a section cannot be
  chosen before a scope is.
- **FR-3.0.1** Options carry the row's icon, its label at body size, and its hint. They
  rise in on a capped stagger as the level opens.
- **FR-3.0.2** Pressing one marks it and holds ~150ms before the level advances, so a
  choice has a moment that says it landed. Under `prefers-reduced-motion` the hold is
  skipped in JS as well as the animation in CSS: the global guard neutralizes the animation
  but cannot touch a timer, and a pause with nothing to show for it is only latency.
- **FR-3.0.3** A second press while one is pending is ignored — a double click must not
  queue two navigations.

### FR-3.1 — The sections level keeps the sidebar

- **FR-3.1.1** Vertical, on the left, with the panel beside it. It is the one level
  switched repeatedly while working, so it belongs beside the panel rather than in front of
  it — the opposite of the chain levels, which are chosen once and worked under.
- **FR-3.2** Nothing in it is selected, so no row carries the selected treatment. The
  `trail` tone is deleted with the strip that needed it.
- **FR-3.3** Its heading is kept: the breadcrumb's trailing hint names the same question,
  and the heading is what an assistive technology reads as the region's name.

### FR-4 — Deletions

- **FR-4.1** DELETED from `columns.ts`: `Pane`, `deepestPane`, `resolvePane`, `paneIndex`.
- **FR-4.2** DELETED from the browser: the track, the `--track-w`/`--track-x` custom
  properties, the `armed` transition rule, the mobile back control, and `AdminScreen`'s
  `back` state.
- **FR-4.3** Deleted copy: `columns.back`. `columns.headings` survives — the breadcrumb's
  trailing hint reads from it.
- **FR-4.4** These go rather than being adapted: the pane model existed to choose which of
  several panes was on screen, and with at most one column and one panel — never both —
  there is no choice left to make.

### FR-5 — Accessibility

- **FR-5.1** The bar is a `<nav>` with an accessible name; the segments are an ordered
  list; the trailing segment carries `aria-current="page"`.
- **FR-5.2** A segment that opens a dropdown is a button with `aria-expanded` and
  `aria-haspopup="menu"`; the trailing hint is not a button.
- **FR-5.3** Targets stay at least 44 CSS px on touch.

## Edge Cases

- Branding selected → one crumb, no open column, panel full width.
- Fresh visit → root is answered (`Agents`), the agents column is open, breadcrumb reads
  `Agents › Agent?`.
- The legacy store selected → its crumb reads the store's label, never the `ALL_AGENTS`
  sentinel.
- A dropdown choice that changes a level discards the levels after it, exactly as a column
  click does — same handler, same rule.
- Re-choosing the value already selected changes nothing and keeps the tail.
- No authority → no breadcrumb, no column; the existing "no admin access" state stands.

## Verification

`npx tsc --noEmit` (baseline 5), `npx vitest run`, `yarn build`. The user has the stack
running and is looking at the real screen, so the walk is theirs: fresh `/admin`, descend
to a section, confirm no column remains and the panel is full width, then change the agent
from the breadcrumb and confirm the levels after it reset.

## Execution plan

| # | What | Where |
| --- | --- | --- |
| T1 | `splitColumns` + delete the pane model | `columns.ts`, `columns.test.ts` |
| T2 | Copy: trailing hint, dropdown label; drop `columns.back` | `lib/i18n/admin.ts` |
| T3 | `Breadcrumb` | `breadcrumb.tsx`, `breadcrumb.test.tsx`, `breadcrumb-interaction.test.tsx` |
| T4 | Drop the `trail` tone and the `active` prop | `column-view.tsx`, its test |
| T5 | Rewrite the browser around breadcrumb + one column + panel | `column-browser.tsx` |
| T6 | Wire, drop `back` | `admin-screen.tsx` |
| T7 | Gate + record | `.specs/project/STATE.md` |
