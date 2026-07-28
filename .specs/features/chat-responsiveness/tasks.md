# chat-responsiveness — Tasks

**Spec:** `./spec.md` · **Design:** `./design.md`. Requirement and decision IDs
are those files'.

## Gates

| Repo | Command | Baseline (2026-07-28, before any task) |
|---|---|---|
| webapp | `npx tsc --noEmit && yarn test` | clean; 20 files, 196 tests pass |
| proxy (local) | `go vet ./... && go test ./internal/pico/ ./internal/httpapi/ ./internal/turn/ ./internal/hermes/` | clean |
| proxy (full) | `docker compose --env-file deploy/standalone/.env build crab-shell-proxy` | passes |

**Do not use `yarn build` locally** — `.next/` holds root-owned files from a
prior in-container build and it fails with `EACCES` (STATE.md L-ENV).
`npx tsc --noEmit` is the type gate.

**`go test ./...` has two pre-existing failures** in `internal/docker`
(`TestContinuousDoesNotArmIdle`, `TestReconcileEnsuresContinuousWorkspaces`),
both `chown … operation not permitted` — they need root and pass inside the
Docker build. Not caused by this feature; do not try to fix them here.

---

## Phase A — store foundation (webapp)

Nothing user-visible ships in this phase. It exists because FR-2, FR-3 and FR-4
are the same problem (design: "The shape of the problem"), and building them
separately produces three registries that must be kept mutually consistent.

### T01 — `turn-store.ts` skeleton
- **What:** module-scope `Map<sid, TurnState>`, immutable snapshots, subscribe /
  notify, `useTurn(sid)` on `useSyncExternalStore`.
- **Where:** new `app/chat/turn-store.ts`.
- **Depends on:** —
- **Reuses:** the module-scope pattern already documented at `chat-view.tsx:109-112`.
- **Done when:** the store compiles, has no consumers, and its unit tests pass.
- **Tests:** vitest, no React — set/get/subscribe, snapshot identity changes only
  on mutation.
- **Gate:** webapp.

### T02 — migrate `pendingOutbox` into the store
- **What:** `pendingOutbox` becomes `TurnState.pending`. `ChatView` reads it via
  `useTurn` instead of the local `pending` state + module map.
- **Where:** `app/chat/chat-view.tsx` (lines 112, 145, 264, 399-437).
- **Depends on:** T01
- **Done when:** behaviour is **identical** — debounce, burst merge, park-on-switch
  (`chat-view.tsx:431`), restore-on-return (`:264`). This is a pure refactor.
- **Tests:** port the existing behaviour into store-level tests (there are none
  today); enqueue → debounce → flush, and "parked stack does not self-fire".
- **Gate:** webapp.

---

## Phase B — FR-4, in-flight survives navigation

### T03 — turn status moves into the store
- **What:** `sending` / `retrying` become `TurnState.status` + `retryAttempt`.
  Delete the unconditional `setSending(false)` at `chat-view.tsx:245` — that line
  *is* the bug.
- **Where:** `app/chat/chat-view.tsx`, `app/chat/turn-store.ts`.
- **Depends on:** T02
- **Done when:** switching conversation and returning shows the turn still
  running (FR-4.2); the indicator cannot outlive its turn (FR-4.5).
- **Tests:** store-level status transitions; a turn on sid A stays `sending`
  while the active sid is B.
- **Gate:** webapp.

### T04 — completed-while-away reload
- **What:** the turn-completion path calls `reloadHistory` for its own sid
  whether or not a component is mounted (FR-4.4). Today it is gated on the live
  `detached` closure (`chat-view.tsx:553`), which dies on remount.
- **Where:** `app/chat/turn-store.ts`, `app/chat/chat-view.tsx`.
- **Depends on:** T03
- **Done when:** leaving mid-turn, switching **workspace** (which remounts —
  `chat-shell.tsx:155`), and returning shows the finished reply (FR-4.3).
- **Tests:** unit-testable up to the fetch boundary; the remount path itself is
  T18 UAT.
- **Gate:** webapp.

