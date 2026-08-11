# long-turn-resilience — Spec

A long turn currently ends in one of two lies. If the stream is cut before the
reply arrives, the chat either shows a transport error or silently drops the
turn's bands and reloads a transcript that has nothing new — and in both cases a
manual page reload later shows the reply sitting there, complete. And while the
agent works, the band can sit unchanged for a minute at a time, which reads as a
frozen chat rather than a working one.

Both are the same complaint from the member's side: **the interface stops
representing work that is still happening.** One spec, two requirement groups.

## Context

Read `context.md` first. It records what is already known about the cut — in
particular that the observed end-of-stream is a *clean EOF*, not an exception,
and that the proxy deliberately detaches the turn from the request. Those two
facts are the whole basis for FR-1..FR-9 and were established empirically
before this feature, not assumed by it.

## Goals

- A cut stream during a running turn is treated as an expected event: the chat
  keeps saying the agent is working, recovers the reply on its own, and shows it
  without the member touching anything.
- A working turn always looks like a working turn, even when nothing arrives for
  a minute.

## Non-goals

- **Never re-POST the turn.** The existing `MAX_SEND_ATTEMPTS` ladder covers the
  initial POST only, before the stream opens. Once the stream is open the turn is
  committed server-side, and re-sending would run a ten-minute turn twice.
- Not raising mycelium's `gatewayTimeout`, and not adding keep-alive frames to
  the proxy. Both are real alternatives and both live in other repos — see
  "Alternatives not taken".
- Not making a failed turn survive a page reload. That limitation is
  `turn-failure-visible`'s, and it is unchanged here.
- No cancel/abandon control for a recovery in progress. See DEC-4.

## Requirements

### Group A — recovering a cut turn

**FR-1 — The trigger is a missing terminal marker, not an error class.**
A turn enters recovery when its stream ends without the proxy's terminal signal
(`data: [DONE]` or a chunk carrying `finish_reason: "stop"`) and without an
`x_crab_error` frame. It does not matter whether the underlying end was a clean
EOF, a reader exception, or a 502 mid-body: those are all the same event to the
member, and only one of them is reliably observable.

**FR-2 — A cut stream is never reported as a transport error.**
While the stream was open, the turn is running server-side (the proxy accepted it
onto a background context before the first byte). So the current
`error: "connectivity"` on a mid-stream throw is wrong and is replaced by
recovery.

**FR-3 — `x_crab_error` still wins.**
A turn the harness itself reported as failed is a failure, not a candidate for
recovery, even if the stream is also cut afterwards. `turn-failure-visible`'s
banner behaviour is unchanged.

**FR-4 — The turn stays running during recovery.**
`running` remains true, the user message and any partially revealed reply stay on
screen, and a queued turn does not start. Nothing is cleared.

**FR-5 — Recovery is announced, not hidden.**
The assistant band says the connection dropped and the agent is still working. It
is not disguised as ordinary progress: the member is waiting on a different thing
now (a poll, not a stream) and the honest line is also the reassuring one.

**FR-6 — Recovery polls the durable transcript for growth.**
The store polls the conversation's history endpoint and considers the turn landed
when the transcript is longer than the baseline it read when recovery began. See
DEC-1 for why growth, and not content matching, is the probe.

**FR-7 — A landed reply finishes the turn through the existing path.**
Probe succeeds → `running` clears → the completion painter reloads the transcript
→ the bands are dropped. The reply appears complete, without the typewriter. No
new rendering path.

**FR-8 — The wait outlasts the proxy.**
The budget is at least the proxy's own turn bound (`turnTimeout`, 10 min in
`crab-shell-proxy/internal/httpapi/sse.go`) plus margin. A shorter budget would
give up on turns the proxy is legitimately still running.

**FR-9 — Exhausting the budget is a real failure, with its own copy.**
The member is told the reply never arrived and that reloading is worth trying —
distinct from "can't reach the gateway" and from "the agent couldn't complete
this message", because the action differs.

**FR-9a — That banner survives a turn queued during the wait.**
Every other error code is cleared when a turn starts, on the rule that a send
retires the previous banner (`turn-failure-visible` DEC/T-03). That rule assumes
the send came *after* the failure was visible. A turn queued during a recovery was
sent up to eleven minutes before the failure existed, so the ordinary rule would
wipe the banner in the tick it appeared — and for a turn that produced nothing at
all, that banner is its only account. A send made *after* it appears still retires
it.

