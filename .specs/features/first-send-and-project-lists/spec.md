# The first message of a new conversation, and the list that describes it

Two bugs reported together, with two different causes.

## FR-1 — A first message is not parked by the view that opens it

**Symptom.** Create a project, land in the blank chat inside it, type and press Enter.
The bubble pulses forever; `POST /api/chat/<role>` is never made.

**Cause.** `chat-view.tsx` seeded `previousSidRef` with the CURRENT `sessionId`:

```ts
const previousSidRef = useRef<string | undefined>(sessionId);
```

`landing-screen.tsx`'s `send` enqueues the burst, arms the 500 ms debounce
(`SEND_DEBOUNCE_MS`, `turn-store.ts:34`) and writes the fragment. The fragment swaps
the landing for `ChatView` — they are mutually exclusive branches, so the view
**mounts fresh** — and the mount run of its effect reads `previousSidRef.current ===
sessionId` and calls `parkFlush` on it. `parkFlush` clears the timer and leaves
`pending` untouched, so the bubble goes on pulsing with nothing behind it.

**FR-1.1** `previousSidRef` starts `undefined`. On mount there is no previous
conversation, and `parkFlush` already ignores an undefined sid.

**Why it read as intermittent.** `bumpFlush` re-arms while `pending` is non-empty, so
one more keystroke resurrects the send. Only a member who sent once and waited saw it.

**Not the cause**, each checked and excluded: the effect cannot re-run while
`sessionId` is fixed (every other dep is a primitive, and `useRouter()` returns a
module-level singleton in Next 15.5.24); `contexts` is never deleted; the composer's
Enter guard is `loadingHistory`, which swallows the keypress with no bubble at all.

**Untested, and stated rather than hidden.** There is no `chat-view.test.tsx` — the
component is large enough that mounting it crashes the vitest worker, which is
presumably why the file never existed. The store-level half is already pinned by
`turn-store.test.ts` ("enqueue, parkFlush, advance → still pending"); what is not
pinned is that the view does this to itself.

## FR-2 — Every list of projects hears about a write

**Symptom.** After creating a project the breadcrumb does not name it until the page
is reloaded.

**Cause.** `useProjects` documents itself as shared — *"two copies of this list would
disagree the moment one of them changed it"* — and is an ordinary hook with its own
`useState`. Two components call it: `projects-screen.tsx` and `chat-shell.tsx`, whose
breadcrumb renders `projects.find(p => p.id === project)`. The screen reloaded its own
copy after a create; the shell's is keyed on `tenant|subscription|role`, which a create
does not change, so nothing was ever going to re-read it.

**FR-2.1** `lib/projects` announces its own writes on a `chat-projects-updated` window
event, the same mechanism `lib/chatSession` already uses for conversations and for the
reason it gives: one listener refreshes everyone, so a write cannot reach one copy of a
list and miss another.

**FR-2.2** The subscription lives in `useProjects`, not in each consumer.

**FR-2.3** `projects-screen`'s own `await load()` after a create and a delete is gone.
It is now the second fetch of the same list for one write.

The ids were never the problem: a project id is a slug
(`^[a-z0-9][a-z0-9_-]{0,63}$`, `internal/projects/projects.go:66`), so the fragment's
`p=` is the id the `find` compares against. The list was simply stale.

## Known and not addressed here

**`/api/conversations` is fetched once per mounted consumer.** `useConversations` has
the invalidation bus but not shared state, and three components call it —
`chat-shell.tsx`, `history-sidebar.tsx`, `landing-screen.tsx`. Two are mounted in a
chat, so the list is fetched twice on load and refetched in pairs afterwards. It is
correctness-neutral and costs roughly the whole page's traffic; fixing it means a
shared store rather than a shared event, which is a larger change than either bug above.