---

## Phase C — FR-3, non-blocking queue

### T05 — unblock enqueue, add the drain
- **What:** delete `|| sending` at `chat-view.tsx:400` (FR-3.1). Add
  `TurnState.queue`; the debounce pushes a composed burst onto it; the drain runs
  one turn at a time and advances on completion (FR-3.2, D6).
- **Where:** `app/chat/turn-store.ts`, `app/chat/chat-view.tsx`.
- **Depends on:** T03
- **Done when:** N messages sent during a running turn produce N sequential
  turns in order; the debounce still merges a burst (FR-3.3, DEC-2).
- **Tests:** ordering under interleaved enqueue/complete; burst-merge preserved;
  queue survives a sid switch and does not self-fire (FR-3.5).
- **Gate:** webapp.

### T06 — three distinct visual states
- **What:** `pending` (in the debounce window), `queued` (past the debounce, not
  yet sent), `sending` (FR-3.4). `pending` keeps today's `origin-pulse`
  (`chat-view.tsx:881`); `queued` needs its own quieter treatment.
- **Where:** `app/chat/chat-view.tsx`, `app/globals.css`.
- **Depends on:** T05
- **Reuses:** `origin-pulse` and the reduced-motion guard at `globals.css:121`.
- **Done when:** a user can tell what has left and what has not.
- **Tests:** none meaningful in vitest — visual, covered by T18.
- **Gate:** webapp.

### T07 — queue failure semantics
- **What:** a terminal 4xx fails its own turn and leaves the rest of the queue
  intact and visible (FR-3.6). A **timeout** is terminal for its turn and
  non-terminal for the queue — it advances (D6.1). The retry ladder
  (`MAX_SEND_ATTEMPTS`, backoff) moves with `postTurn`, unchanged (FR-3.7).
- **Where:** `app/chat/turn-store.ts`.
- **Depends on:** T05
- **Done when:** neither failure mode silently drops queued messages nor strands
  them behind a bad turn.
- **Tests:** store-level, both failure modes, asserting the queue's remaining
  contents.
- **Gate:** webapp.

---

## Phase D — FR-2, typewriter

**The load-bearing phase.** picoclaw sends the whole answer in one frame
(measurement in `spec.md` OQ-1), so this is the *only* thing that makes a reply
render progressively. It is also fully independent of the proxy — if Phase E
never ships, this still delivers the biggest felt change.

### T08 — reveal driver in the store
- **What:** `revealed` / `buffered` + a single interval per active sid. Derived
  pace per D5: `wordsPerTick = clamp(ceil(words / (TARGET_MS/TICK_MS)), MIN, MAX)`
  with `TICK_MS=40`, `TARGET_MS=8000`, `MIN=1`, `MAX=24`. Word split on
  `/(\s+)/` keeping separators (FR-2.2). Reduced-motion drains in one tick
  (FR-2.7).
- **Where:** `app/chat/turn-store.ts`.
- **Depends on:** T03
- **Done when:** a 20-word reply reveals in ~0.8s and a 2,900-word reply in ~8s
  — **not** the 14.5 minutes a naive constant pace would produce.
- **Tests:** vitest fake timers — pace for short/long/huge inputs, buffer drains
  fully (FR-2.4), reduced-motion instant path.
- **Gate:** webapp.

### T09 — render from `revealed`
- **What:** the streaming assistant band renders `revealed`, not raw content.
  History-loaded messages bypass the store and render instantly (FR-2.3).
  Returning mid-reveal continues from the cursor, never replays (FR-2.5).
- **Where:** `app/chat/chat-view.tsx` (the `streaming` branch at `:804`, `:855`),
  `app/chat/message-content.tsx`.
- **Depends on:** T08
- **Done when:** the reply visibly composes; reopening a past conversation does
  not re-animate; **and the sid-change effect at `chat-view.tsx:240-264` touches
  nothing the store owns.** That block currently resets six pieces of state
  unconditionally. T03 exempts `sending`; `revealed`/`buffered` must be exempt
  too, or T08's driver is built correctly and then silently clobbered here —
  which is exactly how FR-2.5 fails.
