# rename-command-sets-alias

`/rename` overwrites the conversation's stored `title` instead of setting its
`alias`. Point it at the alias.

Scope: Small (3 files). No design.md / tasks.md.

## The bug

`chat-view.tsx:471` calls `renameConversation(sessionId, arg)` → `PUT
/api/conversations/:id` `{title}`, which overwrites the `title` column. But
`title` is the name derived from the conversation's first message, and it is the
*primary* line the sidebar renders. The user-supplied name belongs in `alias`,
the field the whole enrichment design is built around — `PUT
/api/conversations/:id/alias` says so in its own header comment: *"Deliberately
separate from rename so it never touches the title or recency."*

So `/rename` was destroying the derived title AND never producing an alias.

This is also why the two-line sidebar rendering looked missing. It has been
implemented since July (`history-sidebar.tsx:421-431` — title primary, alias in
smaller muted type below; `conversation-tree.tsx:349-351` — alias on each
conversation's most recent burst). It simply had no alias to render, because the
only obvious way to name a chat wrote to the wrong column.

## Requirements

- **R1** — `/rename <text>` sets the conversation's alias. The title is not
  touched.
- **R2** — `/rename` with no argument — or with only whitespace, which
  `runCommand` trims to the same empty string — clears the alias. The alias route
  already treats an empty string as a clear, matching how the alias/tags editor
  clears it by emptying the field. This drops the previous usage-error guard, so
  the command no longer rejects any input.
- **R3** — Feedback distinguishes set from cleared, and the copy says *alias* /
  *apelido* — the term the rest of the UI already uses (`enrichment.alias`,
  `history.aliasAndTags`).

## Decisions

**DEC-1 — the sidebar's pencil "Rename" is left alone** (user's call). It keeps
editing the real `title` via `renameConversation`. Two affordances therefore stay
labelled "rename" while writing to different columns; that inconsistency is
accepted for now rather than retiring the pencil or renaming the command to
`/alias`.

**DEC-2 — `renameConversation` and `PUT /api/conversations/:id` stay.** The
pencil is still their caller (DEC-1); nothing to remove.

## Out of scope

Aligning the pencil's label/behaviour with the command, and any `/alias` command
name. Both were considered and declined.

## Verification

`npm test` (709 tests, includes the i18n parity test that guards the new copy in
both locales) and `npm run build`. Behaviour check: `/rename foo` on a chat, then
confirm the sidebar shows the derived title on top with `foo` beneath it, and that
`/rename` alone removes the second line.
