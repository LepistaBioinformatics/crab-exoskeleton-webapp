# The mangrove is a tool, not a place

## The request

> Convert the mangrove from a page into a tool, so the posts can be read in the
> right-hand pane rather than in the centre — the member keeps the conversation and
> manages posts alongside the agent. Update the left sidebar too: with only Projects
> left under **Screens**, drop that group and put New chat and Projects together. Leave
> **Tools** grouped as it is.

## What this actually moves

Two lists own the shape of the shell, and the change is one row crossing between them:

| | today | after |
|---|---|---|
| `Destination` (`destination.ts`) | `projects \| mangrove` | `projects` |
| `Section` (`workspace-sections.ts`) | memory, graph, tasks, files, secrets | **+ mangrove** |

Everything else follows: `sidebar-destinations.tsx` reads both, `chat-shell.tsx` routes
on both, and `workspace-screen.tsx` dispatches a section to a panel.

## FR-1 — The mangrove becomes the sixth section

It renders in the pane beside the conversation, through the same dispatcher the other
five use, and it gains nothing of its own: the pane's width, its drag handle and its
close control are `workspace-pane.tsx`'s, and a second set here would be a second thing
to keep in agreement.

**It is last in `SECTION_ORDER`.** The existing order is an argument — what the agent
knows, then what it does on its own, then what the member manages — and shared memory
is the only one of the six that is not scoped by this workspace at all. Last is where a
reader looks for the odd one.

### The fragment key changes meaning, and old links must not crash

`rs=mangrove` was never valid and `d=mangrove` was. `asSection` already refuses anything
outside `SECTION_ORDER` and `asDestination` will now refuse `mangrove`, so a stale link
lands on the conversation with no pane rather than on a crash — which is what
`asSection`'s own comment says that guard is for.

## FR-2 — The rail cannot survive a 240px pane unchanged

This is the one part that is not a move.

The mangrove's five readings are a 180px rail beside the feed, and the pane's minimum
width is **240px**. Worse, the rail's responsive fallback is keyed on `sm:`, which is a
**viewport** query: on a desktop viewport the rail keeps its 180px column inside a pane
a third that wide, and the feed beside it gets nothing.

The fallback is switched to a **container query**, so the rail answers the width it
actually has rather than the window's. `file-preview.tsx` already declares
`[container-type:inline-size]` for the same class of bug — a `cqw` formula that measured
the viewport and broke out of a dialog — so this is the codebase's existing answer, not
a new mechanism.

Below the threshold the rail is the horizontal scroller it already becomes on a phone.
Above it, the column comes back. A member who drags the pane wide gets the two-column
reading; one who leaves it narrow gets the scroller.

## FR-3 — The sidebar loses a group, and keeps the other

**Screens** held two rows and now holds one, so it stops being a group. New chat and
Projects sit together at the top, unlabelled — a heading over a list of one is a word
that earns nothing.

**Tools stays exactly as it is**: labelled, collapsible, and now six rows. The asymmetry
the file documents survives intact and gets simpler to state — there is one group, it is
the foldable one, and everything above it is where the member can be.

`DestinationGroup.collapsible` was a field because two groups disagreed about it. With
one group left it is still a field, because the ungrouped rows above are no longer
*a group at all* rather than a group that refuses to fold.

## FR-4 — The book and the sidebar copy follow

`shell.groups.screens` loses its only reader and goes. The member chapter
(`23-mangrove.md`) says the mangrove is under **Screens** and opens in the centre; it
says the right pane now. This repository's chapter is in the product repo, so that lands
with the pointer bump rather than here.

## Deferred

- **DQ-1 — nothing here, and the first draft of this spec was wrong about it.** It said
  the sidebar row is not gated on the mangrove being configured. It is: `chat-shell`
  reads `useMangroveEnabled` and passes `hidden.mangrove`, which #100 added after
  exactly that complaint. Moving the row into `SECTION_ORDER` silently disconnected the
  filter — it only reached named rows — so `visibleRows` now reaches into section rows
  too. Written down because the claim was checked late and the code had already been
  changed on the strength of it.
