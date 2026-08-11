# long-turn-resilience — Tasks

Read `spec.md` and `context.md` first; `design.md` for Group A. Gate for every
task: `yarn test` green, `yarn build` clean.

Planned as two commits, one per group, on the grounds that they share an intent
and nothing else. **Shipped as one.** Group A's recovery line needs Group B's
shimmer class and its elapsed hook, and both halves of `turn-progress.tsx` are
the same twenty lines — splitting them would have meant two commits that each
leave the file half-written, which is worse for a bisect than one commit that
does not.

---

## Group A — recovering a cut turn

### T-01 — surface the terminal marker
- **What:** `consumeStream` returns `{ completed: boolean }`. True on
  `data: [DONE]` or on a chunk with `choices[0].finish_reason === "stop"`; false
  when the body just ends.
- **Where:** `app/chat/turn-store.ts`.
- **Why both markers:** they are one flush in the proxy's `done()`, which is what
  closes the race in DEC-2.
- **Tests:** design.md 1-3.
- **Covers:** FR-1.

### T-02 — state for a recovery
- **What:** `recovering` and `recoveringSince` on `TurnState`, in `EMPTY`, cleared
  where a turn resets.
- **Where:** `app/chat/turn-store.ts`.
- **Covers:** FR-4.

### T-03 — the recovery loop
- **What:** `recover(sid, ctx)` — read a baseline transcript length, then poll
  `/api/chat/${r}/history?${historyQuery(...)}` every `RECOVERY_POLL_MS` until it
  grows or `RECOVERY_BUDGET_MS` runs out. Growth returns; exhaustion sets
  `error: "turn_lost"`. A failed poll is one lost sample, and a baseline is only
  taken from a *successful* read.
- **Where:** `app/chat/turn-store.ts`.
- **Depends on:** T-01, T-02.
- **Reuses:** `historyQuery`, `sleep`, the `RunContext` the turn already carries.
- **Tests:** design.md 5, 6, 9.
- **Covers:** FR-6, FR-8, FR-9, FR-10.

### T-04 — wire it into the turn, before the finally
- **What:** after `consumeStream`, `if (!completed && !error) await recover(...)`.
  The `catch` no longer sets `error: "connectivity"` for a mid-stream failure — it
  routes to the same recovery.
- **Where:** `app/chat/turn-store.ts`, `runTurn`.
- **Depends on:** T-03.
- **Done when:** `running` stays true and `arrivalDone` false for the whole
  recovery, so `finishIfDrained` cannot end the turn early and the painter cannot
  blank the conversation (`chat-view.tsx:585-592`).
- **Tests:** design.md 4, 7, 8.
- **Covers:** FR-2, FR-3, FR-4, FR-7.

### T-05 — say it in the band
- **What:** the recovery line in the in-flight assistant band — replacing
  `TurnProgress` when there is no content yet, beneath the partial reply when
  there is, and the caret dropped while it shows.
- **Where:** `app/chat/chat-view.tsx`.
- **Copy:** `view.recovering`, `view.recoveringFor` in `lib/i18n/chat.ts`;
  `turn_lost` in `lib/i18n/errors.ts`. Both locales.
- **Depends on:** T-02.
- **Covers:** FR-5, FR-9, FR-14.

---

## Group B — a working turn that looks like one

### T-06 — motion that does not wait for events
- **What:** a shimmer sweep on the progress text plus a soft pulse on the band, so
  a minute of silence still reads as work. New keyframes beside the existing ones;
  the reduced-motion guard at `globals.css:382` neutralizes them with no extra
  code.
- **Where:** `app/globals.css`, `app/chat/turn-progress.tsx`.
- **Covers:** FR-11, FR-13.

### T-07 — elapsed time
- **What:** once `SILENCE_GRACE_MS` has passed, the band shows how long the turn
  has been running, advancing every second. A formatter shared with the recovery
  line (T-05).
- **Where:** `app/chat/turn-progress.tsx`, `lib/i18n/chat.ts` (both locales).
- **Tests:** design.md — `turn-progress.test.tsx`: nothing before the grace
  window, a readout after it.
- **Covers:** FR-12, FR-14.

---

---

## Status

All seven tasks done. `yarn test` 843 passing in 60 files (was 826 in 59);
`yarn build` clean.

### What the tests caught

**`__reset` did not clear `draining`.** The first run of the recovery tests failed
seven-for-seven with the turn never starting at all. A conversation that started a
turn in an *earlier* test stays in the `draining` set forever — its turn is
suspended on a timer that goes away with the fake clock, so the `finally` that
would remove it never runs — and `drain` for that sid then returns immediately.
Pre-existing, latent because no test had driven a whole turn before this one.
Fixed in the test seam, with the reason recorded there.

**A window event was masking every assertion.** `notifyConversationsUpdated`
dispatches on `window`, the suite runs `environment: "node"`, and the throw landed
in `runTurn`'s catch — so three tests read `error: "connectivity"` instead of what
they were testing. That catch is now genuinely last-resort (a mid-stream failure
is a recovery, not an error), which is exactly why an unrelated throw reaching it
was so confusing. Stubbed in the test.

### Deviation from design.md

The pulse half is tested more thinly than design.md implied. `environment: "node"`
means effects never fire, so no test can observe the readout appearing after the
grace window or the shimmer sweeping. What is covered: `formatElapsed` (pure), and
the markup carrying the animated class and holding the readout back on a
just-started turn. The rest is in the runtime check below. This is the same
boundary `empty-states.test.tsx` documents for itself.

## Verification beyond the suite

The recovery path cannot be provoked from a unit test in the shape it actually
occurs. What the suite proves is the state machine; what it cannot prove is that a
real cut produces `completed: false` rather than a throw *before* the body exists.
Runtime check, on a turn long enough to be cut: the band must move from progress
to the recovery line and then to the reply, with no error and no blank
conversation. Record the outcome here.
