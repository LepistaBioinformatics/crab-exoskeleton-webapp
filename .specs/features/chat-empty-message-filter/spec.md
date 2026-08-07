# chat-empty-message-filter

Blank transcript messages render as full-height empty bands, opening large gaps
between real messages. Drop them where the transcript enters the app.

Scope: Medium (one BFF line + two dead guards). No design.md / tasks.md.

## Mechanism (inferred from code — NOT confirmed against a real transcript)

The `data/` volume is root-owned and could not be read, so no transcript showing
the reported gaps was ever sampled. What follows proves that a whitespace-only
turn *would* produce the symptom; it does not prove that whitespace-only turns
are what the user is actually seeing. See "Confirmation still owed".

1. `crab-shell-proxy/internal/history/history.go:341` already intends to drop
   blank turns, but the predicate is `e.Content != ""`. A turn whose content is
   `"\n"`, `" "` or `"\n\n"` is not equal to `""`, so it passes and is served.
2. `app/api/chat/[instance]/history/route.ts:59` forwards `data.messages`
   verbatim.
3. `chat-view.tsx:715` renders **one band per message**. The band carries the
   vertical padding (`bandPad` — `py-6`, or `py-10` when standalone) and only the
   *content* inside it is conditional (`{text && <MessageContent …>}`, line 752).
   A blank message therefore renders 3–5rem of nothing.
4. The blank message also participates in the neighbour lookup at lines 717–723,
   so `changed` / `standalone` are computed against a message that is invisible —
   the surrounding real messages get the wrong padding too. Fixing only the
   invisible band would leave this half of the symptom in place.

## Requirements

- **R1** — A transcript message whose content is empty or whitespace-only is not
  rendered, and does not contribute vertical space.
- **R2** — Blank messages are removed *before* they reach `messages` state, not at
  render time, so neighbour spacing (`changed` / `standalone`), `messageRefs`
  indexing and the `msg` scroll anchor (`chat-view.tsx:348`, `findIndex` over the
  same array the refs are keyed by) all stay consistent. A render-time filter over
  a derived array would desynchronise refs from state and silently break
  scroll-to-message.
- **R3** — An attachment-only message still renders. `[anexo: uploads/…]` refs make
  `content.trim()` non-empty, so the predicate keeps them; `parseAnexos` yields
  `text === ""` but `refs.length > 0`, and the chip row at line 753 is what shows.

## Decision

**DEC-1 — filter at the BFF route, not in the client.**
`app/api/chat/[instance]/history/route.ts` is the single choke point: both
`chat-view.tsx` fetches (lines 273 and 364) and `history-cache.ts:31` — which
feeds canvas-timeline, conversation-bursts and the conversation content filter —
go through it. Filtering there fixes every consumer once instead of repeating the
predicate in three client paths, and it is a system boundary (upstream proxy →
app), which is where input filtering belongs.

**DEC-2 — the upstream predicate is the root cause and is fixed too.**
`history.go:341` becomes `strings.TrimSpace(e.Content) != ""`. This is what stops
blank turns at the source (it also keeps them out of any future consumer of the
proxy's history API). It needs a proxy rebuild/redeploy to take effect, so the
BFF filter is kept rather than replaced — the webapp is correct regardless of
which proxy build is running.

## RESOLVED — and the answer is that this was NOT the cause

Measured against the real transcripts (read through `docker exec` into the
running picoclaw containers, which is how the earlier evidence gap was finally
closed), across 1,239 entries in the durable transcripts the history API actually
serves:

- **zero** entries with whitespace-only content;
- **zero** of the 416 served messages would render blank — after stripping anexo
  refs and HTML-ish tags, every one still has visible text.

So the mechanism described above is real but does not occur in this deployment.
The reported gaps have another cause: see
`features/thinking-vs-answer-messages`, where 200 of the 304 served assistant
messages turn out to be tool-call narration, each getting its own padded band.

The code stays. It is correct at the boundary and costs nothing. But it fixes a
case that was never happening, and it must not be credited with fixing the gaps.

## Out of scope for now — the renders-to-nothing case

`react-markdown` v9 runs here without `rehype-raw`, so HTML nodes are dropped
silently: an assistant turn that is entirely `<thinking>…</thinking>` passes
`trim() !== ""` and still renders an empty band. Unevidenced, so not addressed.

If the check above comes back with gaps still present, this is fixable at the
same seam without redesign — the predicate at the BFF gets stronger (test for
non-tag, non-whitespace text rather than any non-whitespace text) and DEC-1 / R2
are unchanged, because it is still a filter applied before `messages` state.

## Behaviour change to expect

A conversation whose transcript is *entirely* blank messages now takes the
`messages.length === 0` empty-state branch (`chat-view.tsx:655`) instead of
rendering a column of blank bands.

## Verification

- `m.content.trim() !== ""` at `chat-view.tsx:744` and `:770` become unreachable
  and are removed — no redundant second check.
- `app/api/` has no existing route test harness; a new one is not invented for a
  one-line filter. Covered by the proxy's Go test for DEC-2 plus the existing
  webapp suite (`npm test`) and a manual check.
