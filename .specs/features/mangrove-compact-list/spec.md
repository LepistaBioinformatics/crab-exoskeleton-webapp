# The mangrove's readings are a compact list, one post open at a time

## The request

> Mangrove posts are too big in the feed and in Published. They should look more like a
> compact list, all the same height, and only one open at a time: opening another closes
> the previous one.

## FR-1 — A closed post is a two-line row of fixed height

`mangrove-post.tsx`. Closed, a post is one row of 64px (`h-16`), the same for every kind:

- line one: the kind's glyph (note, file, fragment), the title truncated to one line (the
  cell, the file name, or "fragment"), the sender (muted, truncated) and the action pill;
- line two, the PREVIEW, one truncated line of what is inside: a note's opening with its
  markdown punctuation removed and whitespace collapsed; a file's size and media type; a
  fragment's first four entity names and "+N".

The full body (rendered prose, file controls, fragment map) is NOT shown closed. It used
to be visible on every card, which is what made cards tall and uneven. A first pass at a
single 48px line was too thin to recognise a post by -- the owner asked for a richer row
that is still compact, which is what the preview line is.

The unread left edge, the receipt-on-open and the keyboard behaviour are unchanged.

## FR-2 — Open shows the body and the footer below the row

Opening keeps the row as the header and reveals the body and the footer (record and
controls) under it. Closed, both are `hidden` rather than unmounted, so a merge result or
a "referenced" note survives closing and reopening.

## FR-3 — One open post per screen

`mangrove-screen.tsx` holds which post is open, across the pending queue and the
timeline. Opening a post closes whichever was open; clicking the open one closes it.
Switching reading (feed / published) closes it.

## Out of scope

- Pagination or virtualisation of long readings.
