# long-turn-resilience — Design

Scoped to Group A (recovering a cut turn). Group B is presentation inside one
component plus two keyframes; a design doc for it would be ceremony.

## The invariant everything rests on

**Once the stream is open, the turn is committed server-side.** The proxy accepts
it onto a background context and bounds it at ten minutes, independent of the
request (`context.md`). So from the moment the client holds a readable body,
there is no end-of-stream that means "the turn did not happen" — only ends that
mean "the turn finished and said so" and ends that mean "we stopped being told".

That collapses three cases the current code treats separately (clean EOF, reader
exception, mid-body 502) into one: **recover**.

## Telling the two ends apart

`consumeStream` already distinguishes them structurally and throws the
distinction away: it `return`s on `data: [DONE]` and `break`s on reader EOF, and
both look identical to the caller.

It gains a return value:

```ts
export async function consumeStream(...): Promise<{ completed: boolean }>
```

`completed` is true when either terminal signal was seen:

- `data: [DONE]`, or
- a chunk with `choices[0].finish_reason === "stop"`.

Both are written by the proxy's `done()` — one function, one flush
(`sse.go:100-104`). Accepting either is what closes the race in spec DEC-2:
losing the marker *after* the durable fold has happened would require losing part
of a single write, not merely a late close.

A reader exception is not a return value: it propagates, and the caller treats a
throw as `completed: false`. That keeps the "any end without a marker" rule in
one place instead of two.

## State

Two additions to `TurnState`:

```ts
/** The stream was cut mid-turn; polling the transcript for the reply. */
recovering: boolean;
/** When the recovery wait began, for the elapsed readout. */
recoveringSince: number;
```

`error`/`errorDetail` are untouched by a recovery that succeeds. A recovery that
exhausts its budget sets `error: "turn_lost"` and leaves `errorDetail` null — the
harness never spoke, so there is no harness sentence to show.

## Where it runs

Inside `runTurn`'s `try`, immediately after `consumeStream` returns and *before*
the `finally`:

```
const { completed } = await consumeStream(...)   // throw → catch → same branch
if (!completed && !getTurn(sid).error) await recover(sid, ctx)
```

Placement is the load-bearing part. `runTurn`'s `finally` sets `arrivalDone` and
calls `finishIfDrained`, which is what ends a turn — so the recovery must be
awaited before it. Two consequences fall out for free:

- `running` stays true and `arrivalDone` stays false for the whole recovery, so
  `finishIfDrained` early-returns even if the reveal driver drains partial content
  mid-recovery (`turn-store.ts`, `finishIfDrained` guards on `arrivalDone`). The
  bands stay on screen; nothing blanks.
- The sequential queue waits: `drain` is parked in `awaitDrained`, which resolves
  only from `releaseDrainWaiters` inside `finishIfDrained`.

And the ordering trap is avoided by construction. `clearCompleted` early-returns
while `running` is true, and the painter runs `reloadHistory → clearCompleted`.
Letting a turn "finish" mid-recovery and then reloading is exactly the blanked-
conversation defect documented at `chat-view.tsx:585-592`. The sequence is fixed:
probe succeeds → recovery returns → `finally` → `running: false` → painter →
`clearCompleted`.

The `catch` branch changes accordingly: it no longer sets `error: "connectivity"`
for a mid-stream failure. It only records a genuine failure for the paths that are
*not* a cut stream — a throw before the body existed cannot reach here (the retry
ladder above owns those), so in practice the catch becomes the recovery entry for
reader exceptions.

## The recovery loop

```
recover(sid, ctx):
  baseline = length of the transcript, read once, now
  if baseline is unreadable: keep going with baseline = null  (see below)
  mark recovering
  every RECOVERY_POLL_MS, until RECOVERY_BUDGET_MS has elapsed:
     n = length of the transcript
     if baseline === null: baseline = n; continue
     if n > baseline: clear recovering; return          → FR-7
  clear recovering; set error "turn_lost"               → FR-9
```

Reading the transcript is the same request `chat-view.reloadHistory` makes:
`/api/chat/${workspace.r}/history?${historyQuery(workspace, sid, project)}`.
`historyQuery` is already imported in `turn-store.ts`; `workspace` and `project`
come from the `RunContext` the turn is already carrying. No new plumbing, and no
dependency on a mounted component (FR-10).

A failed poll (offline, a 502, a 401) is not fatal and does not consume the
budget differently — it is one lost sample. Deferring the baseline to the first
*successful* read is what the `baseline === null` branch is for: without it, a
recovery that starts while the network is briefly down would take `0` as its
baseline and declare success on the first reachable poll.

Tunables, named beside the existing ones:

```ts
// Poll cadence while recovering. 5s over an 11-minute ceiling is ~130 reads of a
// file the proxy already has open; the member is watching a band, not a spinner
// that needs to feel live.
const RECOVERY_POLL_MS = 5000;

// Must outlast the proxy's own bound on a detached turn — turnTimeout, 10 min in
// crab-shell-proxy/internal/httpapi/sse.go. Giving up first would report a turn
// as lost while the proxy is still legitimately running it. The margin covers the
// durable fold and the poll cadence.
const RECOVERY_BUDGET_MS = 11 * 60 * 1000;
```

The comment names `sse.go`'s constant deliberately: this codebase already ties
its numbers to the ones they must not drift from (the proxy's health-wait names
mycelium's 60s the same way).

## Rendering

`chat-view.tsx`, the assistant band of the in-flight turn. Today the band is an
either/or: `revealed === ""` → `TurnProgress`, else content + caret. Recovery has
to be visible in **both** arms, because a turn can be cut after partial content
has arrived.

So the recovery notice is its own line, rendered after whichever arm ran:

- with no content yet, it replaces `TurnProgress` (there is no progress to show —
  the source of progress is gone);
- with partial content, it sits beneath it, and the blinking caret is dropped for
  it. A caret says "more is coming down this wire"; nothing is.

Copy (`lib/i18n/chat.ts`, both locales):

- `view.recovering` — the connection dropped, the agent is still working, the
  reply is being fetched.
- `view.recoveringFor` — the same with an elapsed readout, once the wait is no
  longer brief. It reuses Group B's formatter.

Copy (`lib/i18n/errors.ts`, both locales): `turn_lost` — the reply never arrived;
reloading the conversation is worth trying. Distinct from `connectivity` ("can't
reach the gateway") and from `harness_error` ("the agent couldn't complete this
message") because the action differs, which is the rule `turn-failure-visible`
established for this file.

## Tests

`app/chat/turn-store.test.ts` — the store is already tested there with a fake
`fetch` and fake timers.

1. `consumeStream` reports `completed: true` on `[DONE]`.
2. …and on a `finish_reason: "stop"` chunk with no `[DONE]` after it.
3. …and `completed: false` on a body that just ends.
4. A cut stream with no marker enters `recovering` and does **not** set `error`.
5. A transcript that grows finishes the turn: `running` false, painter called,
   `error` null.
6. A transcript that never grows sets `error: "turn_lost"` after the budget.
7. `x_crab_error` on a cut stream keeps the failure and does not recover (FR-3).
8. `running` stays true and the bands survive for the whole recovery (FR-4).
9. A failed first poll does not become the baseline (the deferred-baseline
   branch).

`app/chat/turn-progress.test.tsx` (new) — Group B: the elapsed readout appears
only after the grace window, and the recovery line renders its own copy.