- **Note:** partial markdown will transiently mis-render at fence boundaries
  (design D5). Accepted — flag in UAT, do not pre-optimize.
- **Gate:** webapp.

---

## Phase E — FR-1 proxy (parallel with B–D; different repo)

`[P]` with Phase B–D: no shared files. The contract is additive, so an
un-updated webapp ignores it.

### T10 — decode `tool_calls` [P]
- **What:** add typed `ToolCalls []ToolCall` to `Payload` (D3.0). Decode
  `function.name` and `extra_content.tool_feedback_explanation`. Do **not**
  decode `function.arguments` (FR-1.2d — unbounded untrusted model output).
- **Where:** `crab-shell-proxy/internal/pico/turn.go` (the `Payload` type at :37).
- **Depends on:** —
- **Done when:** a real tool frame round-trips to `{name, explanation}`.
- **Tests:** table test unmarshalling the exact frame captured in
  `crab-shell-proxy/.specs/features/chat-progress-events/spec.md`.
- **Gate:** proxy (local + full).

### T11 — `turn.Sink` contract [P]
- **What:** `RunTurn(ctx, req, onDelta func(string))` →
  `RunTurn(ctx, req, sink turn.Sink)` with `Content` / `Progress` fields (D2).
  Update **all three** implementations: `pico`, `hermes`, and `fakeTurner`
  (`internal/httpapi/handlers_test.go:329`).
- **Where:** `internal/turn/`, `internal/pico/turn.go`, `internal/hermes/turn.go`,
  `internal/httpapi/`.
- **Depends on:** —
- **Done when:** it compiles everywhere; hermes populates `Content` only, and
  that omission is a comment, not an accident.
- **Note:** the compile break is deliberate — it is what stops hermes from
  silently keeping old behaviour.
- **Constraint that protects T12's gate:** `newProcessor` (`turn.go:54`) takes
  the sink as a struct whose **zero value reproduces today's `nil` behaviour**.
  `turn_test.go` calls `newProcessor(nil)`; that must become `turn.Sink{}` — one
  mechanical, mechanical-only substitution, and nothing else in the file. Decide
  and record it here, in T11. If T11 reshapes `newProcessor` more freely, T12's
  "test passes unmodified" gate quietly degrades to "passes after I edited it,"
  which is not a regression gate at all.
- **Gate:** proxy (local + full).

### T12 — emit progress in `processor.handle`
- **What:** emit before the existing skip at `turn.go:72`, and on
  `typing.start`/`typing.stop`. `progressKindFor`: `tool_calls`→`tool`,
  `thought`→`thought`, else `placeholder`. Dedup identical consecutive
  `(kind, text)` (D3.1).
- **Where:** `internal/pico/turn.go`.
- **Depends on:** T10, T11
- **Done when:** **`internal/pico/turn_test.go` passes completely unmodified.**
  That is the FR-1.5/FR-1.6 gate — every `return` value and every mutation of
  `plain`/`lastPlainID`/`hasPlainContent`/`isTyping` is untouched, so the
  completion state machine cannot observe the change.
- **Tests:** new table test per frame kind → expected `Progress`, asserting no
  completion-state mutation. Dedup test.
- **Gate:** proxy (local + full).

### T13 — `x_crab_progress` on the wire
- **What:** emit a progress chunk: normal `chat.completion.chunk` envelope,
  empty `delta`, extra top-level `x_crab_progress: {kind, text, tool, state}`
  (D1).
- **Where:** `internal/httpapi/sse.go` (`writeChunk` at :42).
- **Depends on:** T12
- **Done when:** a generic OpenAI client sees only empty deltas and is unaffected
  (FR-1.7).
- **Tests:** assert the serialized frame shape.
- **Gate:** proxy (local + full).

---

## Phase F — FR-1 webapp

### T14 — parse progress chunks
- **What:** `consumeStream` reads `x_crab_progress` and routes it to the store's
  `progress` + `lastEventAt`, separately from content deltas.
