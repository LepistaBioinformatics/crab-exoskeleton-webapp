# A select mode on the knowledge graph's map

## The request

> The node selection we added for sharing into the mangrove is now competing with the
> click that opens an entity's details. Both are useful. Let the member turn selecting
> ON with a button; with it off, a click goes back to opening the details. This is about
> the knowledge graph's Map tab.

## The conflict, exactly

`memory-graph-panel.tsx`'s `selectOnMap` made ONE gesture do two things:

```ts
replaceChecked([name]);   // the share set, thrown away and rebuilt
void select(name);        // the detail pane
```

So reading three entities in a row left a share selection the member never asked for —
the last node they happened to look at — and building a selection of four meant
Ctrl/Cmd-clicking every one of them, because a plain click on the fifth would discard
the first four. Nothing on screen said the modifier existed.

The two acts were merged because the map had no way to say which one a click meant. A
mode is that way.

## FR-1 — A select mode, off by default

`MemoryGraphView` owns `selectMode`, beside the `pathMode` it already owns, and starts
`false` — the map behaves on first paint the way a member expects a graph to.

Node taps resolve in one order, in one place (`onNodeTap`):

| state | a tap on a node |
|---|---|
| path mode | picks a path endpoint (unchanged) |
| select mode | ticks the node into the multi-select; the detail pane does not open |
| neither | opens the detail pane; **the multi-select is not touched** |

The last row is the fix. Everything else follows from it.

## FR-2 — Ctrl/Cmd keeps adding to the selection

Kept, deliberately. It is what members have today, it is the convention on every
multi-select canvas, and in select mode it is simply a no-op difference — a plain tap
already ticks. It routes through the same `onPick` as a select-mode tap, so there is one
path into the set rather than two.

The `additive` flag on `onSelect` is gone. `onSelect` now means "open this entity" and
`onPick` means "tick it"; the caller says which it wants instead of passing a boolean
that the panel destructures into two unrelated behaviours.

## FR-3 — The mode is exclusive with path mode, at the toggles

Turning either mode on turns the other off, where each is toggled — not by branch order
in the tap handler. Three interpretations of a click with an implicit winner is the
shape of the bug this feature removes.

## FR-4 — Where the toggle lives

In the flow, under the map's filter bar and above the selection bar, rendered by the
view so it is INSIDE the fullscreen element — the same lesson the filter bar and the
selection bar each paid for once already.

Not in the selection bar: that bar only exists once something is ticked, so the control
that starts ticking cannot live in it. Not as a corner overlay: the map's four corners
are taken (tools, truncation notice, spread, fit/expand), and a 28px glyph is a poor way
to announce a mode anyway. It carries `aria-pressed` and the chip styling the scope
switch beside it already uses, and while the mode is on it says what a click now does.

Not gated on the mangrove being enabled. Sharing is the only thing the selection feeds
today, but the entity list's ticks are not gated either, and a difference between the
two would mean nothing to a member.

## DEC-1 — Turning the mode off never clears the selection

The set survives the mode, the tab and the filters, for the reason
`use-graph-selection.ts` was built around: dropping names the member did not ask to drop
is the failure being avoided. Clearing is a separate, labelled button.

## DEC-2 — The mode lives in the view, so it resets on a tab switch

Same as `pathMode`, and for the same reason it is acceptable: what the member built —
the selection — is owned by the panel and survives. Coming back to the map in normal
mode costs one click and can no longer damage anything, which is the point of FR-1.

## DEC-3 — Not part of `dirty` / reset

The reset control restores what the map SHOWS. A selection in progress and the mode that
builds it are the member's work, and reset must not throw work away. Path mode is in
`dirty` because a half-traced path IS part of the picture.

## DEC-4 — No Escape binding

Path mode binds Escape because it can trap a member mid-trace with no visible way out.
Select mode's exit is the same labelled button that entered it, always on screen.

## FR-5 — Ticked nodes are exempt from the focus fade

`applyHighlight` exempts the share's reach from the fade around an open entity, but that
exemption is `shareNames`, which is absent where there is no mangrove. With a mode the
member can now tick while a detail pane is open, so `checked` joins the exemption
directly: a ticked node at `opacity: 0.1` is a map that says nothing about what was
ticked. Where a mangrove exists this changes nothing — the seeds were already inside
`shareNames`.

## Copy

`memoryGraph.selection.pick`, `pickOff` and `pickHint`, both locales, all three distinct
per locale so `lib/i18n/parity.test.ts` stays quiet.

## Out of scope

Rubber-band selection, select-all, and inverting a selection.

---

## BUG-1 — The flickering horizontal scrollbar, reported alongside this work

