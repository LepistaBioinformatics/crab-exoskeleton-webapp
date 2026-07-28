# chat-responsiveness — Design

**Spec:** `./spec.md`. Requirement IDs below are that file's.
**Status:** Designed — not implemented.

---

## What the measurement changed (read this first)

OQ-1 was resolved empirically before this design was finalized (see `spec.md`).
Two findings reshape the priorities the spec was written under:

1. **picoclaw sends the whole answer in one frame** — 17,594 characters in a
   single `message.create`, after 51 seconds of silence, with no
   `message.update` in between. There is no token stream to pass through.
   `onDelta`'s suffix arithmetic (`turn.go:79-82`) fires exactly once per turn.
   → **D5 (typewriter) is load-bearing, not polish.** It is the only mechanism
   that can make a reply appear progressively. Build order reflects this.
   → **D7's liveness affordance covers the dominant case**, not an edge case: in
   a tool-free turn, `typing.start` and `typing.stop` are the *only* frames, and
   `typing.stop` arrives in the same millisecond as the answer.

2. **`tool_calls` frames carry agent-authored narration the proxy discards.**
   `extra_content.tool_feedback_explanation` is a first-person sentence in the
   user's own language ("Com certeza! Deixe-me buscar novamente as informações
   do projeto."). This is the intermediate text the feature set out to invent —
   it already exists, one type definition away. → D3.0.

---

## The shape of the problem

Three of the four sub-features (FR-2 typewriter, FR-3 queue, FR-4 in-flight
survival) are the *same* problem wearing different hats: state that belongs to a
**conversation** is currently held by a **component**. `ChatView` remounts on
workspace change (`app/chat/chat-shell.tsx:155` keys it on `workspace.t|s|r`),
and even without a remount, switching `sid` resets `sending`
(`chat-view.tsx:245`).

The codebase already contains the correct pattern, applied to exactly one piece
of state — `pendingOutbox`, a module-scope `Map<sid, string[]>`
(`chat-view.tsx:112`) with a comment explaining why it lives there. The design
generalizes that one map into a small per-conversation store and moves the rest
of the turn state into it.

**This is the central decision: one store, not three fixes.** Building FR-2,
FR-3 and FR-4 independently would produce three parallel `Map<sid, …>` registries
that must be kept mutually consistent (a reveal buffer with no matching in-flight
entry, a queue that fires while the store thinks it is idle). One store makes
those states unrepresentable.

---

## D1 — Wire contract for progress events (resolves OQ-2)

**Chosen: extra top-level field on an otherwise-empty chunk.**

```json
{
  "id": "…", "object": "chat.completion.chunk", "created": 1234, "model": "…",
  "choices": [{"index": 0, "delta": {}, "finish_reason": null}],
  "x_crab_progress": {"kind": "tool", "text": "calling tool", "state": null}
}
```

`kind` ∈ `thought` | `tool` | `placeholder` | `typing`; `state` ∈ `start` |
`stop` and is set only for `kind: "typing"`.

**Why this over a named SSE event (`event: progress`).** Two reasons, both
concrete rather than stylistic:

1. **Existing clients are already forward-compatible.** `consumeStream`
   (`chat-view.tsx:935-966`) reads `parsed?.choices?.[0]?.delta?.content` and
   calls `onDelta` only `if (delta)`. A progress chunk yields `undefined` and is
   skipped. A generic OpenAI SDK does the same — unknown top-level fields are
   ignored, and empty deltas are normal. **FR-1.7 costs nothing.**
2. **A named event would be dropped, not ignored.** The current parser tests
   `if (!line.startsWith("data:")) continue` on the *whole frame*
   (`chat-view.tsx:953`), so an `event: progress\ndata: {…}` frame is discarded
   wholesale — and third-party SDK behaviour on named events varies.

The `x_` prefix marks it as a vendor extension so it never collides with a
future OpenAI field.

