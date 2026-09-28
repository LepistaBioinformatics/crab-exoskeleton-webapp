# Sharing a graph fragment without reaching past it

## The request

> On the graph, when a member picks a node to share, the minimum is +1 hop. There should be
> an option to share with no hops — only the node that was picked.

## What was there

`SHARE_HOPS` offered `[1, 2, 3]` and `shareHops` started at `1`. So a member who ticked one
entity always published its neighbours too, and there was no control that said otherwise.
`HopRadius` even documented it: *"Zero is reachable in code, never in the UI."*

The expansion itself was never the problem. `expandByHops(seeds, relations, 0)` returns the
seeds alone and has done since it was written, with a test to that effect. Only the UI had no
way to ask for it.

## FR-1 — Zero is one of the offered counts

`HopRadius` becomes `0 | 1 | 2 | 3` and the control offers four chips. The zero chip reads
"No hops" / "Sem saltos" rather than "+0 hops": zero of something is not an amount of it.

## FR-2 — Zero is the DEFAULT

Not just available — where the control starts.

This is the decision in the change, so it is worth stating plainly. The alternative was to
add the option and leave the default at one hop, which satisfies the letter of the request.
It was rejected: a member who wants to share the entity they picked would have to notice the
new chip and click it every time, and the thing they are undoing is a payload larger than the
count on their screen. The reach is an ENLARGEMENT. Everywhere else in this panel an
enlargement is opt-in — the entity list's share never expands at all — and the map was the
exception.

It is a one-word revert (`useState<HopRadius>(0)`) if the owner disagrees.

## FR-3 — `sharing N` is silent at zero

The readout exists because the hops make the payload bigger than the number the member
ticked. At zero those are the same number, and one bar carrying it twice reads as two numbers
that happen to agree rather than as one restated.

## What is unchanged

The ceiling (`MAX_SHARE_NAMES`), the direction-agnostic traversal, the refusal rather than
truncation past the ceiling, and the map's drawing of the reach — at zero there is simply
nothing to draw beyond the ticks.

## Tests

The report's own case is the regression test: ticking one entity and pressing share sends
exactly that entity. Beside it, the readout stays quiet at zero, turning the reach on and
back off returns to the seeds, and an isolated entity travels alone at any reach. Five
existing tests assumed the old default and now set their reach explicitly, which is the
honest version of what they were always asserting.

Rendered at 280px to check the four chips still fit on one line before the actions wrap.
