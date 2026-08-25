# paste-and-drop-upload — Tasks

**Spec**: `.specs/features/paste-and-drop-upload/spec.md`
**Status**: Done — T1–T6 landed; T7's automated gates are green and the manual
acceptance walk (items 1–9) still needs a running stack.

| Task | Status | Note |
| --- | --- | --- |
| T1 | Folded into the test files | A shared `drop-test-utils.ts` was not written: each suite needs a two-line `transfer()` of its own, and one shared fake would have carried three consumers' shapes |
| T2 | Done | `pastedFileName`, `renamedFile`, `isExternalFileDrag`, `droppedDirectories` in `lib/media.ts`, 14 tests |
| T3 | Done | Paste in `composer.tsx`; the drop zone became `use-file-drop.ts` (depth counter + window guard + directory split), mounted by `chat-view.tsx` |
| T4 | Done | `dropProps` grew a second branch; `onUpload(files, folder, pending)` does upload-then-move. The reserved folder now refuses out loud — see the spec's Reconciliation |
| T5 | Done | `pasteFilesHandler` exported from the composer and passed to `MarkdownEditor` |
| T6 | Done | `composer.dropToAttach`, `uploads.dropToUpload`, `errors.media_directory`; `dropIntoFolder` was written and then removed unused |
| T7 | Partial | `yarn test` + `yarn build` green; the hand walk is pending a deploy |
**Blocked by**: `unrestricted-upload-types` (both halves shipped — the proxy's
allowlist gone AND the BFF error mapping in place)

## Test matrix and gates (derived, not assumed)

`.specs/codebase/TESTING.md` does not exist in this repo. The matrix is derived
from the convention the sibling chat features already follow
(`attachment-menu.test.tsx`, `uploads-file-row.test.tsx`,
`composer-stop.test.tsx`).

| Code layer | Required tests | Notes |
| --- | --- | --- |
| Pure helpers in `lib/` | unit, default `environment: "node"` | table-driven |
| Components with real DOM events | `// @vitest-environment jsdom` + `createRoot`/`act` | the idiom is `attachment-menu.test.tsx`'s, including the `IS_REACT_ACT_ENVIRONMENT` flag |
| i18n | `lib/i18n/parity.test.ts` runs as-is | fails on identical leaves across locales |

| Gate | Command |
| --- | --- |
| quick | `yarn test <file>` |
| full | `yarn test && yarn build` |

A synthesized `DataTransfer` is needed throughout: jsdom does not implement it.
A plain object with `types`, `files` and `items` satisfies every handler here,
and T1 writes it once as a shared helper rather than per test file.

---

## Dependencies

```
T1 ──→ T2 ──→ T3 ──┐
             T4 ───┼──→ T7
             T5 ───┤
       T6 ─────────┘
```

T2 (pure helpers) unblocks everything. T3/T4/T5 touch three different files and
are `[P]`. T6 is copy only and is `[P]` with all of them.

---

## Task Breakdown

### T1: Test scaffolding for drag/paste events

**What**: A `fakeDataTransfer({files, types})` helper and a `filePaste`/`fileDrop`
event builder.
**Where**: `app/chat/drop-test-utils.ts` (new)
**Depends on**: None
**Reuses**: the jsdom + `act` idiom of `attachment-menu.test.tsx`
**Requirement**: infrastructure for FR-1, FR-6, FR-11

**Done when**:

- [ ] `fakeDataTransfer` produces an object whose `types` is a real array
      (`includes("Files")` must work) and whose `items` carry
      `webkitGetAsEntry()`
- [ ] It can express a directory entry and a zero-byte typeless file
- [ ] Gate: imported by T3's test and passes there

**Tests**: n/a (test-only module) · **Gate**: quick
**Commit**: `test(chat): add drag-and-paste event helpers for jsdom`

---

### T2: Pasted-file naming and external-drop predicates

**What**: `pastedFileName(file, at)`, `renamedFile(file, name)`,
`isExternalFileDrag(dataTransfer)`, `droppedDirectories(dataTransfer)`.
**Where**: `lib/media.ts` (extend), `lib/media.test.ts`
**Depends on**: T1
**Reuses**: nothing — these are new pure functions
**Requirement**: FR-3, FR-4, FR-7, FR-15

**Done when**:

- [ ] `pastedFileName` maps `image/png` → `pasted-20260824-142233.png`; falls back
      to the original extension when the MIME type is unknown; returns a name with
      **no** extension rather than a dangling dot when neither is available
- [ ] The timestamp is a parameter, not `Date.now()` read inside — the test pins
      an exact string
- [ ] `renamedFile` returns a **new** `File` carrying the same bytes and type
      (`file.name` is read-only — a mutation would silently no-op)