**Rejected:** putting progress inside `delta` (e.g. `delta.x_progress`). It
would ride the field SDKs *do* introspect, and any client accumulating
`delta` wholesale would corrupt the message.

---

## D2 — Turn-runner contract (`internal/turn`)

`RunTurn(ctx, req, onDelta func(string)) (string, error)` becomes:

```go
// Progress is a non-content signal emitted while a turn is running. It never
// contributes to the assistant's answer.
type Progress struct {
    Kind  string // "thought" | "tool" | "placeholder" | "typing"
    Text  string // human-readable; empty for typing
    Tool  string // function.name, for Kind == "tool" (FR-1.2c)
    State string // "start" | "stop"; only for Kind == "typing"
}

// Sink receives everything a running turn emits. Both fields may be nil.
type Sink struct {
    Content  func(string)
    Progress func(Progress)
}

RunTurn(ctx context.Context, req Request, sink Sink) (string, error)
```

**Why a struct and not a second callback parameter.** A struct is extensible
without touching the signature again, and its zero value is a valid no-op sink
(both fields nil) — the tests that pass `nil` today become `turn.Sink{}`.

**Why change the signature at all rather than adding an optional setter.** The
spec's proxy-side note flags the risk: `internal/hermes` implements the same
interface. A compile-time break is the point — it forces `hermes.Client.RunTurn`
and `fakeTurner` (`internal/httpapi/handlers_test.go:329`) to be updated
deliberately instead of silently keeping the old behaviour.

**Hermes scope.** Hermes populates `Content` only; `Progress` stays unused
there for now. Hermes already streams SSE from its own API server
(`internal/hermes/turn.go`), so it has no equivalent frames to map. Recorded so
the omission is a decision, not an oversight.

Nil-guard both fields at every call site.

---

## D3 — Frame mapping in `processor.handle`

The single change is to **emit before skipping**, at
`internal/pico/turn.go:72`:

```go
case "message.create", "message.update":
    pl := f.Payload
    if pl.Kind == "thought" || pl.Kind == "tool_calls" || pl.Placeholder {
        p.emitProgress(progressKindFor(pl), pl.Content)
        return signal{}          // ← unchanged
    }
```

and for typing:

```go
case "typing.start":
    p.isTyping = true
    p.emitProgress("typing", "start")
    return signal{cancel: true}  // ← unchanged
```

`progressKindFor` maps `tool_calls`→`tool`, `thought`→`thought`, else
`placeholder` (checked in that order: a placeholder frame may also carry a kind).

**D3.0 — `Payload` must decode more (FR-1.2a).** The measured `tool_calls` frame
carries `content: ""` and puts everything useful in a field the current type
drops on the floor:

```go
type ToolCall struct {
    Function struct {
        Name string `json:"name"`
        // arguments is deliberately NOT decoded — FR-1.2d.
    } `json:"function"`
    ExtraContent struct {
        Explanation string `json:"tool_feedback_explanation"`
    } `json:"extra_content"`
}
// added to Payload:
ToolCalls []ToolCall `json:"tool_calls"`
```

Progress text for a tool frame is the **first** call's `Explanation` when
non-empty, else a phrase derived from `Name` (FR-1.2b). A frame may carry
several calls; the first is the one the agent narrated.

Not decoding `arguments` is a positive choice, not an omission (FR-1.2d): it is
unbounded untrusted model output and it would otherwise flow to the browser.

**FR-1.5 / FR-1.6 are satisfied structurally, not by testing.** Every `return`
value and every mutation of `plain` / `lastPlainID` / `hasPlainContent` /
`isTyping` is untouched. `emitProgress` writes to no processor field. The
completion state machine therefore cannot observe the change, and
`internal/pico/turn_test.go` must pass **unmodified** — that is the regression
gate, not a new test.

**D3.1 — Dedup.** Placeholder/thought content is cumulative, like plain content.
`emitProgress` suppresses an event whose `(kind, text)` equals the last one
emitted, so a placeholder re-sent unchanged does not flood the stream.

---

