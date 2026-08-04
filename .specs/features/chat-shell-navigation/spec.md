# chat-shell-navigation — Specification

> **Written after the fact.** The work shipped iteratively from live feedback rather
> than from a spec, so this records what was built, which decisions were deliberate,
> and which failures are now asserted by tests. It is not a plan; treating it as one
> would misread the history.

## Summary

The chat shell's navigation surfaces: what a member sees before choosing a workspace,
what the left sidebar does when collapsed, and how the header names where they are.
Webapp-only.

## Functional requirements

- **SN-1** With no workspace selected, the content pane IS the picker: one row per
  tenant, a box per subscription, agents as square tiles carrying their permissions as
  icons (eye = read, pencil = write). Clicking one opens a fresh conversation.
  The previous welcome copy is kept for the genuinely-empty case — nothing to pick is a
  different situation from not having picked.
- **SN-2** The collapsed sidebar shows a rail: one icon per panel with the active one
  filled, plus a single open control. The icons **choose a panel** and do not open the
  pane; the circled arrow opens it.
- **SN-3** Hovering a collapsed rail previews the panel as an **overlay** over the chat,
  sliding in on a transform. It never widens the column — reflowing the conversation on
  a mouse-over is jarring for something this transient.
- **SN-4** Exactly one open/close control exists at a time. While collapsed the pane's
  own header control is **omitted** (the shell passes no `onCollapse`), and the rail's
  control is the mirror of it: a circled arrow pointing right to open, left to close.
- **SN-5** The chat header leads with the **subscription** and puts the agent under it in
  lighter type, matching the conversations sidebar. With no subscription name, the agent
  takes the line alone rather than being demoted under a uuid.
- **SN-6** The chat/canvas toggle is desktop-only. The shell already refuses
  `view=canvas` on mobile, so on a phone it offered a destination that would be ignored.
- **SN-7** Scrollbars are styled app-wide in the app's own palette, via **both** the
  standard `scrollbar-color`/`scrollbar-width` property and the WebKit pseudo-elements,
  because neither is universal and where both apply the pseudo-elements win.

## Non-functional requirements

- **NFR-1** State that two components must agree on is owned by the shell, not copied:
  `collapsed`, `peeking`, `browsing` and the composer's reference slot all live in
  `chat-shell`, and the panel is derived through `sidebar-panel-state.resolvePanel`.
  The rail has to advertise the same panel the sidebar would open, and the reference slot
  has to outlive the view it was picked from.
- **NFR-2** Every icon-only control carries both `aria-label` and `title`. The first
  serves a screen reader, the second a mouse.
- **NFR-3** No rendered control may be a no-op. A panel with nothing behind it is left
  out of the list rather than rendered disabled — a disabled button swallows the click
  entirely, so it cannot even open the pane.

## What went wrong, and what now guards it

Four defects shipped here and every one was found by the user in the running app, not by
a gate. They are recorded because the pattern matters more than the fixes:

1. **Two display utilities fighting.** The peek carried `md:hidden` and `md:block` at
   once; Tailwind emits `.md\:hidden` after `.md\:block` at equal specificity, so the
   preview never rendered. Diagnosed from the emitted CSS offsets, not by guessing.
   → `resizable-pane.test.ts` asserts the peeking state contains no hiding utility.
2. **The overlay covered the control that opens the pane**, so hovering the rail made it
   unclickable. → asserted: the overlay starts at `left-12`, past the rail.
3. **A collapse button that could only be a no-op.** While previewing, the pane is
   already collapsed, so its header control called collapse on that state. Two open/close
   controls were visible and the one under the cursor was the dead one. → SN-4 removes the
   situation rather than handling it.
4. **The composer lost focus on every mount.** The textarea is keyed on the resolved
   locale (for the spell-check dictionary) and the mount effect resolves it a tick later,
   replacing the node the focus effect had already focused. Opening a chat is exactly that
   mount. → `locale` added to the focus effect's deps.

**The gap this exposes, stated plainly:** the suite renders static markup under
`environment: "node"` — no events, no effects. It catches conflicting classes, which is
how (1) got a test. It cannot catch "a visible button that does nothing", which is what
(2), (3) and the earlier disabled-rail-icon all were. Closing that needs an interaction
suite (testing-library with jsdom, or Playwright); none exists.

## Out of scope

| Thing | Why |
|---|---|
| Exit animation for the peek | Visibility is discrete; animating a departure nobody is looking at buys nothing. |
| Delay before the peek opens | Crossing the rail toward the window edge flashes the sidebar. Accepted; a timer is the fix if it annoys in practice. |
| Persisting which panel is open | The sidebar deliberately derives it from the URL — a stored panel outlives the fragment that justified it. |
