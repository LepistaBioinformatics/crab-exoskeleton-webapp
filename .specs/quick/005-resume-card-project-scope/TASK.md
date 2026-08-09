# Quick Task 005: scope the "continue where you left off" card to the current project

**Date:** 2026-08-09
**Status:** Done

## Description

The resume card on an empty conversation offered the most recently updated
conversation in the **whole workspace**, then opened it with a `sid`-only
fragment write. Two consequences, one of them a dead end:

- On the agent's own landing the newest chat is often a **project** chat. The
  card named it, and clicking it wrote `sid` while leaving `p` unset — so history
  was fetched from the main workspace instead of the project's. The member could
  not reach the conversation the card was pointing at.
- Inside a project the card was **suppressed entirely** (`if (workspace.p) return`).
  Its comment argued that entering a project means you came to start something new,
  not to resume. That reasoning is what produced the workaround the user
  described: with the in-project card gone, the only card left was the global one,
  which showed a conversation from outside the project.

Both halves were wrong, and they were wrong in opposite directions. The card now
follows the **same scope rule the sidebar's conversation list already follows**
(`history-sidebar.tsx`: a project's conversations are a separate list, and the
unscoped list shows only the chats belonging to no project).

## What changed

`app/chat/conversation-filter.ts`

- New pure `pickResumeCandidate(conversations, openSessionId, project)`. Extracted
  from the inline `useEffect` chain rather than fixed in place, because the bug was
  a **filter rule** and this repo tests filter rules as pure functions
  (`applySyncFilters`, `agentTabs`, `planWorkspaceTree`). It could not be tested
  inside the effect.
- Scope filter added: `(c.project ?? null) === project`. Treats an absent
  `project` as null, so an older API row without the field still resumes on the
  landing.

`app/chat/chat-view.tsx`

- The effect no longer bails out inside a project; it passes `workspace.p ?? null`
  as the scope and delegates to `pickResumeCandidate`.
- The card's `onClick` writes **project and session in one hash write**
  (`setFragmentProjectSid(resumeCandidate.project, resumeCandidate.id)`) instead of
  `setFragmentSid(resumeCandidate.id)`. The filter already guarantees the candidate
  is in the browsed project, so this is redundant *today* — but the filter is ~500
  lines from the call site, and a `sid`-only write is exactly how this card
  stranded people. One write cannot drift from the filter; two can.

`app/chat/conversation-filter.test.ts`

- 7 cases for `pickResumeCandidate`: landing picks the newest **non**-project chat
  even when a project chat is newer; inside a project picks that project's newest;
  no cross-project leakage; null on an empty scope; excludes the open session and
  falls back; skips a fresh "New chat" but keeps a labelled one; absent `project`
  behaves as null.
- `makeConv` gained `project: null`, which also **removed one of the 6 pre-existing
  `tsc` errors** (its `Partial` spread left `project` possibly-undefined).

## Deliberately unchanged

- **The card's copy.** `resumeBody` still reads "your most recent conversation with
  agent {agent}". Inside a project it now offers a project chat while naming the
  agent — imprecise, but not false: a project belongs to exactly one agent. Making
  it project-aware means new i18n keys in both locales, which is past the edge of
  this fix. **Flagged for the user rather than decided here.**
- **`chat-view.tsx:347`'s `setFragmentSid`** on auto-created conversations. That one
  is correct: the conversation is minted with the *current* `project`, which came
  from the fragment, so `p` is already right and only `sid` needs writing.
- **`listConversations`** still fetches the workspace unscoped. The API has no
  project parameter and the sidebar filters client-side the same way; adding one
  would be a proxy change, not this fix.

## Verification

- `npx vitest run` — 56 files, **783** tests pass (was 776; +7 new).
- `npx tsc --noEmit` — **5** errors, all pre-existing test-file `project`/`sessionKey`
  optionality issues. Was 6 before this change; the fixture fix closed one.
- `npx next build` passes.

## Still not verified

**Not exercised in a browser.** The card renders inside `ChatView`, which has no
component test — the new coverage is on the pure selection function only. The three
behaviours a human should confirm:

1. On the agent's landing with a project chat as the newest overall, the card names
   a **global** chat.
2. Inside a project, the card appears and names that **project's** newest chat.
3. Clicking it in both cases lands on the conversation with its history loaded.
