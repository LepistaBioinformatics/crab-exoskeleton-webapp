# The collapsed rail: one door to the preview, and tooltips on the rest

## The complaint

> On the left sidebar, add one more icon that will represent the conversations. So when
> the sidebar is collapsed and the user hovers, the floating sidebar with the
> conversations only opens if they hover THAT menu item. On the others, when the user
> hovers, add a tooltip in place of `title` with the menu's name and an explanation, in
> small typography, of what it is about.

## What was wrong

Two problems, and they were the same problem seen from either end.

**The preview opened from the whole column.** `onMouseEnter` sat on the `<aside>`, so
crossing the rail *at all* revealed the conversation list — including on the way to Files,
which meant dismissing a panel that had appeared over the screen unasked. The preview had
no door, so every point on the column was one.

**Each entry's only explanation was `title`.** A rail entry is a glyph. The browser's
tooltip arrives about a second late, cannot be styled, is one line, and never appears on
keyboard focus at all — so a member arriving by Tab had a column of glyphs and nothing
else.

## Requirements

- **FR-1 — The conversation list is an entry of its own**, first on the rail, above the
  destinations. It is what the collapsed pane previews, and until now the one thing on the
  rail with no icon to its name.
- **FR-2 — Only that entry opens the preview.** Hovering any other entry closes it rather
  than leaving it standing over the tooltip that entry is about to show. The expand control
  above them closes it too.
- **FR-2.1 — Leaving is still the aside's.** The preview panel is painted outside the
  collapsed column but is a DOM descendant of it, and `mouseleave` follows the tree rather
  than the geometry: travelling from the entry into the panel fires nothing, which is the
  only reason the panel can be clicked at all. The handler stays on the `<aside>`; moving
  it to the entry would close the panel under the pointer.
- **FR-3 — A real tooltip replaces `title`** on every other entry: the name at reading
  weight, one line under it in small muted type saying what the entry opens. `title` is
  dropped — both at once is the browser's version arriving a second after the real one.
- **FR-3.1 — Hover and focus do the same thing**, so the rail says something to a member
  who arrived by Tab.
- **FR-3.2 — The conversations entry shows its tooltip on FOCUS only.** On hover the
  preview is the answer, and it opens at exactly the coordinates the tooltip would.

## Decisions

- **DEC-1 — Clicking the conversations entry EXPANDS the pane.** The rule two groups below
  is that a rail entry chooses a panel without opening the pane — opening on click pinned
  the sidebar on what was meant to be a glance. This entry has no panel to choose: the list
  it names is what the expanded pane already shows, so "open it properly" is the only verb
  a click could carry. The exception is written into the comment that states the rule.

- **DEC-2 — The tooltip is `position: fixed`.** The entries live in the rail's own
  `overflow-y-auto` column, and a box with `overflow-y: auto` computes `overflow-x` to
  `auto` as well — anything at `left-full` inside it is clipped at the rail's 48px edge.
  Fixed coordinates taken from the button's own rect escape every clipping ancestor, and
  let one element serve every entry instead of one per row.

- **DEC-3 — The tooltip is `aria-hidden`, not `role="tooltip"`.** The button already
  carries the same name in `aria-label`; announcing the card would read the name twice. It
  is a drawing for the eye, which is the half a glyph-only rail was missing.

- **DEC-4 — The section blurbs come back, and the reason they were deleted is the reason
  they return.** They went with the pane that listed the five sections with a sentence
  under each: the sidebar's rows are LABELLED, and a row already reading "Files" does not
  need a line saying Files holds files. That argument holds wherever the label is on
  screen. The collapsed rail is where it does not. Restored verbatim in both locales
  rather than rewritten, so the copy the owner already approved is the copy that shows.

- **DEC-5 — Projects gets a blurb of its own rather than borrowing `projects.hint`.**
  Reusing the hint was the first answer, and it was wrong for the surface: the hint is a
  paragraph the projects screen can afford, and at tooltip width in small type it runs to
  four lines standing beside five one-line neighbours. The duplication DEC-5 was avoiding
  is duplicated MEANING; a shorter form for a narrower surface is what DEC-4 argues for
  when it restores the blurbs at all.

- **DEC-6 — The tooltip lives in `resizable-pane.tsx`.** A file of its own under
  `app/chat/` is globbed by `pane-weight.test.ts`, whose horizontal-rule budget is pinned
  per file. It is also separated by tone and shadow rather than a rule, for the reason that
  test exists.