**FR-10 — Recovery survives navigation.**
It runs in the module-scope turn store, like the turn itself, so switching
conversation or workspace mid-recovery does not abandon it.

### Group B — a working turn that looks like one

**FR-11 — The pre-reply band animates continuously.**
The progress line carries motion that does not depend on new events arriving, so
a minute of upstream silence still reads as activity.

**FR-12 — Elapsed time is shown once the turn is no longer brief.**
After the existing silence grace window, the band shows how long the turn has
been running. A number that visibly advances is the strongest available signal
that the chat is not stuck.

**FR-13 — Reduced motion is respected.**
Every animation added here is neutralized under `prefers-reduced-motion`, via the
guard `globals.css` already applies. The elapsed counter is not motion and stays.

**FR-14 — Both locales, no exceptions.**
Every string added lands in `en` and `pt-BR` in `lib/i18n/chat.ts` (and
`lib/i18n/errors.ts` for FR-9). There is a parity test.

## Decisions

**DEC-1 — Probe by transcript growth, not by matching the message we sent.**
The tempting probe is "an assistant answer after the user message equal to what
we posted". Rejected: it assumes the composed string survives webapp → BFF →
proxy `userContent` → picoclaw → jsonl verbatim, and if it ever does not, the
probe silently never fires and a succeeded turn is reported as lost after eleven
minutes. Growth needs no string to survive anything, and it is exact for the
common case: `history.Read` prefers the durable transcript, and the durable
transcript is frozen for the whole turn (the proxy folds the live file into it
*after* `RunTurn` returns, `sse.go:189`).

**DEC-2 — The baseline is read when recovery starts, not held by the view.**
Which leaves one race: a stream cut *after* the fold would see a baseline that
already contains the reply, and growth would never come. FR-1 closes it —
`finish_reason: "stop"` and `[DONE]` are written by the same `done()` call, one
flush, so losing the marker while the fold has already happened would require
losing part of a single write. The alternative (the view handing its
`messages.length` to the store) couples the recovery to a mounted component for
no remaining benefit.

**DEC-3 — Recovered replies do not re-run the typewriter.**
The reveal driver exists to make a single-frame reply *arrive* progressively. A
reply the member waited ten minutes for, then watched be recovered, should land
at once. This is also what FR-7 gets for free by finishing through the painter.

**DEC-4 — No cancel control for a recovery.**
Considered because a recovery can hold the working state for eleven minutes. Not
added, because it holds nothing the member needs: the composer is deliberately
not gated on `running` (see `turn-store.ts`, `enqueue`), so a new message can be
sent during a recovery and simply queues behind it. A cancel button would only
offer to stop *watching* a turn that keeps running regardless — the same
misleading affordance `turn-failure-visible` removed for the error banner.

## Alternatives not taken

- **Keep-alive frames from the proxy** so no timeout ever trips. The natural
  vehicle exists (`turn.Progress` with `Kind: "typing"`), and this is recorded as
  the first thing to try in `crab-shell-proxy/.specs/features/multi-harness-support/implementation-notes.md`
  §9. It belongs in the proxy repo, and it does not remove the need for this
  feature: a cut can still come from anywhere between the browser and the proxy.
- **Raising mycelium's `gatewayTimeout`** (60s, `deploy/*/config.base.toml`).
  Rejected there and rejected here for the same reason: it is global, so it
  degrades failure detection for every other service to accommodate this one.
- **Recovering in the BFF route** instead of the client — keeping the browser's
  stream open while the Next route polls picoclaw. It would make the whole thing
  invisible to the client, but it moves an eleven-minute wait into a serverless-
  shaped route handler and hides from the member that anything happened. FR-5
  says the opposite.

## Open questions

**OQ-1 — What actually cuts the stream is still not known.** The prior
investigation (see `context.md`) cleared mycelium and the proxy and never
captured the front-side cause. This feature is deliberately built to not need the
answer, but the answer is still worth having, and the recovery path is where it
will now be observable — a recovery that fires is a cut that happened.
