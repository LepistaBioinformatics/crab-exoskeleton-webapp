# 008 — The panes close the way they open

## What the owner reported

> When the sidebar and the side curtain open they animate, but when they close they
> close with no animation. Add animation to them.

## What was actually asymmetric

Four mechanisms wear the word "sidebar" between them. Only two of them were broken,
and they were broken for different reasons.

| Mechanism | Opening | Closing | Verdict |
|---|---|---|---|
| Left pane, mobile drawer (`pane` cva) | slides | slides | already symmetric — untouched |
| Left pane, desktop hover preview (`PEEK_BASE`) | slides in | **pops** | `md:invisible` lands at t=0 |
| Left pane, desktop collapse (`md:w-12`) | pops | pops | out of scope — see below |
| Right pane (`.pane-open`) | grows from 0 | **pops** | unmounted before anything can run |

## The two fixes

**The hover preview** transitioned `transform` only, so the outbound slide ran behind
an element that was already `visibility: hidden`. `visibility` is a transitionable
property with exactly the semantics wanted — it flips to visible immediately on the way
in, and holds visible for the whole duration on the way out — so adding it to the
property list (`md:transition-[transform,visibility]`) animates the departure without a
delay trick and without a second class that could fight the first.

**The right pane** is removed from the tree the moment `rs` clears, and there are three
gestures that clear it (the pane's own X, the rail icon, the sidebar row — the last two
through `nextSidebarValue`). No CSS-only exit is reachable from there: `@starting-style`
is entry-only and `allow-discrete` still needs the node mounted. So the shell keeps the
closing section alive for the length of the exit (`exiting`), renders the pane with
`.pane-close`, and drops it on `animationend`.

`.pane-close` is an ANIMATION rather than a transition for the same reason `.pane-open`
is: the width is drag-resizable, and `transition: width` makes the edge lag the cursor.

## Out of scope, deliberately

Collapsing the desktop sidebar to its rail does not animate in EITHER direction, so it is
not the asymmetry reported. Fixing it means the same animation-not-transition treatment
(`--pane-w` is rewritten on every drag frame), which is a larger change than this one.

## Two things the obvious version got wrong

**Re-opening the section mid-exit replayed the arrival.** `.pane-open` animates width from
zero, so putting it back on an element that is already on screen collapses the pane to
nothing and grows it again — a worse frame than the one being smoothed. The arrival now
plays on a mount and nowhere else.

**The mobile drawer must still leave in one frame.** `max-md:w-[92vw]!` beats an animation
in the cascade, so neither keyframe has ever moved this element on a phone: the drawer
appears and disappears instantly, symmetrically, and that is not the asymmetry reported.
Left at 200ms the exit would run invisibly and hold a dead drawer on screen for a fifth of
a second. The animation is SHORTENED to 1ms below `md`, not removed — `animation: none`
means no `animationend`, and the shell waits for that event to unmount.
