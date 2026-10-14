# The landing composer attaches files and resolves `@`

## The request

> When I enter a place with no conversation open, the text input that appears does not
> allow uploading files nor referencing a file with `@`.

## Cause

`landing-screen.tsx` passed `canAttach={false}` and `mentionFiles={[]}`. The attach
control was hidden on the belief that an upload is stored under a conversation, which the
landing does not have until the first send. That belief is stale: `uploadMedia` sends no
session, and a file lands in the workspace's (or the project's) `public/` exactly as it
does from inside a conversation. The `@` list was simply never loaded there.

## FR-1 — Attach works on the landing

The landing holds its own attachments, uploads through `uploadMedia`, publishes the media
change and arms the turn store's settle wait, as `chat-view.tsx` does. The first message
carries the `[anexo: <path>]` markers. `canAttach` is removed from the composer: nothing
passes it any more.

## FR-2 — `@` works on the landing

`useMentionFiles(workspace)` (new, `app/chat/use-mention-files.ts`) lists the scope's files
and re-reads on the media bus. Both the conversation and the landing use it.

## FR-3 — One marker format

`attachmentMarkers(text, attached, candidates)` in `lib/fileMentions.ts` builds the marker
block for both composers, so the format the agent reads cannot drift between them.
