# 007 — the completion painter read the wrong workspace

**Reported:** sending a message in a chat blanks the conversation — it comes back
"from zero, as if I had opened a new chat" — at the moment the chats sidebar
refreshes.

## Root cause

The sidebar refresh is a coincidence, not the cause. Both happen in the same
instant because `runTurn` calls `notifyConversationsUpdated()` (which the sidebar
listens to) right after the stream drains, and `finishIfDrained` calls
`onReplyDone?.(sid)` — the painter — on the same path (`turn-store.ts:452`).

The painter is what blanks the chat. `chat-view.tsx` registers it in an effect
keyed on `[workspace.t, workspace.s, workspace.r]`, and the callback closes over
`reloadHistory`, which closes over `project`. **Entering a project changes none of
those three**, so the painter was never re-registered and kept whatever `project`
was current when the view mounted.

So, in a project conversation, the reload asked for the transcript with the wrong
scope. That is not an error — `historyQuery` says so in its own comment: the
project's transcripts live under the project's workspace, and omitting the
parameter reads the main workspace and returns an **empty** history. The painter
then did:

```
reloadHistory(sid)   -> setMessages([])        // the transcript, from the wrong scope
  .then(() => clearCompleted(sid))             // drops the bands holding the real reply
```

Both the message just sent and the reply that had just streamed in were discarded,
leaving an empty pane on an unchanged `sid` — indistinguishable from a new chat.

## Verified before fixing

- `onReplyDone?.(sid)` fires on the ordinary completion path
  (`turn-store.ts:452`, inside `finishIfDrained`), not only on some edge case.
- The history BFF **does** forward `project`
  (`app/api/chat/[instance]/history/route.ts:46`). This is the discriminator: the
  initial load and the painter's reload call the same `historyQuery` and differ
  *only* in the captured `project`, which is why the conversation renders fine
  until the moment a turn completes.

## Fix

Two dependency lists in `app/chat/chat-view.tsx`:

- the painter effect (`setPainter`) — the actual bug;
- the history-load effect — it reads `project` and did not list it. Rescued so far
  only because `setFragmentProject` also drops `sid`, which is a property of that
  writer rather than of this effect.

## Scope of the fix

**It only bites inside a project.** Outside one, the stale value is `null` and so is
the current one. If the blanking also happens in a chat belonging to no project,
this is not the whole story — see SUMMARY.md.
