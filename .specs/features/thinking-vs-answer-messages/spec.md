# thinking-vs-answer-messages

Investigation: can the agent's thinking be told apart from its final answer in the
transcript? **Yes — structurally, and in two distinct layers.** Not implemented;
awaiting a decision on the rendering treatment.

## Evidence

All numbers below are measured, not inferred. The `data/` volume is root-owned
and unreadable from the host, but the picoclaw containers are running, so the
transcripts were read with `docker exec` and reduced to aggregates
(scripts were aggregate-only; no conversation text was pulled into the session).

Source: the **durable** transcripts under
`/data/.picoclaw/workspace/sessions/durable` in `crabshell-alpha-…` — the ones
`history.Read` actually prefers. 1,239 entries, 112 user turns.

### Entry shapes picoclaw persists

```
 544  content, created_at, role, tool_call_id                                  (role=tool)
 409  content, created_at, model_name, role, tool_calls
 112  content, created_at, role                                               (role=user)
  80  content, created_at, model_name, role
  69  content, created_at, model_name, reasoning_content, role, tool_calls
  13  content, created_at, model_name, reasoning_content, role
  11  attachments, content, created_at, role
   1  content, created_at, media, role, tool_call_id
```

`history.go`'s `jsonlEntry` reads only `role` / `content` / `created_at`. Every
other field — including the two that carry the answer here — is discarded.

### What the history API serves today

Of 416 served messages (i.e. surviving `Content != ""`), 304 are assistant:

| | count |
|---|---|
| assistant **with** `tool_calls` — tool narration | **200** |
| assistant **without** `tool_calls` — final answer | **104** |
| assistant carrying `reasoning_content` | 30 (78–2,243 chars, median 472) |

So roughly **two thirds of what the transcript renders as the agent's messages is
narration, not answer** — and it is rendered identically to the answer. That is
the reported symptom.

### The live stream already separates these

`crab-shell-proxy/internal/pico/turn.go:172` skips `kind == "thought"` and
`kind == "tool_calls"` frames from content and re-emits them as `x_crab_progress`;
`turn-progress.tsx:31` paints a thought as `text-fg-muted/70 italic` with a Brain
icon. So **live and history disagree**: the narration you saw as a faint progress
line during the turn comes back as a full message on reload. `history.go:340`
already states the governing principle — *"History should match what the user
actually saw."*

### This also explains the gaps from the earlier round

`chat-view.tsx` gives every message its own band with `py-6` (or `py-10` when it
stands alone between the other speaker's messages). A narration run therefore
stacks 96px+ of padding between consecutive assistant texts. Consistent with
"grandes espaços entre algumas mensagens" — and unlike the blank-message theory,
this one is supported by the data. Not yet confirmed against the specific
conversation the user was looking at.

## The two separable layers

They are different things and should be decided separately:

1. **Tool narration** — assistant entries with `tool_calls`. The agent saying
   "let me check X" around a call. 200 of 304. Currently full messages.
2. **Raw chain of thought** — `reasoning_content`. 30 entries, up to 2.2KB.
   Currently **dropped entirely**: `jsonlEntry` never reads the field, so it
   reaches neither the live stream nor the transcript.

## Constraint discovered by measurement — the obvious rule is UNSAFE

"`tool_calls` non-empty ⇒ narration, hide it" loses answers. Per user turn:

```
 112  turns analysed
 102  turn keeps >= 1 final answer
   7  TURN LOSES EVERYTHING  (every texty assistant entry has tool_calls)
   3  turn has no texty assistant entry at all
```

**7 turns in 112 (6%) would go blank.** Also, 8 turns end on a `tool_calls` entry
that carries text — the answer arrived in the same frame as a trailing call.

Any implementation must therefore keep a floor: demote entries to "thought" only
while at least one texty non-`tool_calls` entry remains in the same turn, or never
demote a turn's last texty entry. This is not a hypothetical — it is 6% of the
sampled history.

## Decisions (user's call)

**DEC-1 — narration collapses into one block per run**, headed by its count
("3 passos"), closed by default. Not a per-message muted line, and not hidden
outright.

**DEC-2 — `reasoning_content` is surfaced**, collapsed and closed by default.
It is dropped entirely today, so this is new information, not a restyling.

## Implementation

### crab-shell-proxy — `internal/history/history.go`

- `jsonlEntry` reads two more fields: `tool_calls` (presence only, kept as
  `[]json.RawMessage` — the calls are picoclaw's business) and
  `reasoning_content`.
- `Message` gains `Kind` (`"step"` on narration, omitted on an answer) and
  `Reasoning`.
- An entry survives when it has content **or** reasoning. That is what keeps the
  52 reasoning-carrying entries whose content is empty, which used to be dropped
  whole.
- `keepAnswerlessTurns` enforces the safety floor: within a turn (the span
  between user messages), narration is only left demoted while a plain assistant
  message with text remains. Otherwise every texty entry is promoted back to an
  answer. Without it, 7 of the 112 sampled turns render blank.

Needs a rebuild/redeploy to take effect.

### crab-exoskeleton-webapp

- `app/api/chat/[instance]/history/route.ts` — the blank filter now also keeps a
  message that carries reasoning but no text.
- `app/chat/history-cache.ts` — drops those reasoning-only steps. The tree,
  Canvas and the content filter turn every message into a point in the
  conversation, so a step with no text would be a blank node there. These
  consumers are left seeing exactly what they saw before, and that follows: the
  BFF keeps `content non-blank OR reasoning non-blank` while this keeps
  `content non-blank`, so the difference is precisely the reasoning-only steps
  the BFF newly admits — nothing that used to reach here is removed.
- `app/chat/message-rows.ts` (new) — `toRows` / `rowRole` / `landingIndex`, pure.
  Consecutive steps merge into one row; the original message index is carried
  through because scroll refs and the tree's `msg` anchor are keyed by it.
  `rowRole` makes a run space as ONE assistant block, so the padding of its
  neighbours is not computed against invisible messages. `landingIndex` is what
  opening a conversation scrolls to: plain `length - 1` would land on a collapsed
  block whenever the transcript ends on narration — the agent narrating after
  answering, or a trailing reasoning-only step, which is never promoted back to
  an answer because it has no text of its own.
- `app/chat/chat-view.tsx` — renders a run through `StepRun` (a `<details>`
  disclosure, no padding of its own) and reasoning through `Reasoning`. Every
  step in a run points its scroll ref at the block, so a tree anchor on a step
  still lands on something.
- `lib/i18n/chat.ts` — `stepOne` / `stepsOther` / `reasoning`, both locales.

Disclosures are `<details>`/`<summary>` rather than state, matching the admin
`Accordion`'s reasoning (keyboard + screen-reader semantics free, no state to
drift) without inheriting its card shell. Headers state their count for the
reason that component's comment gives: a collapsed block that names only itself
is worse than the flat list it replaces.

## Verification

`go test ./internal/history/` — two new tests: one asserts narration is marked and
reasoning survives (including on an empty-content entry), one asserts the
answerless-turn floor. `npm test` — 721 passing, 12 of them new over `toRows` /
`rowRole` / `landingIndex`. `tsc` clean, production build green.

`Kind` and `Reasoning` are `omitempty`, so a webapp running against an older
proxy sees byte-for-byte the response it always saw: every message is an answer
and the transcript renders as it does today.

**Not yet confirmed against the running app.** The webapp half takes effect on a
dev restart, but `kind` / `reasoning` only start arriving once the proxy is
rebuilt — until then every message is an answer and the transcript looks exactly
as it does today. That is also the check for whether this is what closed the
gaps.
