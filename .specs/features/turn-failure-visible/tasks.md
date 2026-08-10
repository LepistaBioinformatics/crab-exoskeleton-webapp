# turn-failure-visible — Tasks (webapp)

Requirements live in the proxy repo:
`crab-shell-proxy/.specs/features/turn-failure-visible/spec.md`. Read it first —
the two paths that lose the error, and why picoclaw offers no structural marker,
are recorded there and not repeated here.

Gate: `yarn test` green, `yarn build` clean.

---

### T-01 — parse the signal ✅
- **What:** `consumeStream` gained an `onError` callback and reads
  `x_crab_error.message`, alongside the content and progress it already handled.
- **Where:** `app/chat/turn-store.ts`.
- **Done:** FR-7.

### T-02 — two fields, not one ✅
- **What:** `TurnState.errorDetail` holds the harness's own sentence; `error` keeps
  holding a stable code. A failure sets `{error: "harness_error", errorDetail: msg}`.
- **Why two:** `errorText` (`lib/i18n/errors.ts:166`) maps a code to localized copy
  and falls back to `dict.unknown` for anything else, so the harness sentence passed
  as the code would have rendered "Something went wrong" — discarding the only part
  that says what to change.
- **Done:** FR-8. New `harness_error` code in both locales; parity test green.

### T-03 — lifecycle ✅
- **Preserved** in `clearCompleted`, beside `error`, with the reason stated: for a
  harness failure it is the only surviving trace, because the transcript the
  completion painter reloads does not contain the error and never will.
- **Cleared** in `enqueue` — on the SEND, not when the turn starts. A queued burst
  can sit for seconds, and a banner about the previous failure should not outlive
  the member's decision to try again. Also cleared in `runTurn`, which covers a
  queued turn starting later.
- **Done:** FR-9, FR-10.
- **A test caught a real gap here.** The first implementation cleared the detail
  only in `runTurn`, leaving `enqueue`'s existing `error: null` reset to strip the
  code and keep the sentence — which is exactly the stale-detail case FR-10 forbids.

### T-04 — render it, with the message that caused it ✅
- **What:** the detail renders inside the existing error `Alert`, beneath the
  localized headline. One banner, not a second surface.
- **Where it sits:** at the END of the message column, inside the scroll area, in the
  same 720px width as the message content — so it reads as belonging to that message
  rather than to the view. It was at the top of the chat first, where it named a
  problem without naming what provoked it, and in a scrolled conversation the banner
  and the message were never on screen together.
- **Why no anchoring machinery:** a failed turn produces no reply, and while the
  banner is up the failing message is necessarily the last one — sending anything else
  clears the error. So "the end of the column" is already the right place.
- **Not dismissible.** A close control was added and then withdrawn on the same
  reasoning that makes this feature exist: the banner is the only account of what
  happened to that message, since picoclaw does not persist it and a reload loses it.
  A stray click would leave a message with no reply and no explanation. The optional
  `onDismiss` added to the shared `Alert` was reverted with it rather than left in
  place unused.
- **Presentation:** monospaced and `whitespace-pre-wrap`, because it is machine text
  that carries its own newlines — picoclaw appends an `Original error:` block for
  auth failures, and reflowing that makes it unreadable.
- **Where:** `app/chat/chat-view.tsx`.
- **Done:** FR-11.

---

## Tests added

`app/chat/turn-store.test.ts`, 6 cases:

- `x_crab_error` routes to the handler.
- The failure text arrives on **both** channels — as content and as the signal — and
  neither swallows the other.
- A frame with no handler passed is ignored (an older client keeps working).
- An ordinary chunk reports nothing.
- The detail survives `clearCompleted`.
- A new send clears code and detail together.

803 tests in 58 files passing, up from 797.

## Not covered

**A page reload loses the banner** — see the spec's "Known limitation". The error is
not in picoclaw's transcript, so a reopened conversation shows the member's message
with no reply and no error. This makes the failure visible for the session it
happened in.
