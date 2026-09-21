# Show that the agent's context was shortened

The harness now records, once per turn, that it dropped messages from the
context window. The proxy serves that record as `kind: "compaction"`. This is
where it becomes something a member can see.

Harness side: `crab-ganglion-harness/.specs/features/durable-compaction/spec.md`.
Proxy side: `crab-shell-proxy/.specs/features/durable-compaction/spec.md`.

## The bug this had to fix first

**An entry carrying only `events` never reached this app.** The BFF drops blank
turns at `app/api/chat/[instance]/history/route.ts`, and the rule was written
when blank meant "no text and no reasoning":

```ts
(m) => m.content.trim() !== "" || (m.reasoning ?? "").trim() !== ""
```

Since then the harness started writing two entries that are blank *by
construction* and carry their whole meaning in `events`. The filter dropped both
before any consumer saw them. `toRows` has had an `isEventsOnly` branch since it
was written — the entry never got there, so that branch had never run against a
real payload.

The dates say it plainly: the filter was last touched in `8b02276`
(2026-08-07); `isEventsOnly` arrived in `e5a1bfb` (2026-09-13), five weeks
later, in the PR whose whole subject was showing what each step did.

So **the silent tool call has never been visible in a reloaded transcript**, and
a compaction divider would have been invisible the same way. FR-5.1 fixes both.

## FR-5 — The divider

**FR-5.1** The blank-turn filter keeps an entry that carries events.

A turn with no text, no reasoning **and** no events is still dropped — that rule
was right and is unchanged. The `HistoryResponse` interface declares `events` as
part of this: the object is re-serialised whole, so an undeclared field reaches
the client either way, but a filter consulting a field it has not declared is
one rename away from silently dropping everything again.

**FR-5.2** `history-cache.ts` is **not** widened.

It feeds the tree, Canvas and the content filter, which turn every message into
a point in the conversation. Its own comment explains why a contentless step is
dropped there — it would be a blank node — and a compaction divider is the same
kind of thing. The marker belongs in the transcript, not in the map of it.

**FR-5.3** A compaction record is its own `Row` variant, tested before the step
branch in `toRows`.

It arrives in the same shape as a silent tool call; only the proxy's `kind`
separates them. Folded into a run it would read as "3 steps". It carries `m`
like a message row so `rowRole` keeps working off one field.

**FR-5.4** `landingIndex` skips it.

Opening a conversation on *"12 earlier messages were compacted"* lands the
member on a note about the transcript instead of on the transcript — the same
reason it already skips a step.

**FR-5.5** The divider says what left the **agent's context**, and that the
transcript is intact.

This is most of the row's job. A member who sees "earlier messages are gone"
above a conversation they can still scroll through has been told their history
was lost. The copy names the effect, not the mechanism: no member has a reason
to know the word "compaction".

**FR-5.6** A record with no count renders the divider **without** one.

"0 messages" would claim something false about an event that did happen.

**FR-5.7** The harness's own note is revealable, collapsed, via the transcript's
existing `Disclosure` — the `<details>`-based one `StepRun` and `Reasoning` use,
not the admin `clampValue` toggle. Keyboard and screen-reader behaviour come for
free and there is no state to drift from the DOM.

**FR-5.8** Both locales, and the parity test's rule holds: no leaf string is
identical across them.

## Gate

`./node_modules/.bin/vitest run` and `next build`. `yarn lint` does not run in
this repo (no ESLint config) and `tsc` has 7 pre-existing errors, unchanged by
this work — verified by counting them on `main` and on the branch.

`yarn next build` fails on this host with `EACCES` writing the yarn cache; run
`./node_modules/.bin/next build` directly.