- **Where:** `app/chat/chat-view.tsx:935-966`, `app/chat/turn-store.ts`.
- **Depends on:** T08, T13
- **Done when:** a progress chunk yields no content delta (backward-compat gate
  for D1) and updates `progress`.
- **Tests:** feed a synthetic SSE body containing both chunk kinds.
- **Gate:** webapp.

### T15 — render the progress band
- **What:** progress occupies the assistant band **only before the first
  revealed word**, and the first word retires it (FR-1.8a). Soft
  opacity/translate transition on entry and on text change, keyed on the text so
  React replays it — never a hard swap. `tool` and `thought` are visually
  distinct (FR-1.4); `typing` drives the caret, not a text line.
- **Where:** `app/chat/chat-view.tsx` (replacing the bare caret at `:855-857`),
  `app/globals.css`.
- **Depends on:** T09, T14
- **Reuses:** the reduced-motion guard at `globals.css:121`.
- **Done when:** the wait shows the agent's own narration
  (`tool_feedback_explanation`) instead of a blinking caret.
- **Gate:** webapp.

### T16 — liveness under silence (FR-1.10)
- **What:** after `SILENCE_GRACE_MS` with no event and no content, add an
  elapsed indicator to the band. It asserts only that the turn is still open —
  which the client knows, since the stream has not closed.
- **Where:** `app/chat/chat-view.tsx`, `app/chat/turn-store.ts`.
- **Depends on:** T15
- **Why this is not optional:** the measured tool-free turn emitted **nothing**
  for 51 seconds. Without T16 that window still looks hung — the exact symptom
  this feature exists to remove.
- **Tests:** fake timers on the grace threshold.
- **Gate:** webapp.

---

## Phase G — verification

### T17 — gateway pass-through — **RESOLVED 2026-07-28, no work required**

Answered at the source rather than by spot-check. Mycelium's router ends with:

```rust
// ports/api/src/router/mod.rs:257
Ok(gateway_response.streaming(downstream_response))
```

The downstream response is handed to actix as an **opaque byte stream**. The
gateway inspects only `status()` and `headers()` (`mod.rs:241-242` — the header
blocklist fixed in `08fcff88`); it never parses SSE frames and never
deserializes the JSON body. An added top-level field therefore cannot be
stripped, reordered, or re-serialized — `x_crab_progress` is safe **by
construction**, not by luck.

This was the one finding that could have invalidated Phase E's contract, so it
was checked before any code. Keep one runtime confirmation in T18 as a
belt-and-braces check, but nothing gates on it.

### T18 — operator UAT
Not unit-testable; needs the live stack and a real magic-link session.

1. Send a long-answer message → the reply composes progressively (FR-2), does
   not take minutes (T08 pace).
2. Send a tool-using message → the agent's own narration appears before the
   first token, softly (FR-1.8a). If `tool_feedback_explanation` is absent —
   only one sample from one tool (`web_fetch`) was ever captured, and it is
   model-generated — the `function.name` fallback renders instead. **That is a
   pass, not a failure** (FR-1.2b).
3. Send during a running turn → accepted, queued, fires sequentially (FR-3).
4. Switch conversation mid-turn and return → indicator intact (FR-4.2).
5. Switch **workspace** mid-turn and return → indicator intact (FR-4.3). This is
   the remount path; it is the highest-risk item in the feature.
6. Reload the page mid-turn → indicator gone, reply still lands in the
   transcript. Expected (FR-4.6), not a bug.
7. `prefers-reduced-motion: reduce` → content appears without the reveal
   (FR-2.7).

---

## Parallelism

```
T01 → T02 → T03 → T04
              ├──→ T05 → T06
              │      └──→ T07
              └──→ T08 → T09
[P] T10 ┐
[P] T11 ┴→ T12 → T13 ────────┐
                              ├→ T14 → T15 → T16 → T18
                        T09 ──┘

T17 is closed (resolved at the source, before any code) and gates nothing.
```

Phase E is the only cross-repo work and shares no files with A–D. Everything in
A–D ships without it.
