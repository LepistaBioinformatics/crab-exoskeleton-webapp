# The conversation list is the tree, and only the tree

## The request

> Make tree mode the only one in the conversation list. For that to work, delete has to be
> available in the tree — today it is only in the list. Also: drop the number that shows the
> message index, and move the date from the right-hand side to underneath the message, in
> very small type, shown only on hover.

## FR-1 — One rendering, no switch

The `List | Tree` segmented control goes, and with it the list branch of
`history-sidebar.tsx`, the list branch of `landing-screen.tsx` (which never had a switch of
its own — it read the same key), the `hv` fragment key, `setHistoryView`, and the four copy
strings that named the two modes.

`hv` is removed rather than left parsed-and-ignored. A key nothing writes and nothing reads
is an invitation to write a second reader, and the two would disagree about the default.

## FR-2 — Delete moves into the tree

The tree's row already carries one action (alias and tags). Delete joins it, taking the
same `ConfirmDialog` the list used, still owned by `history-sidebar.tsx` — the optimistic
drop has to reach both the conversation list and the search results, and only the sidebar
holds both.

A tree row is a VISIT, not a conversation: several rows can belong to one thread. Deleting
from any of them deletes the conversation, which is what the confirmation says by naming its
title. That is already true of the alias-and-tags editor beside it.

The button appears only where a handler is passed, which is how the alias editor already
scopes itself — the landing screen's copy of the tree passes neither and stays read-only.

## FR-3 — The number goes

`·{count}` was the number of messages in a visit, not an index into the conversation — but
it read as one, and it sat in the crowded right-hand end of the row with everything else.
Removed, along with the title that explained it. The information is still reachable: the
visit opens at the message it names.

## FR-4 — The date moves under the message, and waits to be asked

Out of the right-hand cluster, onto its own line under the message text, at `text-[10px]`,
`opacity-0` until the row is hovered or focused.

**Opacity, not `hidden`.** The line keeps its space at rest, so hovering a row cannot push
the rows below it down. This list animates its own reordering (FLIP); a hover that moved
everything under the cursor would fight it.

Shown unconditionally below `md`, matching the action buttons in the same row: a touch
screen has no hover, and a date nobody can reach is worse than a date always on.

## FR-5 — The number that was not an index, and the badge

`HEAD` marked the single most recent visit across every thread. Removed on the same
reading as the count: the row above it already says it is first by being first, and the word
is a git term for a state the picture shows.

## FR-6 — The alias-and-tags editor becomes a modal that names its subject

Asked for alongside the rest, and the tree is why it matters. The editor used to expand
INLINE under the row it was opened from. On a flat list that was fine — the row above it was
the conversation. On a tree of VISITS it is not: opening the editor pushed the rest of the
timeline down, and nothing in it said which of the threads on screen was being edited.

So it is a dialog, portalled to `<body>` for the reason `ConfirmDialog` already records (the
sidebar is a stacking context and a pane at `z-40` paints over anything left inside it), and
its heading is the conversation's name — `alias || title`, the same expression the list, the
breadcrumb and the landing all use. Read off the conversation and not off the draft, so the
heading does not rewrite itself under the member as they type the new alias.

**Escape and the backdrop commit rather than discard.** This editor has never had a discard
path: its single exit runs `handleDone`, which saves an alias typed but not confirmed. A
modal that threw that away on Escape would be a new way to lose work dressed up as a
convention. If a write fails, the dialog stays open carrying the error, exactly as the
button already did.

Two things fixed in passing, both inside the component being restructured: the exit button
said `Done` as a hardcoded English literal in a translated UI — it is `commonCopy.actions.save`
now — and it was a text button where it is the dialog's primary action.

## What this costs

**Nothing, once the breadcrumb is counted.** The list's pencil called `renameConversation`
and the tree has no equivalent — but `breadcrumb.tsx` renames AND deletes the conversation
that is open, from the chevron beside its segment, and that predates this change. The tree
also carries the ALIAS, which takes the title as its placeholder and wins over it everywhere
the two are shown.

So: rename the open conversation from the breadcrumb, rename any conversation by giving it
an alias from the tree, and delete from either.

## Empty states

The tree owns "no conversations yet". It does not know about the search, so the sidebar
keeps rendering "no matches" itself when a query is narrowing the list to nothing —
otherwise a failed search would claim the member has no conversations at all.

## FR-7 — The filter takes the cursor only where mounting was a request

Reported on a phone: opening the new-chat screen put the cursor in the conversation FILTER
and raised the soft keyboard over the screen.

The bar carried `autoFocus` unconditionally, with a comment justifying it — "the bar is
mounted only while the panel's magnifier is toggled open, so mounting IS opening". True of
the sidebar. Not true of the landing, which mounts the bar as part of the screen whether or
not the member came to filter, and where the field they did come for is the composer above
it.

So the focus is a prop, off by default, and the sidebar passes it. That fixes the phone and
also settles a race nobody had noticed: on a desktop landing, the composer focuses itself on
mount too, and which of the two won the cursor was down to effect order.

The guard is the SURFACE, not the pointer type. `composer.tsx` skips its own focus on a
coarse pointer, and copying that here would have been wrong in the other direction: a member
who taps the magnifier on a phone wants the keyboard — that is what tapping search means.

Focus moved from the `autoFocus` attribute to an effect. The attribute is a parse-time
instruction and this field mounts long after parse on both surfaces, so a focus() call is
what was doing the work either way.

## FR-8 — One commit in the editor, not two

The modal had a check beside the alias field and a Save at its foot. Two answers to "how do
I keep this", and the first one left the dialog open, which reads as a save that did not
work. The check is gone; Enter in the alias field now goes through the same commit as the
button, so the keyboard reaches it too. The tag row keeps its own `+`, which is not a
second save — several tags can be added before leaving, and one left half-typed is committed
on the way out.