- [ ] `isExternalFileDrag` is true for `types: ["Files"]`, false for
      `types: ["text/plain"]` (the sidebar's own row drag)
- [ ] `droppedDirectories` finds a directory via `webkitGetAsEntry`, and via the
      zero-byte/no-type fallback when `items` is absent
- [ ] Gate: `yarn test lib/media.test.ts`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(media): add pasted-name and external-drag helpers`

---

### T3: Paste and drop in the composer [P]

**What**: `onPaste` on the textarea; the chat-column drop zone with its overlay,
depth counter and window-level guard.
**Where**: `app/chat/composer.tsx`, `app/chat/chat-view.tsx`,
`app/chat/composer-paste.test.tsx` (new), `app/chat/chat-drop.test.tsx` (new)
**Depends on**: T1, T2, T6 (copy keys)
**Reuses**: `onPickFiles` → `uploadFiles` (`chat-view.tsx:581`), `attachError`
**Requirement**: FR-1, FR-2, FR-4, FR-6, FR-7, FR-8, FR-9, FR-10, FR-17

**Done when**:

- [ ] A paste carrying files uploads them renamed and `preventDefault`s
- [ ] A paste carrying only text does **not** `preventDefault` and uploads nothing
      — assert on the `defaultPrevented` flag, not on the absence of a call
- [ ] Two consecutive image pastes produce two **different** names
- [ ] The overlay survives a `dragenter` on a child following a `dragleave` on the
      parent (depth counter, FR-8)
- [ ] A drag whose `types` is `["text/plain"]` never opens the overlay
- [ ] The window guard `preventDefault`s a drop outside the zone
- [ ] The zone is inert while `loadingHistory`
- [ ] Gate: `yarn test app/chat/composer-paste.test.tsx app/chat/chat-drop.test.tsx`

**Tests**: unit (jsdom) · **Gate**: quick
**Commit**: `feat(chat): upload files pasted or dropped into the conversation`

---

### T4: External drop in the files sidebar [P]

**What**: A second, separate drop branch in `dropProps`; upload-then-move for a
folder target; directory refusal.
**Where**: `app/chat/uploads-sidebar.tsx`, `app/chat/uploads-drop.test.tsx` (new)
**Depends on**: T1, T2, T6
**Reuses**: `onUpload`, `runFolderOp`, `moveMedia`, `isReservedFolder`,
`isInsideReserved`, `folderError`
**Requirement**: FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17

**Done when**:

- [ ] An external drop on the root zone uploads and refreshes
- [ ] An external drop on a folder row uploads, then moves into that folder —
      assert **both** calls and their order
- [ ] A failed move leaves the file at the root and shows the error
- [ ] `attachments` and anything under it neither highlights nor uploads
- [ ] An **internal** row drag still moves, unchanged — the existing
      `uploads-sidebar` tests stay green with no edits
- [ ] A dropped directory uploads nothing and shows the refusal
- [ ] Gate: `yarn test app/chat/uploads-drop.test.tsx app/chat/uploads-sidebar.test.ts`

**Tests**: unit (jsdom) · **Gate**: quick
**Commit**: `feat(files): accept files dragged in from outside the browser`

---

### T5: Paste in the advanced markdown editor [P]

**What**: The same paste branch as T3, on the full-screen editor.
**Where**: `app/chat/markdown-editor.tsx`, test alongside
**Depends on**: T2, T6
**Reuses**: whatever T3 extracts — if the handler is more than a few lines, T3
exports it and this task imports it rather than restating it
**Requirement**: FR-5

**Done when**:

- [ ] A file pasted in the editor uploads and attaches
- [ ] Text paste is untouched
- [ ] Gate: `yarn test app/chat/markdown-editor*.test.tsx`

**Tests**: unit (jsdom) · **Gate**: quick
**Commit**: `feat(chat): accept pasted files in the advanced editor`

---

### T6: Copy [P]

**What**: New `chatCopy` leaves in `en` and `pt`: the chat drop overlay, the
sidebar drop hint, the directory refusal.
**Where**: `lib/i18n/chat.ts`
**Depends on**: None
**Reuses**: the existing `uploads` and `composer` namespaces — no new top-level
group
**Requirement**: FR-19

**Done when**:

- [ ] Every new leaf differs between locales
- [ ] Gate: `yarn test lib/i18n/parity.test.ts`

**Tests**: parity · **Gate**: quick
**Commit**: `i18n(chat): copy for pasted and dropped uploads`

---

### T7: Close-out

**What**: Full gate, acceptance walk-through, spec reconciliation.
**Where**: `.specs/features/paste-and-drop-upload/spec.md` (Reconciliation
section), this file's Progress table
**Depends on**: T3, T4, T5, T6

**Done when**:

- [ ] All nine acceptance items in the spec exercised by hand against a running
      stack, including #5 (the draft survives a stray drop) and #9 (internal
      moves still work)
- [ ] Gate: `yarn test && yarn build`, both clean
- [ ] Any behaviour that differs from the spec is written into the spec, not
      left in the diff

**Tests**: full suite · **Gate**: full
**Commit**: `docs(specs): reconcile paste-and-drop-upload with what shipped`
