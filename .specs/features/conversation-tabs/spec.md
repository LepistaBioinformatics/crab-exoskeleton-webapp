# Conversation tabs, the way an editor has them

## The request

> Today when a member opens a chat, sends a message and then opens another, the chat
> goes into a lower tab and is only there while it is running, or has finished and they
> have not clicked it yet. But if they go to another chat and then want to come back to
> one from another project, they can lose track of what they were working on.
>
> Implement tabs like VSCode's: click to open one and keep working in it, open another
> beside it and work there too. They stay open so the member knows what they were last
> working on. To keep one open the member double-clicks or sends a message — then the
> chat stays in the tab like a page. They close it with the × at the top of the tab,
> like a code editor.
>
> Remember that URL parameters and other things may change per tab, so we will need to
> deal with that.

## What is there now, and why it is not this

`turn-dock.tsx` is **a read-out of turns that are running**, not of conversations that
are open. Its own header says so: *"It is a READ-OUT, not a mechanism."* It enumerates
`turn-store`, which knows about an active turn and a finished one the member has not
acknowledged — so an entry leaves the moment it is acknowledged, which is exactly the
behaviour the request describes as losing your place.

The two are not the same list and neither replaces the other. A conversation can be:

- **open and idle** — belongs in tabs, has nothing to say to the dock;
- **running but never opened as a tab** — a scheduled task's turn, say; belongs in the
  dock and must not silently become a tab;
- **both**, which is the ordinary case while a member is working.

So this is a second surface, and the dock is untouched.

## The decision the request flagged

> *"URL parameters and other things may change per tab."*

**The fragment describes the ACTIVE tab, and nothing else. The tab list is not in the
URL.**

The fragment already is exactly one location — `t`, `s`, `r`, `p`, `sid`, plus the
view keys `v`, `rs`, `hv`. Switching tabs rewrites it, and that is the whole
integration: a tab is a saved fragment, activating one replays it.

The alternative — encoding every open tab in the URL — is rejected on two grounds, and
the second is the disqualifying one:

1. A link would grow with the member's working set.
2. **Pasting a link would hand somebody your whole working set.** A URL is the thing
   members share; it must keep meaning "this conversation", not "the nine things I have
   open, including the two from a project you are not in".

So the tab list lives in `localStorage`, which is where this shell already keeps state
that is about how a member works rather than where they are — the sidebar's fold does,
and `destination.ts` records the rule: *a remembered place outlives the URL that
justified it*. A tab list is not a place; it is a workbench.

**A consequence worth stating: the tab strip is per browser, not per account.** Opening
the app on a second machine shows no tabs. That is what an editor does too.

## What it does

### FR-1 — a tab is a whole location, not a `sid`

The request names the case: *"come back to one from another project"*. So a tab carries
the full tuple — workspace `(t, s, r)`, project `p`, conversation `sid` — and
activating it restores all of it. A tab list keyed on `sid` alone would send a member
to the right conversation in the wrong project, which is worse than not going.

**AC-1.1** — activating a tab from another workspace switches the workspace.
**AC-1.2** — activating a tab from another project restores `p`.
**AC-1.3** — two conversations with the same `sid` under different projects are two
tabs. (Not expected to occur, but the key is the tuple and the test says so.)

### FR-2 — preview and pinned, exactly as an editor has them

**One click opens a PREVIEW tab.** There is at most one, it is rendered in italic, and
the next preview replaces it. This is what makes clicking through a history list cost
nothing: nine glances leave one tab, not nine.

**It is pinned by a double click, or by sending a message.** Sending is the stronger
signal of the two and the one the request leads with: a member who has written into a
conversation is working in it.

**AC-2.1** — clicking three conversations in turn leaves one tab.
**AC-2.2** — double-clicking the preview pins it, and the next click opens a new preview
beside it rather than replacing it.
**AC-2.3** — sending a message in a preview tab pins it, with no click.
**AC-2.4** — pinning is idempotent: sending a second message does not open a second tab.

### FR-3 — closing

An × on the tab, revealed on hover and always present on the active one — a control
that appears only on hover is unreachable on a touch screen, and the active tab is the
one most likely to be closed.

**AC-3.1** — closing a tab that is not active leaves the active one alone, and does not
navigate.
**AC-3.2** — closing the ACTIVE tab activates its neighbour, preferring the one to the
right, as an editor does.
**AC-3.3** — closing the LAST tab lands on the workspace's landing screen: the project's
own, or the agent's at the root. Either one offers a new conversation and the history.

> **AC-3.3 reverses what this spec first said**, which was that closing the last tab
> leaves the shell where it is — *the member closed a tab, they did not ask to go
> somewhere*. That is right for one close among several and wrong for the last one,
> because there is then nowhere to stay: the transcript stayed on screen under an empty
> strip, so the conversation was open and not open at the same time. The owner reported
> it as a bug and it is one — the strip is the answer to "what am I working in", so a
> centre pane the strip does not list makes the strip wrong.
>
> Landing is written with the same fragment write `New chat` makes, so it drops `sid`
> and `v` and keeps `p` and `rs`: a pane open beside the conversation is not a place the
> member was standing, and closing a tab is not a reason to put the file list away.

### FR-4 — the strip survives a reload, and a tab that no longer exists

Tabs are restored on load. A conversation deleted elsewhere leaves a tab pointing at
nothing; activating it must not strand the member on an empty transcript with no way
back. The tab is dropped when the shell finds it gone, and the member is told once.

**AC-4.1** — a reload restores the strip and the active tab.
**AC-4.2** — a stored entry whose shape does not parse is discarded rather than
crashing the shell. `localStorage` is text a member can edit, and this shell has
already paid for an unchecked cast of fragment text once (`asDestination`'s comment
records it).

### FR-5 — it does not fight the dock

The dock keeps showing running turns, including for conversations with no tab. A
conversation that is both shows in both, and neither one's controls change the other's
list — acknowledging a finished turn does not close a tab, and closing a tab does not
acknowledge anything.

## Out of scope

- Reordering tabs by dragging. An editor has it; nothing in the request asks for it,
  and it is additive later.
- Tab groups, splits, "reopen closed tab".
- Syncing the strip between browsers. Stated above as a consequence, not a gap.

## Design questions answered while writing this

**DQ-1 — where does the strip go?** Above the conversation, under the breadcrumb. The
breadcrumb says where the active tab IS; the strip says what else is open. Putting it
below the transcript would collide with the dock, which is already there and is a
different list.

**DQ-2 — does opening a conversation from the sidebar create a tab?** Yes, a preview
one. That is the single click of AC-2.1, and it is what makes the feature cost the
member nothing to adopt.

**DQ-3 — what about a brand-new conversation?** It has no `sid` until the first turn is
created, so it cannot be keyed. It becomes a tab when it acquires one, which is the
same moment sending a message pins it.