## D4 — `turn-store.ts`: one store per conversation

New module `app/chat/turn-store.ts`. Not a React context — a plain module-scope
store, subscribed to via `useSyncExternalStore` (React 19). Context would be
scoped to the provider's position in the tree and would die with the remount
that FR-4.3 exists to survive.

```ts
type TurnStatus = "idle" | "queued" | "sending" | "streaming";

interface TurnState {
  status: TurnStatus;
  queue: string[];          // composed turns waiting (FR-3.2)
  pending: string[];        // current debounce burst (today's pendingOutbox)
  progress: Progress | null;// latest event (FR-1.8)
  lastEventAt: number;      // for the FR-1.10 liveness affordance
  revealed: string;         // words already shown (FR-2)
  buffered: string;         // arrived, not yet revealed
}

const turns = new Map<string, TurnState>();   // keyed by session id
```

**What moves in:** `pendingOutbox` (already module scope — absorbed as
`pending`), and `sending` / `retrying` / the streaming assistant text, which are
component state today.

**What stays in the component:** everything not conversation-scoped —
`attachments`, `replyTo`, `openActions`, `filesOpen`, scroll refs. Moving those
in would be scope creep and would break the "pending attachments belong to the
composer you were in" rule at `chat-view.tsx:247-249`.

### Subscription

```ts
export function useTurn(sid: string | undefined): TurnState
```

backed by `useSyncExternalStore(subscribe, () => snapshot(sid))`. Snapshots are
immutable objects replaced on mutation, so the default reference equality is the
correct bail-out — no custom comparator.

### Why this satisfies FR-4 for free

FR-4.1 (module scope, keyed by sid), FR-4.2 (returning re-reads the entry),
FR-4.3 (survives remount — the store is never unmounted), FR-4.5 (one `status`
field, so an indicator cannot outlive its turn) all follow from the structure.
FR-4.4 keeps the existing `reloadHistory` call at `chat-view.tsx:553`, moved to
the store's turn-completion path so it fires whether or not a component is
mounted.

---

## D5 — Typewriter (FR-2)

**The driver lives in the store, not in a component.** A single
`setInterval` per active sid pulls words from `buffered` into `revealed`. If it
lived in the component it would stop on unmount, and a user returning after a
workspace switch would find the reveal frozen — failing FR-2.5.

- **Word-level (FR-2.2):** split on `/(\s+)/` keeping separators, so whitespace
  and newlines are preserved and markdown structure survives partial reveal.
- **Pace: bounded total duration, not a fixed words-per-second (FR-2.1,
  FR-2.6, DEC-4).** A single `REVEAL_WORDS_PER_TICK` constant does not survive
  contact with the measurement. The traced reply was 17,594 characters ≈ 2,900
  words; at a "readable" 200 wpm the typewriter would run for **14.5 minutes**.
  A naive constant pace is unshippable, and hiding it behind a named constant
  hides the bug rather than fixing it.

  Instead the pace is derived, recomputed whenever the buffer grows:

  ```ts
  const REVEAL_TICK_MS   = 40;    // 25 fps
  const REVEAL_TARGET_MS = 8000;  // a reply finishes revealing in ~8s, any length
  const REVEAL_MIN_WPT   = 1;     // short replies still get a per-word rhythm
  const REVEAL_MAX_WPT   = 24;    // hard ceiling; beyond this it reads as a dump

  const ticks = REVEAL_TARGET_MS / REVEAL_TICK_MS;              // 200
  const wordsPerTick = clamp(Math.ceil(words / ticks), REVEAL_MIN_WPT, REVEAL_MAX_WPT);
  ```

  - 20-word reply → 1 word/tick → 0.8s, natural cadence.
  - 2,900-word reply → 15 words/tick → ~8s, fast but visibly composing, and the
    user reads from the top while the tail fills in.
  - Past `REVEAL_MAX_WPT` (≈ 4,800 words) the reveal runs longer than 8s rather
    than degenerating into a dump.

  Because content arrives as **one frame** (see the measurement section), the
  word count is known up front and the pace is computed once per turn. The
  recompute-on-growth path exists only for the hypothetical future where
  picoclaw starts streaming.
