# 007 — Summary

**Changed:** `app/chat/chat-view.tsx` only. Two dependency lists gained `project`
— the `setPainter` effect (the defect) and the history-load effect (the same
omission, currently masked by `setFragmentProject` also dropping `sid`).

**Gate:** 797 tests in 58 files passing, `yarn build` clean. No test was added: the
suite runs `environment: "node"`, where no effect fires, so nothing in it can
observe an effect re-registering. The nearest existing guard is
`app/chat/workspace-panel-scope.test.ts`, which asserts the same invariant for the
four workspace panels by reading their source.

**Extending that guard to `chat-view.tsx` was considered and rejected.** Its rule
is "every effect keyed on `workspace.t` is also keyed on `workspace.p`", and
`chat-view` deliberately does not use `workspace.p` — it takes `project` as its own
prop. The guard would need a second, differently-worded rule for one file, and a
rule that has to be special-cased per file stops being a rule.

## Still open, needs one answer from the reporter

This fix only bites **inside a project**: outside one the stale `project` is `null`
and equals the current value, so the reload was always correctly scoped.

If the conversation also blanks in a chat that belongs to no project, the diagnosis
is incomplete. What to look at when it happens:

- **`sid` in the URL stays the same, pane is blank** → this bug's shape (the painter
  overwrote `messages` with an empty transcript). If it still happens after this
  fix, the reload is failing for another reason and the next step is to read what
  `GET /api/chat/<instance>/history` actually returned.
- **A new conversation row appears in the sidebar and `sid` changes** → a different
  bug. No effect in the tree writes the fragment on a conversation-list refresh, so
  there is currently no mechanism for it and it would need its own investigation.

## Not changed, deliberately

`reloadHistory` still sets `messages` to whatever the reload returns, including an
empty array — it does not refuse to blank a conversation that had content. Guarding
that would hide precisely the symptom being fixed here: if the scope is still wrong
in some path nobody has found, the guard means nobody ever finds out. The function's
`catch` already prefers "leave whatever is on screen" for a transport failure; an
empty 200 is a different claim and is trusted on purpose.
