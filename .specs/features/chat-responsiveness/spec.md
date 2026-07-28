# chat-responsiveness — Specification

**Status:** IMPLEMENTED 2026-07-28, awaiting operator UAT (`./tasks.md` T18).
Gates green in both repos: webapp `tsc` clean + 214 vitest tests; proxy full
suite green in the Docker build. OQ-1 closed empirically; OQ-2 resolved in
Design; T17 closed at the source (no work needed).
**Scope:** Large (2 repos, 4 independent sub-features, one new wire contract)
**Authoritative spec:** this file. The proxy side carries a thin pointer at
`crab-shell-proxy/.specs/features/chat-progress-events/spec.md` and reuses the
requirement IDs below — do not renumber them there.

---

## Problem

Four distinct complaints, all about how the chat *feels* while it works, none
about correctness:

1. **The answer "just sprouts."** A turn is silent for its whole duration and
   then the full reply appears. Nothing tells the user the agent is alive, let
   alone what it is doing.
2. **The composer locks during a turn.** `enqueue` (`app/chat/chat-view.tsx:400`)
   returns `false` while `sending` is true, so a user who thinks of a second
   message has to wait for the first reply.
3. **Switching conversations erases the "sent" indicator.** The turn keeps
   running server-side and the reply does land minutes later, but on returning
   to the conversation the UI shows no trace of a send in flight — it reads as
   "nothing was ever sent."
4. **Even when content arrives, it lands as a block.** No sense of the agent
   composing an answer.

### Why (1) happens — the finding that shapes this feature

picoclaw already emits progress signals over the Pico Protocol. The proxy
**deliberately discards every one of them** at
`crab-shell-proxy/internal/pico/turn.go:72`:

```go
if pl.Kind == "thought" || pl.Kind == "tool_calls" || pl.Placeholder {
    return signal{}
}
```

`typing.start` / `typing.stop` are consumed by the completion state machine and
never surface either. Evidence that these frames carry human-readable text:
`internal/pico/turn_test.go:60,73` exercises them with `"calling tool"` and
`"thinking..."`, and the shipped picoclaw binary
(`docker.io/sipeed/picoclaw:latest`) contains the literals `Thinking...`,
`Processing...`, `channels.placeholderEntry` and
`pkg/utils/visible_tool_calls.go`.

So the intermediate feedback is **real and already produced** — it is thrown
away one layer below the UI. No mocking is required (DEC-1).

### What is NOT the cause

The backend already survives client disconnect: `streamTurn` runs the turn on a
background context, explicitly detached from the request
(`crab-shell-proxy/internal/httpapi/sse.go:63-70`). Complaint (3) is purely a
client-side state-modelling gap — `sending` is component-local `useState` and is
reset unconditionally on every conversation switch (`chat-view.tsx:245`).

---

## Decisions (from the discuss round)

