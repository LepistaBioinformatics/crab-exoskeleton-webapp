# 009 — The code pane wraps, and its controls moved under the document

## What the owner reported

> Fix the rendering defect in the side curtain: when I scroll through pages of code, the
> numbered left column paints over the top menu. Also implement text wrap for very wide
> text.

And, mid-change:

> Move those controls to the bottom of the viewer and make them smaller, using icons so
> they are more compact. Don't forget `title` so the user knows what they do.

## The overlap

Two sticky elements, one stacking context, the same `z-10`: the view bar at `top-0` and
the line-number gutter at `left-0`. A tie at equal z-index goes to document order, and the
gutter comes later — so scrolling a source file up dragged the numbers' background and
their vertical rule straight over the bar.

Raising the bar would have settled that instance. Moving the controls OUT of the scrolling
element settles the class: the preview is a flex column now, the scrollport is one child
and the footer is its sibling, so no sticky descendant can reach the controls whatever it
sticks to — and the footer cannot cover the last line of a file or the bottom edge of a
rendered frame either, which a sticky bottom bar inside the scroller would have.

## The wrap, and what it cost

The numbers were a sibling `<pre>` of the code (`preview-plain-text-fallback` DEC-2). The
two columns stayed aligned only because each source line occupied exactly one row in both
— the premise wrapping destroys. A line broken into three rows sits beside one number and
every line below it is off by two.

So the pane is a grid with a ROW PER LINE, and the correspondence is structural instead of
arithmetic. What DEC-2 was avoiding became `code-lines.ts`: highlight.js returns spans that
cross newlines, so the split closes every span still open at the break and reopens the same
stack on the next line. Text between tags is copied through byte for byte — the escaping
highlight.js applies is the security boundary of the feature and this function never
decodes or re-encodes anything.

`preview-formatting-and-odf` DEC-2 ("code scrolls, text wraps") stands as the DEFAULT
rather than being reversed: a YAML's columns carry meaning. What it never covered is the
file that opened this ticket — a generated HTML report whose every line is a
300-character URL. The footer's wrap control is that case, per file, for the session.

## The footer

Icons at `size-7`, each with `title` and `aria-label` from the same dictionary string, and
`aria-pressed` for state. Rendered/Source appear for the two kinds that have two readings;
wrap appears wherever the code pane paints, which includes a plain `.yaml` that has no
second reading at all.

## Known trade-off

A row per line is two elements per line. At the 2 MB preview ceiling that is a much larger
tree than two `<pre>` elements were. Not virtualised: the previous design already put the
whole highlighted file in the DOM, and the span count highlight.js produces dominates.

## Three things review caught

**The numbers are drawn, not written.** A row per line means the gutter cells sit
*between* consecutive code cells in document order, so a selection dragged down the file
crosses them. `user-select: none` would have been a promise about what three browsers do
with the clipboard. `content: attr(data-line)` on a pseudo-element is not part of the
document's text in any of them — and the attribute still carries the value, so the
correspondence is there to read, for a test and for anyone inspecting the pane.

**A truncated tag no longer leaves spans open.** The malformed-markup branch pushed the
remainder through as text with the open stack still standing, so the last line could reach
`innerHTML` unbalanced — where a browser repairs it by swallowing whatever follows.

**Wrap resets with the file, which is what its own comment already claimed.** This pane is
not keyed by path: opening a second file reuses the instance, so anything not reset
explicitly is carried into the next file silently. It now resets beside `view`, which was
already doing exactly this for the same reason.
