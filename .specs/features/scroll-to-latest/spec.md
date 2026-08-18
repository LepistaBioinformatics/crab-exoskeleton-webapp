# scroll-to-latest — Spec

**Status:** Implemented 2026-08-18. Not verified in a browser — see Verification.
**Scope:** `crab-exoskeleton-webapp` only, one component plus copy.

## Problem

Scrolling up in a conversation is a one-way trip. There is no control that returns to the
newest message, so the way back is dragging the scrollbar and guessing when to stop. Every
scroll this view performs is automatic — a sent message pinned to the top, a tree anchor, the
landing jump on first load — and none of them is reachable on purpose.

## Requirements

- **FR-1** A control returns the view to the newest message in the conversation.
- **FR-2** It is absent while the end of the conversation is already on screen. It is an
  escape hatch, not permanent chrome.
- **FR-3** It lands on the last thing actually *said*, not the last row. `landingIndex`
  already encodes this: trailing `step` rows are the agent narrating its work, and stopping on
  one would leave the answer above the fold.
- **FR-4** It aligns the target to the **top** of the viewport (`block: "start"`), like every
  other scroll in this view. Aligning to the bottom puts the message under the floating
  composer — the defect the pinning comments in `chat-view.tsx` already record.
- **FR-5** It never collides with the composer, whose textarea grows as the member types.
- **FR-6** Both locales.

## Decisions

### DEC-1 — Visibility comes from a sentinel, not from scroll arithmetic

The obvious implementation is `scrollHeight - (scrollTop + clientHeight) > threshold`. It is
wrong here: the scroll area carries `pb-[80vh]`, so `scrollHeight` is most of a viewport taller
than the messages and a member reading the newest message is nowhere near the scroll bottom.
Distance-from-bottom would answer a different question than the one being asked, and no
threshold fixes that — the pad is a viewport fraction, so the error scales with the window.

An `IntersectionObserver` on a zero-height sentinel placed after the last row asks the question
directly: *is the end of the conversation visible?* `rootMargin: "0px 0px -140px 0px"` pulls the
bottom edge up past the floating composer, which the sentinel otherwise hides behind and would
report as visible.

The sentinel must sit **inside the content column**, above the pad. Below it, the control would
only disappear once the member scrolled past the messages into empty space.

### DEC-2 — The handler bypasses `scrollToIndex`

`scrollToIndex` is state with no reset, and its effect fires on change. Routing the button
through it gives a button that works exactly once: the second click sets an unchanged value and
nothing happens. The handler calls `scrollIntoView` itself and stays idempotent.

An empty conversation is safe for free — `landingIndex([])` is `-1`, and
`messageRefs.current[-1]?.scrollIntoView()` is a no-op.

### DEC-3 — The control lives in the composer's column

Not at a fixed offset from the bottom. The composer's textarea grows with what is typed, so any
constant offset collides with it at some length. Rendered as the composer's previous sibling
inside the same centred, max-width column, it is pushed up by the composer's own height instead.

The floating wrapper is `pointer-events-none` with the interactive parts opting back in, so the
strip above the composer does not swallow clicks meant for the messages behind it.

## Reuse

`IconButton` (already `rounded-full`, with the project's hover/focus treatment) in the
`outlined` variant, plus the floating-chrome idiom this codebase uses elsewhere for controls
suspended over content — `bg-surface/95 shadow-e backdrop-blur`. `landingIndex` and
`messageRefs` are existing machinery; nothing new was added to the scroll model.

## Verification

`yarn test` (1272 pass), `npx tsc --noEmit` (5 errors, all pre-existing in other files; HEAD
has 8), `yarn build` clean.

`landingIndex` — the only part with real logic — is covered by `message-rows.test.ts`, empty
conversation included. The wiring is covered structurally by `scroll-to-latest.test.ts`, which
reads `chat-view.tsx` the way `mobile-keyboard-viewport.test.ts` reads `chat-shell.tsx`: this
suite renders no `ChatView` anywhere, and that component pulls in the composer, the markdown
pipeline, the uploads sidebar and the secrets drawer.

**What that does not cover, stated plainly: nothing here proves the button appears at the right
moment in a real browser.** Confirming that needs the running stack, which is currently
unreachable — the webapp container cannot reach the gateway (diagnosed separately this session).
Two things to look at when it is up: whether `-140px` clears the composer at its tallest, and
whether the button reads as chrome or as an interruption while a reply streams in.