| ID | Decision | Rejected alternative and why |
|---|---|---|
| **DEC-1** | Intermediate text comes from **real picoclaw frames**, forwarded by the proxy. | Frontend-only mocked filler: it is theatre — it cannot say *what* the agent is doing and it keeps reassuring the user when a turn has actually hung. |
| **DEC-2** | **Burst merges, bursts queue.** The existing 3s debounce keeps its meaning *within* a typing burst — messages sent within the window still merge into one turn (today's `\n\n` join). *Across* bursts, each burst becomes its own turn, fired sequentially. | (a) Every send its own turn with no debounce: a user reformulating in three quick messages would trigger three turns and three replies. (b) Merging everything queued during a turn into one next turn: distinct questions asked minutes apart would reach the agent as a single blob. |
| **DEC-3** | In-flight state survives **conversation switch and workspace switch**, in module scope. Not page reload. | Reload survival needs a durable proxy-side "turn in flight" endpoint + polling; deferred (see Out of scope). |
| **DEC-4** | The typewriter reveals at a **constant readable pace, always**, whatever the arrival shape. | Pacing only large blocks: rhythm would vary turn to turn, and the same reply would feel different depending on network timing. |

---

## Requirements

### FR-1 — Progress events during the wait

- **FR-1.1** The proxy forwards picoclaw's `placeholder` frames as progress
  events instead of dropping them.
- **FR-1.2** The proxy forwards `kind: "tool_calls"` frames as progress events.
  **Amended after measurement (OQ-1 / OQ-1b).** `content` is always `""` on
  these frames, but that is not the whole payload — the proxy's `Payload` type
  decodes only 5 fields (`turn.go:37-43`) and was hiding the rest. The raw frame:

  ```json
  {"type":"message.create","session_id":"…","payload":{
    "content":"", "kind":"tool_calls", "message_id":"…",
    "model_name":"deepseek-chat",
    "tool_calls":[{"id":"call_…","type":"function",
      "function":{"name":"web_fetch",
                  "arguments":"{\"maxChars\":15000,\"url\":\"https://github.com/…\"}"},
      "extra_content":{"tool_feedback_explanation":
        "Com certeza! Deixe-me buscar novamente as informações do projeto."}}]}}
  ```

  **`extra_content.tool_feedback_explanation` is the feature.** It is a
  first-person, natural-language narration written by the agent itself, in the
  user's own language, describing what it is about to do — precisely the
  intermediate text this feature set out to invent. It does not need to be
  authored, translated, or mocked; it only needs to stop being discarded.

  So FR-1.2 requires:
  - **FR-1.2a** `Payload` gains a typed `tool_calls` field.
  - **FR-1.2b** Progress text is `extra_content.tool_feedback_explanation` when
    present; otherwise a phrase derived from `function.name`.
  - **FR-1.2c** The event also carries `function.name` so the UI can render a
    per-tool affordance (icon/label) independent of the prose.
  - **FR-1.2d** `function.arguments` is **not** forwarded. It is unbounded,
    untrusted model output that may contain paths, URLs, or secrets, and it has
    no display role once the explanation exists.
- **FR-1.3** The proxy forwards `typing.start` / `typing.stop` as progress
  events, so the UI can show an "agent is working" state between messages.
- **FR-1.4** `kind: "thought"` frames are forwarded as progress events but are
  **visually distinguished** from tool activity — they are the agent's internal
  reasoning, not an action taken.
- **FR-1.5** Progress events never contribute to the assistant message content.
  The turn's final text is unchanged from today, byte for byte.
- **FR-1.6** Progress events never affect turn-completion timing. The grace-timer
  state machine (`maybeArmGrace`) keeps its current semantics exactly — only
  plain, non-placeholder content arms the finalize timer.
- **FR-1.7** The wire format stays consumable by a generic OpenAI-compatible
  client that knows nothing about progress events. (This endpoint is an
  OpenAI-shaped API behind mycelium, not a private channel — see OQ-2.)
- **FR-1.8** The webapp renders the latest progress event in the assistant's
  pending band, replacing the current bare spinner. Successive events replace
  one another; they are not accumulated into a transcript.
- **FR-1.8a** **Progress occupies the pre-token window, and yields.** Progress
  text appears with a soft transition *before the first content token* and is
  the only thing in the band until then. The arrival of the first token retires
  it — progress and answer never compete for the same space. Event-to-event
  changes are also transitioned, never a hard swap: the band must not flicker
  or jump as events replace one another.
- **FR-1.9** Progress text is never persisted. It is absent from the durable
  transcript and from a reloaded conversation.
- **FR-1.10** **Liveness under silence.** Real signals only fire when picoclaw
  has something to say. A long tool-free LLM call emits nothing, and the last
  progress event would freeze on screen — reproducing the exact "looks hung"
  symptom this feature exists to remove. After N seconds with no event and no
  content, the UI shows an honest liveness affordance (elapsed time, or a
  "still working" state). This is not mocked content: it asserts only that the
  turn is still open, which the client knows to be true.

### FR-2 — Typewriter rendering

- **FR-2.1** Assistant content is revealed progressively at a constant pace,
  regardless of whether it arrived as one block or as incremental deltas
  (DEC-4).
- **FR-2.2** Reveal granularity is **word-level**, not character-level (the ask
  was "palavras aparecendo sequencialmente").
- **FR-2.3** Already-persisted messages — history load, conversation reopen —
  render instantly. The effect applies only to a reply arriving in the current
  session.
- **FR-2.4** The buffer drains to completion even if arrival finishes first; the
  turn is not considered visually done until the buffer is empty.
- **FR-2.5** Leaving and returning to the conversation mid-reveal must not
  replay the effect from the start, and must not lose already-revealed text.
  **This constrains where the buffer lives.** The reveal buffer *and* its cursor
  position must sit in module scope keyed by session id, alongside FR-4.1's
  in-flight registry — component state is not enough, because `ChatView`
  remounts on workspace switch (FR-4.3). FR-2.5 and FR-4.3 are otherwise
  mutually unsatisfiable.
- **FR-2.6** The pace is a single named constant, tunable in one place.
- **FR-2.7** The effect degrades safely under `prefers-reduced-motion`:
  content appears without the incremental reveal.

### FR-3 — Non-blocking send with a sequential turn queue

- **FR-3.1** `enqueue` accepts messages while a turn is in flight. The composer
  never blocks on `sending`.
- **FR-3.2** Each typing burst becomes one turn. Bursts fire as separate turns,
  strictly one at a time per conversation, in submission order (DEC-2).
- **FR-3.3** The existing 3s debounce keeps its current meaning *within* a
  burst: messages sent within the window still merge into one turn via the
  current `\n\n` join. What changes is only that the debounce may now re-arm
  while a previous turn is still running — today it cannot, because `enqueue`
  refuses outright (FR-3.1).
- **FR-3.4** A queued-but-not-yet-sent message renders distinctly from one whose
  turn is running. The user can tell what has left and what has not.
- **FR-3.5** The queue is per conversation. A queue parked by switching away
  does not fire on its own (preserving today's `flushPending` rule at
  `chat-view.tsx:431`); it resumes when the user returns and re-engages.
- **FR-3.6** A terminal failure (4xx) on one turn does not silently discard the
  rest of the queue — the user is told what did not send.
- **FR-3.7** The retry ladder (`MAX_SEND_ATTEMPTS`, exponential backoff) applies
  per queued turn, unchanged.

### FR-4 — In-flight state survives navigation

- **FR-4.1** "A turn is running for conversation X" is tracked in module scope,
  keyed by session id — the same pattern as the existing `pendingOutbox`
  (`chat-view.tsx:112`).
- **FR-4.2** Returning to a conversation with a running turn restores the
  in-flight indicator and the latest progress event.
- **FR-4.3** The state survives a **workspace** switch too. `ChatView` remounts
  on workspace change (`app/chat/chat-shell.tsx:155` keys it on
  `workspace.t|s|r`), so component state is not sufficient.
- **FR-4.4** On returning to a conversation whose turn completed while away, the
  finished reply is shown — via the existing history reload path
  (`chat-view.tsx:553`), extended to cover the "completed while detached and
  unmounted" case.
- **FR-4.5** The indicator clears on turn completion, failure, or abandonment,
  and cannot outlive the turn it describes.
- **FR-4.6** Page reload is explicitly **not** covered (DEC-3). After F5 the
  indicator is gone; the reply still lands in the transcript, as today.

### NFR

- **NFR-1** No new dependency in either repo.
- **NFR-2** The proxy change must not alter the durable transcript
  (`history.SyncDurable`) in any way.
- **NFR-3** FR-1 through FR-4 are independently shippable and independently
  revertible. Nothing here requires a big-bang cutover.
- **NFR-4** The webapp keeps `tsc` and `next build` clean; the proxy keeps
  `go vet` and the full test suite green.

---

## Open questions (resolve during Design)

- **OQ-1 — ANSWERED (2026-07-28, measured): no. One terminal frame.**
  A temporary trace in `processor.handle` over two real turns:

  ```
  01:43:55  typing.start
            …51 seconds of complete silence…
  01:44:46  typing.stop
  01:44:46  message.create  kind=""  len=17594   ← the entire answer, at once
  ```

  There are **no `message.update` frames**. picoclaw delivers the whole reply in
  a single `message.create`. Consequences, all of which the design must absorb:

  1. **Token streaming does not exist today and cannot come from this source.**
     `onDelta`'s suffix logic (`turn.go:79-82`) is dead code in practice — it
     fires exactly once, with the full 17KB.
  2. **FR-2 is no longer cosmetic.** The typewriter is the *only* mechanism that
     can make a reply render progressively. It moves from polish to load-bearing.
  3. **FR-1.10 is the primary mechanism, not a safety net.** In the traced
     tool-free turn the only frames in 51 seconds were `typing.start` at t=0 and
     `typing.stop` at t=51. FR-1.1/1.2/1.4 produced *nothing*. Honest liveness
     carries that entire window.
  4. **A second, tool-using turn behaved differently:** 14 `tool_calls` frames
     over ~30s, roughly one every 2 seconds — a genuine activity pulse. But every
     one arrived with **`content=""`** (see FR-1.2, amended). No `placeholder` or
     `thought` frame was observed in either turn.

  The instrumentation has been reverted; `internal/pico/turn.go` is unmodified.
  The `delta_start` literal found in the picoclaw binary, which originally
  suggested incremental delivery, does not apply to the pico channel.

- **OQ-2 — RESOLVED in Design (D1): an extra top-level field on an otherwise-
  empty `chat.completion.chunk`.** A named SSE event (`event: progress`) was
  rejected — the current parser tests `startsWith("data:")` on the whole frame
  (`chat-view.tsx:953`) and would discard it wholesale, and third-party SDK
  behaviour on named events varies. The chosen form is ignored rather than
  dropped by every existing client, so FR-1.7 costs nothing.

- **OQ-3 — Queue depth.** Is there a cap on how many turns a user can stack, and
  what happens at the cap? Unbounded is the literal reading of "quantas quiser."

---

## Out of scope

- Page-reload / cross-device survival of the in-flight indicator (DEC-3). Would
  require the proxy to expose per-session turn state; the background-turn
  machinery it needs already exists (`sse.go:63-70`), so this is a clean future
  increment.
- Cancelling / interrupting a running turn. Adjacent and frequently wanted, but
  not asked for, and it needs a proxy-side abort path that does not exist.
- Editing or reordering a queued message.
- Any change to picoclaw itself.

---

## Traceability

| Req | Repo | Primary surface |
|---|---|---|
| FR-1.1–1.7 | crab-shell-proxy | `internal/pico/turn.go`, `internal/httpapi/sse.go`, `internal/turn` |
| FR-1.8–1.9 | webapp | `app/chat/chat-view.tsx` |
| FR-2 | webapp | `app/chat/chat-view.tsx`, `app/chat/message-content.tsx` |
| FR-3 | webapp | `app/chat/chat-view.tsx`, `app/chat/composer.tsx` |
| FR-4 | webapp | `app/chat/chat-view.tsx`, `app/chat/chat-shell.tsx` |