- **FR-2.3:** history-loaded messages never enter the store — they render from
  `messages` directly, instantly.
- **FR-2.4:** turn is visually complete only when `buffered === ""` *and*
  arrival finished. Two separate conditions; the store exposes the conjunction.
- **FR-2.7:** on `matchMedia("(prefers-reduced-motion: reduce)")`, the driver
  drains the whole buffer in one tick. The global CSS guard at
  `app/globals.css:121` handles the caret/pulse animations but cannot neutralize
  a JS reveal loop — hence the explicit check.

**Interaction with markdown.** `MessageContent` re-parses on every change. A
mid-word or mid-fence reveal could produce transient broken markdown (an
unclosed ``` renders as plain text for one tick). Word-level granularity keeps
this to fence boundaries rather than every character. Accepted; call it out in
UAT rather than pre-optimizing.

---

## D6 — Queue and turn sequencing (FR-3)

The debounce stays exactly as designed (DEC-2, FR-3.3) — the only change is that
`enqueue` no longer refuses while busy.

```
enqueue(text)             → push to pending[sid]; arm 3s debounce   (FR-3.1)
debounce fires            → pending.join("\n\n") → push to queue[]; clear pending
queue non-empty && idle   → shift one, run it                        (FR-3.2)
turn completes            → status = idle → drains the next          (FR-3.2)
```

- **FR-3.1:** delete the `|| sending` guard at `chat-view.tsx:400`.
- **FR-3.4:** three visually distinct states — `pending` (today's
  `origin-pulse` band), `queued` (in the queue, past the debounce, not yet
  sent), `sending`. The existing pulse covers `pending`; `queued` needs its own
  treatment, quieter than the pulse.
- **FR-3.5:** the "only the actively-viewed conversation flushes" rule at
  `chat-view.tsx:431` is preserved — it becomes a store-level check against the
  active sid rather than a closure check.
- **FR-3.6:** a terminal 4xx sets the error *and* leaves the remaining queue
  intact and visible, rather than draining it silently. The user decides.
- **FR-3.7:** the retry ladder moves with `postTurn` into the store, unchanged.

**Ordering hazard.** `touchConversation` and `syncSessionRefs` are fired per
turn today (`chat-view.tsx:533,561`). With sequential turns they must stay
per-turn and in order; `syncSessionRefs` is already deliberately not gated on
the active sid, which stays correct.

**D6.1 — Timeouts under a sequential queue.** Each turn gets its own
`pico.Client.TurnTimeout` (120s, `config.yaml`) and its own HTTP-side bound
(`turnTimeout = 10 * time.Minute`, `sse.go:19`) — the queue does not share a
budget, because each queued turn is a separate POST. That is the right
behaviour, but it has a consequence the measurement makes concrete: the traced
*simple* turn took 51s, and a tool-using turn ran 14 calls over 30s. Five
stacked messages is plausibly several minutes of wall clock.

FR-3.6 covers a terminal 4xx but says nothing about a turn that times out
mid-queue. Rule: **a timed-out turn is terminal for that turn and non-terminal
for the queue** — it surfaces its own failure against its own message and the
queue advances. Silently draining the rest would lose the user's messages;
halting the queue would strand them behind one bad turn.

---

## D7 — Progress rendering (FR-1.8, FR-1.8a, FR-1.10)

The assistant band currently shows an empty message plus a blinking caret
(`chat-view.tsx:855-857`). That caret *is* the "nothing is happening" symptom.

- **Pre-token only (FR-1.8a):** the progress line occupies the band while
  `revealed === "" && buffered === ""`. The first revealed word retires it.
  Two states, never concurrent.
- **Soft entry:** opacity/translate transition on mount and on text change,
  keyed on the progress text so React remounts the node and replays it. No hard
  swap (FR-1.8a).
- **Typing events** (`kind: "typing"`) carry no text — they drive the caret /
  "working" state, not a text line.
- **Thought vs tool (FR-1.4):** distinct treatment. Reasoning is not an action;
  showing them identically would misrepresent what the agent is doing.
- **FR-1.10 liveness:** the store already stamps `lastEventAt`. After
  `SILENCE_GRACE_MS` with no event and no content, the band adds an elapsed
  indicator. It asserts only that the turn is still open — which the client
  knows to be true, since the stream has not closed.

---

## Build order

Each step is independently shippable and revertible (NFR-3).

1. **`turn-store.ts` + migrate `pendingOutbox` into it, no behaviour change.**
   Pure refactor with the existing behaviour as the test. Everything else builds
   on it.
2. **FR-4** — move `sending`/`retrying` into the store. Smallest user-visible
   win, and it validates the store against the real remount path.
3. **FR-3** — drop the `sending` guard, add the queue drain.
4. **FR-2** — the reveal driver. Independent of the proxy, and the single
   biggest felt change: it is what turns a 17KB blob into a reply that appears
   to be written. Ship it even if FR-1 never lands.
5. **FR-1 proxy** — `Payload.ToolCalls` (D3.0), `turn.Sink`, frame mapping,
   SSE field.
6. **FR-1 webapp** — parse `x_crab_progress`, render the band.

Steps 1–4 are webapp-only and unblock most of the felt improvement. Step 5 is
the only cross-repo coordination point, and its contract (D1) is additive — an
un-updated webapp ignores the new field.

**Note on step ordering vs. impact.** Steps 5–6 are last in dependency order but
carry the richest content (`tool_feedback_explanation`). If the tool-using turns
matter more than the tool-free ones in practice, 5–6 can be pulled forward — they
depend on nothing in 1–4.

---

## Testing

| Area | Approach |
|---|---|
| `processor.handle` | Existing `internal/pico/turn_test.go` passes **unmodified** (FR-1.6 gate). New table test asserts each frame kind produces the right `Progress` and does not touch completion state. |
| D3.1 dedup | Repeated identical placeholder emits once. |
| `turn-store.ts` | Vitest, no React: enqueue→debounce→queue→drain ordering; sequential turns; queue survives sid switch; status transitions. |
| Reveal driver | Vitest with fake timers: constant pace, buffer drain, reduced-motion instant path. |
| `consumeStream` | A `x_crab_progress` chunk yields no content delta (backward-compat gate for D1). |
| FR-4.3 | The remount path is the risk. Needs a real workspace switch mid-turn — operator UAT, not unit-testable. |
| D1 through the gateway | **Verify at `:8080`, not just `:18080`.** The new field rides inside the SSE body and bodies pass the gateway untouched, so it should survive — but the gateway sits between the proxy and the browser, and this stack has already been bitten once by it rewriting the proxy path (the `Content-Type: text/event-stream` allowlist bug fixed in mycelium `08fcff88`). Confirm one `x_crab_progress` chunk arrives intact in the browser through the gateway before building UI on it. |

---

## Open items carried into implementation

- **OQ-1 — closed.** Measured; see the section at the top of this file and the
  trace in `spec.md`. The temporary instrumentation in `internal/pico/turn.go`
  has been reverted — do not look for it.
- **How often is `tool_feedback_explanation` populated?** One sample, one tool
  (`web_fetch`). It is model-generated, so it will sometimes be absent —
  FR-1.2b's `function.name` fallback is required, not optional. Worth widening
  the sample during implementation if the fallback prose turns out to matter.
- **No `placeholder` or `thought` frame was observed** in either traced turn.
  FR-1.1 and FR-1.4 are specified and cheap to implement (the same emit path),
  but may be dead code in this configuration. Implement them; do not build UI
  that depends on them appearing.
- **OQ-3** — queue depth cap. Design assumes unbounded, matching "quantas
  quiser". Revisit if UAT shows accidental stacking.
