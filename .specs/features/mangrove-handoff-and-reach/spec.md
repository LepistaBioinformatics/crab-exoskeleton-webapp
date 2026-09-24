# Getting to the mangrove, and seeing how far a post goes

## The request

> When the member is in the files list and clicks "Share to the mangrove", a button
> should appear so they can switch to the mangrove tab — that is where they finish the
> post, now that there is no mangrove screen.
>
> On the mangrove's "Who reads it", the field that picks who will see the post should
> give a sense of scale and hierarchy: picking a few people should read as narrow,
> while picking the tenant should read as many more people and accounts.

Two changes to two surfaces. They are specified together because the first is the
half of the tool conversion that was left behind, and finding it is what made the
second worth doing properly rather than decoratively.

## What is there now

### FR-1 — the handoff is broken, not merely missing

`files-screen.tsx:744` parks the share on the bus and then calls
`setDestination("mangrove")`. That worked while the mangrove replaced the centre pane.
It does not now: `asDestination` was narrowed to `"projects"` when the mangrove became
a right-pane section, and it **refuses** `"mangrove"` — deliberately, because a link
written against the old one-key model still carries that value.

So today the member clicks the control, the share is parked on a bus nobody is
listening to, `v=mangrove` is written to the fragment and refused on the next render,
and **nothing happens on screen**. The file is not shared and there is no error: the
click is swallowed.

`chat-shell.tsx:233` carries the same dead call as `onMangrove`, which `crumbs.ts`
destructures and never uses — the mangrove crumb went when the mangrove stopped being
a place.

### FR-2 — the audience control says what, never how much

`mangrove-audience.tsx` renders the four scopes as a flat row of radio segments:
*Only you* · *People* · *Everybody in this subscription* · *Everybody in this tenant*.
Every one is the same width, the same weight and the same colour, so the control says
these are four alternatives and nothing about one being contained in the next.

The one line underneath (`scopeNote`) is about consequence — who has to approve, who
can read — never about size.

One of those lines is also **false**. `scopePeopleNote` reads *"Each person decides
whether to let it into their agent's memory."* That described the hold, which was
retired: there is no admission step, and the copy survived it.

## What it should do

### FR-1.1 — the share hands off, and the member chooses when

Clicking *Share in the mangrove* on a file parks the share and puts a control in front
of the member that opens the mangrove pane, rather than navigating for them.

**Why not navigate.** The pane is where the files list is. Switching it automatically
takes away the list the member is standing in, mid-task, on a click they may have
aimed at one of several files. The button is the fix the request asks for, and it is
also the honest shape: the share is already captured, and going to finish it is a
second decision.

**AC-1.1.1** — after the click, a control naming the mangrove is on screen.
**AC-1.1.2** — activating it opens the mangrove in the right-hand pane (`rs=mangrove`).
**AC-1.1.3** — the composer opens holding the file, as it did through the old route.
**AC-1.1.4** — nothing writes `v=mangrove`, in this file or anywhere else.

### FR-1.2 — the handoff says which file

The member may have clicked one row of twenty. The control names the file it captured,
so a mis-aimed click is visible before they leave the list.

### FR-1.3 — the dead route goes

`setDestination("mangrove")` is removed from both call sites, and `onMangrove` with it
— the prop `crumbs.ts` takes and never reads.

### FR-2.1 — the scopes read as a ladder

The four are rendered as steps of increasing reach rather than four equal segments,
so containment is legible without reading: **you ⊂ the people you name ⊂ this
subscription ⊂ this tenant**.

**AC-2.1.1** — the chosen step and every narrower one are marked; the wider ones are not.
**AC-2.1.2** — the order is the containment order, and it comes from the existing
`offeredScopes`, which already returns it — not a second ordering that could disagree.

### FR-2.2 — each step says what it contains, in true words

- *Only you* — nobody else.
- *People* — the ones you name, **and the count when there are any**. "3 people" is a
  number this UI actually holds.
- *This subscription* — everybody in it.
- *This tenant* — every subscription in it, and everybody in those.

**NO INVENTED NUMBERS.** The webapp cannot count a subscription or a tenant: the
directory is a *search*, and in `exact` mode it will not enumerate at all
(`DirectoryResult.mode`). A figure would have to be fabricated, so the widening is
said as containment — which is true, checkable, and the thing the request actually
asks for.

**AC-2.2.1** — no member count is displayed for `subscription` or `tenant`.
**AC-2.2.2** — the recipient count under `people` is the length of the list the member
has built, and is absent at zero.

### FR-2.3 — the tenant step is a change of kind, not only of size

The request names it: *"more people **and accounts**"*. A subscription is people; a
tenant is subscriptions, each with its own people. The copy for the widest step says
so, because "even more people" would undersell what is actually being crossed.

### FR-2.4 — the false line is corrected

`scopePeopleNote` stops describing the admission step that no longer exists. What is
true now: it lands in their mangrove, and taking a shared memory into a graph is still
only ever the recipient's own act.

## Out of scope

- The share control in the knowledge graph panel. It publishes to the same bus and
  will want the same handoff, but it is reached from a different pane and the request
  names the files list.
- Any change to what an audience *does* — `audienceFor` and the capability gate are
  untouched.

## Design questions answered while writing this

**DQ-1 — should the handoff button replace the share control, or sit beside it?**
Beside, and transient. The share control belongs to its row and must stay where it is
for the next file; the handoff is about the share just made, so it belongs where the
member's attention is after the click rather than in the row.

**DQ-2 — why not a real count for the subscription?**
Because there is no route that answers it. The proxy has a `subscription-members`
question, but it is the one the *mangrove* asks the proxy, not one this app is routed
to — a previous run of `scripts/gateway_routes.py` confirmed it is not exposed. Adding
a route to display a number is a larger change than the request, and a wrong number
here is worse than none.