> Selecting a node changes the width and the x-axis scrollbar keeps appearing and
> disappearing.

Pre-existing, and not caused by the select mode — but it fires on exactly the gesture this
feature is about, so it is fixed here.

**The arithmetic.** The graph column holds two children that cannot both shrink: the stage
(`min-height: 240px`) and the detail pane (a fixed pixel height from the drag handle,
320px by default, `shrink-0`). 560px of irreducible content in a column that is roughly
450px tall on a normal pane. The excess does not resize anything — the column has no
`overflow`, so it spills into the panel's scroll area.

**Why the spill lands on the X axis.** Measured in Chromium against the real box tree, pane
320×600:

| | `A.clientWidth × Height` | `A.scrollWidth × Height` | scrollbars |
|---|---|---|---|
| before | 305 × 505 | 320 × 631 | both |
| after | 320 × 520 | 320 × 520 | none |

The vertical scrollbar takes ~15px of width. The Cytoscape canvas had already been sized
in pixels from the container *before* that scrollbar existed, so it overhangs by exactly
15px — a horizontal scrollbar.

**What was measured and what was not.** The table is measured: the overflow is real, and the
fix removes it. The OSCILLATION was not reproduced — the harness recorded zero flips in
every run, including the baseline, because a headless page with no compositor never
delivered the second `ResizeObserver` notification. The mechanism is therefore inference,
not observation: Cytoscape 3.34 observes its container, so it re-matches the canvas to the
narrower box, the horizontal scrollbar goes away, the height it was costing comes back, and
the cycle restarts. It fits the report and it fits the numbers, and it is still inference.
What justifies the fix regardless is the first line of the table: the overflow that every
version of the story starts from is there, and after the fix it is not.

**The fix.** The pane gets a ceiling on the map, and only there: `max(120px, calc(100% -
240px))` — the column, less the floor the stage keeps, never below the pane's own minimum.
`MAP_STAGE_MIN_HEIGHT` is exported from the view and the ceiling is written against it, so
the two numbers cannot drift; a drift would not look like a broken constant, it would look
like this bug coming back.

Second, the panel's scroll area is now `overflow-y-auto overflow-x-hidden`. Nothing in this
panel is read sideways, so a horizontal scrollbar there is always a layout fault reaching
the member — and on the map it is one that oscillates.

**What is NOT fixed.** A pane too short to give both their floors (roughly under 380px
tall) still overflows vertically. The pane holds its own 120px minimum there rather than
collapsing, and the horizontal bar can no longer appear, so what is left is an ordinary
vertical scroll.

**Test.** jsdom does no layout, so the assertion is the contract rather than the pixels: on
the map the pane carries a ceiling written against the stage's floor, and on the entity
list it carries none, because there its neighbour is a list that can shrink.

---

## UI-1 — The map's chrome, gathered

> The map screen got confusing: too many buttons, misaligned, different kinds of menu
> mixed together.

Fair, and the select mode made it worse — it arrived as a fifth band. What the member had
between them and the graph, top to bottom: the panel's hint, the tab row, the filter input,
the scope row, the select-mode row **plus its explanatory sentence**, and the selection bar.
Then three more control clusters scattered over three corners of the stage: the tools button
top-right, the spread readout bottom-left, fit and fullscreen bottom-right.

**One switch row.** The scope chips, the select mode and the tools button now share the line
under the search box: scope on the left, the two mode switches on the right. All four are
`scopeChip`, all four are `aria-pressed`, and the chip carries a fixed 22px height so the row
reads as a row rather than as adjacent controls of three sizes.

**The tools button is no longer an overlay.** It toggles both ways — it used to vanish once
the sidebar opened, so the way back out was a different control somewhere else — and living
in the row rather than on the stage is also what lets it survive a filter that matched
nothing, which the stage's own controls deliberately do not.

**The select mode lost its sentence.** "A click ticks the entity instead of opening it" is
now the button's `title`; the label and the lit chip already said it, and it cost a whole
band of chrome to say it twice.

**One corner, not three.** Spread, fit and fullscreen are one question — how am I looking at
this — and they are now one cluster bottom-right, in that order: the value, then the
adjustment, then the drastic one.

**The selection bar reads left to right as cause and effect.** What is selected and how far
it reaches on the left; what that will send, and the two actions, grouped on the right.
`sharing N` moved out of the left-hand run, where beside "1 entity selected" it read as a
second count of the same thing.

Result: three bands above the graph instead of five, and one floating cluster instead of
three. Rendered against the compiled stylesheet at 940px and at 300px to check both — the
narrow case is why the action group wraps rather than holding one line.

**Not touched:** the panel's two-line hint paragraph, which is shown on all three tabs and is
not the map's to remove.
