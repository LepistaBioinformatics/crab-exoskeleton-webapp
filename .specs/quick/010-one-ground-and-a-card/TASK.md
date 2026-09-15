# 010 — One ground under the shell, and the curtain as a card

## What the owner asked

> In light mode use background #fcfcfb, and white in the main text box. Apart from that,
> the sidebar's and the side curtain's background colours should be the same as the chat's
> background. Add a rounded border to the side curtain and add a margin-y and on the right.

And, mid-change:

> Swap the new-chat and conversation-history icons so they are in the same order as the
> open menu.

## What changed, and what it cost

**The page moved off white.** `--bg` was `#ffffff` with a note saying it had to stay
there, because moving it tints every page in the product. That is still true and is now
the point. `#fcfcfb` is a 1.5% step down and a degree warm — enough to stop a full-screen
white from glaring without reading as grey. The two tonal steps above it (`--surface`,
`--elevated`) are unchanged, so the separation that block was measured for still holds
wherever it is still used.

**The composer's field is the one thing still at pure white.** It was `--elevated` with
every other raised surface, which worked while the page behind it was white: the field
read as a well pressed INTO the page. With the page a step down the relationship inverts —
the field is the thing being written in, so it is the thing that should be brightest. A
token of its own (`--composer-bg`), because dark must keep `--elevated`: a white field
there is a lamp.

**The sidebar and the pane give up their tone.** Both were `--surface` against the
centre's `--bg`, which is how their boundaries were drawn once the violet hairline came
out of every header. They are level with the conversation now — so the tone draws nothing,
and each region needs whatever edge it is going to have on its own terms:

| Region | Edge |
|---|---|
| Sidebar | none. Its structure is its own content — rows, headings, spacing |
| Hover preview of the collapsed sidebar | the shadow it already had, which is what says it floats |
| Pane beside the conversation | a rounded border with air on three sides — a card |

That last one is not optional and is the half the request implies rather than states: level
with the chat and with no border, the pane would have had no edge at all. "Rounded border"
is read literally — the border is what makes the radius visible when the fill matches what
is behind it.

The card is `md:` on all four properties. Below that width the same element is a
full-height overlay drawer, and a drawer inset from the edges of the screen is a dialog
that forgot to dim what is behind it.

**The rail reads in the open column's order.** New chat, the destinations, the conversation
list — top to bottom in both. The rail is what a member reads while the column is
collapsed, which is exactly when they cannot open it to check.

## Worth watching

`--surface` and `--elevated` are cool blue-greys measured against a white page; the page is
now a hair warm. On the surfaces that keep them — cards, selected rows, hover states — the
mismatch is small at these values but it is real, and it is a separate pass if it shows.

## A rule that survives for a reason the rule-budget does not name

`pane-weight.test.ts` governs the shell's hairlines with one principle: **a horizontal rule
survives only where content scrolls past it.** Two lines added here survive for a different
reason — the pane's `md:border` and the hover preview's `md:border-r` are edges that exist
because the TONE stopped drawing them, not because anything scrolls past.

They escape that test because its matcher looks for `border-[tb]`, and both of these are a
full box and a right edge. That is an accident of the matcher, not a decision, so it is
written down here: a later sweep that reaches them should read this before deleting them on
the strength of a principle that was written when the sidebar was a tonal step above the
chat, and no longer covers the case.

The comment in `workspace-pane.tsx` was reversed rather than extended for the same reason —
it used to say the pane takes no border because the tone draws the boundary, which is now
false in both halves.

## Named but not changed

`turn-dock.tsx` is `bg-surface` and sits inside the centre column, above the composer — chat
chrome, not a sidebar or the curtain, so it is outside what was asked. With the page a hair
warm and the composer at pure white it is now the most visible instance of the cool/warm
mismatch noted above. Left alone deliberately: the dock is meant to stand apart from the
transcript, and three files assert `bg-surface` on it literally.
