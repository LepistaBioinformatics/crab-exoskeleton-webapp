# long-turn-resilience — Context

What was already known before this feature, and where it came from. None of it is
re-derived below; it is recorded so nobody has to re-derive it either.

## The turn is not cancelled when the client goes away

`crab-shell-proxy/internal/httpapi/sse.go:109-117` runs the turn on
`context.WithTimeout(context.Background(), turnTimeout)` — deliberately NOT on
`r.Context()` — with `turnTimeout = 10 * time.Minute` (`sse.go:19`). The client
context is consulted only to decide whether to keep *writing*: every sink
(`Content`, `Progress`, `Error`, `Attachment`) early-returns on
`clientCtx.Err() != nil` while the turn keeps draining.

The comment there names the bug that made it this way: tying the turn to the
request cancelled the picoclaw WebSocket mid-turn on disconnect and picoclaw
persisted a truncated transcript ("initial messages disappear after reload").

**Consequence for us:** a cut connection loses the *view* of the turn, never the
turn. This is the entire reason a fallback is possible.

## The reply becomes readable exactly when the turn ends

`history.Read` (`internal/history/history.go:102-120`) prefers
`durable/<sessionKey>.jsonl` whenever it exists and only falls back to picoclaw's
live file. The durable file is written by `SyncDurable`, which `streamTurn` calls
**after** `RunTurn` returns (`sse.go:186-192`), before `done()`.

**Consequence for us:** for any conversation with at least one completed turn, the
transcript the history endpoint serves is frozen for the whole duration of a turn
and then grows by the whole turn at once. That is what makes "the transcript got
longer" an exact completion signal rather than a heuristic (spec DEC-1).

For a conversation's *first* turn there is no durable file yet and the live file
is picoclaw's, which it rewrites as it goes — so growth there can mean the user
entry landed rather than the answer. It still resolves to the right end state one
poll later; it is not worth special-casing.

## The stream ends cleanly — it does not throw

From `.specs/project/STATE.md`, "Debugging resolved this session":

> **"Can't reach the gateway right now." on tool use** — front-side, not infra.
> BFF instrumentation showed the upstream SSE ends cleanly (`upstream ended
> cleanly: N chunks`); the proxy/gateway are fine (gatewayTimeout=60s, awc
> timeout is headers-only). Correlated with the agent thrashing on failing tools
> (`python3 not found`, `path escapes workspace`, `exec` missing `action`).
> Stopped reproducing after a rebuild; root cause on the front never fully
> captured.

Two things follow, and they shaped FR-1:

1. **The clean-EOF path is the observed one.** In today's code that path sets no
   error at all: `consumeStream` breaks its read loop, `runTurn`'s `finally` sets
   `arrivalDone`, `finishIfDrained` ends the turn, the painter reloads a
   transcript that has nothing new in it yet, and `clearCompleted` drops the
   bands. The member's message is left with no reply and no explanation. The
   `error: "connectivity"` banner is the *other*, rarer path (a reader
   exception).
2. **The cause is not established.** So the trigger is written against the
   locally observable invariant — no terminal marker while a turn was in flight —
   and not against any theory about which hop closed the socket. Spec OQ-1.

## The 60s number, and why it is not the answer

`gatewayTimeout = 60` appears in `deploy/dokploy/config.base.toml:136`,
`deploy/prod/config.base.toml:147` and `deploy/standalone/config.standalone.toml:96`.
The proxy is written to stay under it: it flushes the `200` and an initial role
chunk before `EnsureRunning` so a cold start cannot trip it (`sse.go:21-28`), and
its own container health-wait is "kept comfortably under mycelium's [api]
gatewayTimeout (60s)" (`crab-shell-proxy/config.yaml:38`).

The history of this number is worth reading before proposing to change it:
`crab-shell-proxy/.specs/features/multi-harness-support/implementation-notes.md`
§9 records turn latency sitting *near* 60s as the unsolved problem that killed
the Hermes profile — "worse than a clean failure", because a fraction of real
turns time out at the gateway while the container is still working. The
mitigations listed there (keep-alive/typing frames; raising the timeout; mapping
the harness's own progress events) are all proxy- or gateway-side. This feature
is the client-side half, and it is the half that holds regardless of which hop is
at fault.

## Where the pieces already are

- `app/chat/turn-store.ts` — module-scope per-conversation state, the send/retry
  ladder, the sequential queue, the reveal driver, and `consumeStream`. It already
  imports `historyQuery`, so it can build the history URL itself without new
  plumbing.
- `app/chat/chat-view.tsx:597-604` — `setPainter`: the completion hook that
  reloads the transcript and then calls `clearCompleted`. FR-7 finishes through
  this, unchanged.
- `app/chat/turn-progress.tsx` — the pre-reply band, with `SILENCE_GRACE_MS`
  already driving a "still working" fallback. Group B is almost entirely here.
- `app/globals.css:279-341` — `blink`, `originPulse`, `fadeIn`, `composerPulse`,
  and the reduced-motion guard that neutralizes them.
