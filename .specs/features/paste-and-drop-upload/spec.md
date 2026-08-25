# paste-and-drop-upload — Spec

**Status:** Implemented (tests + build green; the chat overlay is verified by hand only — see Reconciliation)
**Size:** Large (three drop surfaces, one paste surface, a naming rule, new copy)
**Repo:** `crab-exoskeleton-webapp` only. The proxy already has everything this
needs — `uploadMedia` and `moveMedia` are unchanged.

**Depends on** `unrestricted-upload-types`. Dropping a `.parquet` onto the chat
is pointless while the proxy answers 400, and a drop that fails is a worse
experience than a paperclip that never offered the file.

---

## Problem

There is exactly one way to get a file into a workspace: click the paperclip (or
the sidebar's Upload button) and drive the OS dialog. Two things members
routinely have in hand do not fit that:

- **A screenshot on the clipboard.** There is no file to pick — they have to save
  it to disk first, then find it in the dialog.
- **A file already visible in a file manager.** Dragging it onto the page today
  does nothing useful: the browser navigates the tab to the file, which
  **destroys the draft** and drops the member out of the conversation.

Both were asked for by name, and both are the interaction everything else on
their machine already supports.

## Goal

Paste a file from the clipboard into the chat box; drag files from outside the
browser onto the chat, or onto the files tab in the right sidebar — including
onto a specific folder there.

## Non-goals

- **Not** a change to what an upload lands as. The chat surfaces attach what they
  upload (the point there is to talk about it); the files sidebar does not (the
  point there is that the file exists). This is the FR-3 rule of
  `file-mentions-and-sidebar-upload`, restated for two new entry points rather
  than revisited.
- **Not** directory upload. A dropped folder is refused with a message (FR-14).
- **Not** drag-out. Dragging a workspace file from the sidebar to the desktop is
  a different feature and was not asked for.
- **Not** a second upload path. Everything here routes through the existing
  `uploadFiles` (chat) and `onUpload` (sidebar).

---

## Requirements

### Paste into the chat box

- **FR-1** The composer's textarea handles `onPaste`. When
  `e.clipboardData.files.length > 0`, those files are uploaded through the same
  `onPickFiles` the paperclip calls, and the paste is `preventDefault`ed.
- **FR-2** When the clipboard carries **no** files, the handler does nothing at
  all — no `preventDefault`, no state change. Pasting text into a textarea is the
  single most common thing that happens to this element, and a handler that
  intercepts it unconditionally breaks it.
- **FR-3** A pasted file is renamed client-side to
  `pasted-<YYYYMMDD-HHMMSS>.<ext>` before upload, where `<ext>` comes from the
  file's MIME type (`image/png` → `png`), falling back to the original extension
  and then to no extension at all.

  **This is not cosmetic.** Every screenshot a browser puts on the clipboard
  arrives as a `File` named `image.png` — the same name, every time — and
  `StoreMedia` opens with `O_TRUNC` keyed on the sanitized name. Without a
  unique name, the second pasted screenshot **silently overwrites the first**,
  including one already referenced by an earlier message in the transcript.
- **FR-4** The renaming is a **new `File`**, not a mutation: `file.name` is
  read-only, and `uploadMedia` sends `form.set("file", file, file.name)`.
- **FR-5** The advanced markdown editor gets the same paste behaviour, for the
  same reason it exists — it is where someone composes a long message, which is
  exactly where they will paste a screenshot. It has no upload path today
  (`MarkdownEditor` takes `initialValue`/`onClose`/`onSubmit` and nothing else),
  so this adds one prop, wired to the same `onPickFiles` the composer holds.

### Drop onto the chat

- **FR-6** The chat column is a drop target for **external files**. A drop
  uploads them and attaches them to the composer, identically to the paperclip.
- **FR-7** Every drag handler gates on
  `e.dataTransfer.types.includes("Files")`. The sidebar's own file rows are
  draggable and set `text/plain`; without this gate, dragging a workspace file
  over the chat would light up a target that then uploads nothing.
- **FR-8** A visible overlay states the target while a file is over it
  ("Drop to attach" / "Solte para anexar"). Its visibility is driven by a
  **depth counter**, not a boolean: `dragenter`/`dragleave` fire for every child
  element the pointer crosses, so a boolean flickers the overlay across the
  message list.
- **FR-9** A **window-level** `dragover`/`drop` guard calls `preventDefault` so a
  file dropped **outside** the zone is swallowed instead of navigating the tab.
  This is the part that protects the draft, and it is the reason the current
  behaviour is destructive rather than merely absent.
- **FR-10** The zone is inert while history is loading, matching the paperclip's
  existing `disabled={loadingHistory}`.

### Drop onto the files tab

- **FR-11** The files panel accepts external files on its **root zone** and on
  **any folder row** — the two targets `dropProps` already draws for internal
  moves.
- **FR-12** The external branch is **separate from the internal one**, not
  merged into it. `dropProps` currently gates every handler on
  `dragPath !== null`, which is precisely what makes an external drop inert
  today. The two paths answer different questions (`canDrop` for a move, "is it a
  file" for an upload) and share only the highlight.
- **FR-13** A drop onto a **folder** uploads to the root and then `moveMedia`s
  the file into that folder. An upload cannot express a subfolder —
  `StoreMedia` reduces the name to a base name, which is why
  `file-mentions-and-sidebar-upload` FR-4 says uploads land at the root — and
  the two-step is built from two calls that already exist and are already
  covered. If the move fails, the file is visibly at the root and the panel's
  existing error alert says why; nothing is lost.
- **FR-14** The system folder (`attachments`, "Agent deliveries") refuses
  external drops, reusing `isReservedFolder`/`isInsideReserved`. The proxy
  refuses it independently with 403; this is so the row does not light up and
  invite the refusal.
- **FR-15** A dropped **directory** is refused with a message naming the reason.
  `dataTransfer.files` yields a zero-byte entry with no MIME type for a folder,
  which would otherwise upload as a nonsense file with the folder's name.
  Detection is `DataTransferItem.webkitGetAsEntry()?.isDirectory`, with the
  zero-byte/no-type heuristic as the fallback where that API is unavailable.
- **FR-16** Uploads are sequential and the panel refreshes once at the end —
  `onUpload`'s existing behaviour, unchanged.

### Failures

- **FR-17** A rejected upload surfaces in the surface's **existing** error alert
  (`attachError` in the chat, `folderError` in the panel). No new error surface.
- **FR-18** Drag-and-drop makes it easy to drop something far over the size cap,
  so the 413 must read as a size problem. That mapping is
  `unrestricted-upload-types` FR-8 and is a hard prerequisite here: without it
  every drop failure reads as *"Algo deu errado."*

### Copy

- **FR-19** New strings are added to `chatCopy` in both locales, with distinct
  values — `lib/i18n/parity.test.ts` fails on any leaf identical across locales
  unless it is listed as deliberately shared, and none of these are.

---

## Decisions

- **DEC-1 — the drop zone is the chat column, not the composer.** A member aims
  at the conversation, not at the input box; a small target means most drops land
  outside it, where FR-9 swallows them silently. A large target with an explicit
  overlay is what makes the gesture discoverable.
- **DEC-2 — a paste attaches, a sidebar drop does not.** Same split the two
  existing upload buttons already have, and for the same reason: the clipboard
  and the chat box are where someone is composing; the files panel is where
  someone is filing.
- **DEC-3 — timestamp, not UUID, for the pasted name.** The name is shown to the
  member in a chip and in the files tree, and `pasted-20260824-142233.png` is
  something they can find again. A uuid is not. Second-resolution collisions
  within one second are possible in theory; the same second, the same workspace,
  and a member pasting twice is not a case worth a counter.

---

## Acceptance

1. Screenshot to clipboard → Ctrl+V in the chat box → the file uploads, attaches,
   and appears in the files panel as `pasted-<stamp>.png`.
2. Paste a second screenshot → **two** files, neither overwritten.
3. Ctrl+V with text on the clipboard → the text lands in the textarea, nothing
   uploads.
4. Drag a file from the desktop over the chat → overlay appears, does not
   flicker while moving across messages → drop → uploaded and attached.
5. Drop a file **outside** any zone → nothing happens, the draft survives, the
   tab does not navigate.
6. Drag a file onto a folder row in the files tab → it lands **inside** that
   folder.
7. Drag a file onto "Agent deliveries" → the row does not light up and nothing
   uploads.
8. Drag a folder → refused with a message, no zero-byte file created.
9. Drag a file row **inside** the sidebar onto another folder → still moves, as
   before.

---

## Reconciliation

Shipped as specified, with four things the implementation settled:

- **FR-14 became a refusal that SPEAKS.** The spec said the system folder should
  not light up. That is not enough: a target which does not accept `dragover` is
  not offered the drop at all — the browser hands it to the nearest ancestor that
  did, which is the root zone. Ignoring the drop would therefore have filed it at
  the ROOT, silently, somewhere the member did not aim. The row now accepts the
  drag with `dropEffect: "none"`, swallows the drop and raises `media_reserved`.
  Side effect, kept on purpose: an internal move dropped on that row is swallowed
  too, where before it quietly moved the file to the root.
- **The pending-error clobber, in both surfaces.** `uploadFiles` and `onUpload`
  both clear their alert on entry, so setting the dropped-folder refusal *before*
  calling them erased it. Both now take a `pending` error, and an upload failure
  is allowed to replace it — the file that could not be stored is the more
  actionable message.
- **`dropIntoFolder` copy was written and then deleted.** A per-row caption in a
  column this narrow is noise; folder rows carry the highlight, and the root zone
  carries the only sentence (`dropToUpload`), shown only while the drag is
  external — the pane offers two different actions on the same targets and has to
  say which one is on offer.
- **FR-13's promise forced the error mapping wider.** "The panel's existing error
  alert says why" was false as first written: `/api/media/move` went through
  `proxyMediaWrite`, which forwarded the proxy's English prose, so a failed move
  after a successful upload would have read "Algo deu errado." — the exact failure
  `unrestricted-upload-types` FR-8 exists to kill, on a path this feature
  introduces. `proxyMediaWrite` now uses the same `mediaError` mapper.
- **The paste handler is shared, not duplicated.** `pasteFilesHandler` is exported
  from `composer.tsx` and passed into `MarkdownEditor` as a prop, so the two
  places someone composes cannot drift.

### Defect found in use: the highlight strobed over a folder

Reported after the first pass: dragging a file over the files pane and passing over
a folder made the drop box flash between shown and hidden fast enough to read as the
pane freezing. **Two independent causes**, both now fixed and both with a regression
test that was confirmed to fail before the fix:

1. **`dragleave` fires for children and bubbles.** The row's handler cleared the
   highlight whenever the pointer crossed the chevron, the name or the count inside
   it, and the next `dragover` — milliseconds later — put it back. The fix is the
   same fact the chat zone's depth counter encodes, spelled differently because this
   pane has many independent targets: if `relatedTarget` is still inside the row, the
   pointer never left. This bug predates the feature for internal moves; external
   drags made it constant.
2. **The root hint took part in the layout** — this half was introduced by this
   feature. A hint appearing in the flow pushed every row down, sliding the row out
   from under the pointer, which hid the hint, which slid the rows back: a loop that
   sustains itself at pointer speed. It is now absolutely positioned **and**
   `pointer-events-none`, so it can neither move the rows nor generate drag events of
   its own.

**Rule this leaves behind:** anything that appears *because* of a drag must not
change the geometry the drag is being measured against.

**Not covered by a test:** the chat column's drop overlay is rendered by
`chat-view.tsx`, which the suite does not mount (it needs a session, providers and
fetch). The hook behind it is covered in full — types gate, depth counter,
directory split, window guard, and the guard's teardown — but *that the overlay is
wired into the column* rests on the build and on acceptance item #4. That is the
same class of gap `uploads-sidebar.tsx` records; it is written down rather than
implied.

**Verification:** `yarn test` green at every checkpoint — 1370 tests in 102 files after the defect fix (28 of them new
across `lib/media.test.ts`, `composer-paste.test.tsx`, `use-file-drop.test.tsx`,
`uploads-drop.test.tsx`), `yarn build` clean.
