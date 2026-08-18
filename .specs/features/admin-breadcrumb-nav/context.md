# admin-breadcrumb-nav — Context

Amends `admin-column-browser`, shipped in the same session. The column browser's model and
its Finder grammar stay; what changes is how much of the path is drawn as columns.

## The complaint

Five columns at 12rem each consume ~1000px before the panel gets any, and the panel is
where the work happens. The user read this off the desktop screenshot taken during that
feature's verification — a fair reading of that image.

## DEC-1 — Answered levels collapse into a breadcrumb; at most ONE column is drawn

As the admin descends, each answered level leaves the strip and becomes a breadcrumb
segment at the top. The only column still drawn is the one whose question is unanswered.
Once everything is answered there is no column at all: breadcrumb, then the panel at full
width.

This does not abandon the column browser — it keeps its rule (a column lists the children
of the level before it) and stops paying for the levels already decided.

## DEC-2 — The open column stays VERTICAL, on the left

Offered as a horizontal chip row under the breadcrumb ("everything at the top", literally)
and rejected. A vertical column reads long lists better, and one column instead of five
already recovers most of the width. The chip row would have traded a real reading surface
for a smaller win.

## DEC-3 — A breadcrumb segment opens its SIBLINGS in a dropdown

Clicking `alpha` lists beta, hermes-glm and the legacy store under that segment, with the
current one checked. Choosing changes the level; not choosing changes nothing, and the
panel behind stays.

The alternative — a segment click walks back to that level and re-opens its column — was
rejected: changing one level would mean re-walking every level after it, which is the cost
this feature exists to remove.

## DEC-4 — Mobile stops being a separate layout

With at most one column and one panel, and never both, there is nothing to slide between.
The pane model (`resolvePane`, `deepestPane`, `paneIndex`, the track, the `back` state and
its control) is DELETED rather than adapted: it existed to choose which of several panes
was on screen, and there is no longer a choice to make. The breadcrumb is the way back on
both breakpoints, which is one rule instead of two.

## DEC-5 — The signature moves rather than disappearing

`admin-column-browser` spent its emphasis on current-vs-trail row tones, so the path could
be read across the columns. The breadcrumb IS that path now, so the `trail` tone has
nothing left to say and goes. What replaces it: the trailing segment of the breadcrumb —
where you are — is drawn solid, the earlier ones quieter and clickable.

## Constraints

Unchanged: same tokens and type scale, `cva` throughout, copy through `adminCopy` in both
locales with `parity.test.ts` as the gate, rules pure and truth-tabled, gate is
`tsc` (baseline 5) + `vitest` + `yarn build`.
