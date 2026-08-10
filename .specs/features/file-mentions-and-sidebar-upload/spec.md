# file-mentions-and-sidebar-upload — Spec

Two ways to work with workspace files without leaving what you were doing: upload
from the files panel, and reference an existing file from the chat box with `@`.

Webapp only. The proxy already has everything both need.

---

## Sidebar upload

- **FR-1** The files pane gets an **Upload** control beside **New folder**, opening
  the OS picker on the full media allowlist (`MEDIA_ACCEPT`).
- **FR-2** It uploads through the same `uploadMedia` the chat box uses, then bumps
  the panel's own refresh so the tree shows the file without a manual reload.
- **FR-3** It does **not** attach anything to the composer. This is file management,
  not composing: the point is that the file exists for the agent to find later. The
  chat box's attach button keeps its own behaviour, where attaching *is* the point.
- **FR-4** Files land at the **root** of `uploads/`. Not a UI decision — `StoreMedia`
  reduces the name to a safe basename, so the API cannot express a subfolder.
  Dragging into a folder afterwards already works.
- **FR-5** Uploads are sequential, and a failure surfaces in the pane's existing
  error alert rather than a new surface.

**Deliberately wider than asked.** The request said "upload de imagens"; the control
accepts the whole allowlist, because the panel it lives in lists every type and an
upload button that silently refuses a PDF in a file manager is a bug report waiting
to happen. Images are included, and the picker is not filtered to them.

---

## `@` file references

### Shape

The `@token` **stays in the sent text** — the member wrote a sentence and it should
still read like one — and at send time each resolved mention also contributes an
`[anexo: uploads/…]` marker, the same machine reference the attach button has always
produced. That marker is what makes the agent able to open the file; `parseAnexos`
already strips it from the rendered message and turns it into a download chip, so
nothing downstream needed changing.

- **FR-6** Typing `@` opens a menu of the workspace's files, filtered as the token is
  typed by case-insensitive substring on the whole path (`@q1` finds
  `reports/q1.pdf`).
- **FR-7** The menu is keyboard-driven on the **same contract as the slash menu**:
  ↑/↓ move, Enter or Tab picks, Escape dismisses without sending. A second idiom for
  the same interaction would be a second set of keyboard bugs.
- **FR-8** It is driven off the **caret**, not the whole value, so an `@` in a
  finished sentence does not reopen the menu when the member edits elsewhere.
- **FR-9** Picking inserts `@<path> ` with a trailing space and restores the caret
  explicitly — React re-renders the textarea with new text and the browser would
  otherwise park the cursor at the end, which is wrong mid-sentence.
- **FR-10** The list is capped at 8. A workspace can hold hundreds, and a longer list
  is not read, it is scrolled past; narrowing the query is faster.
- **FR-11** Folders are excluded: a directory is a branch, not something to reference.
- **FR-12** A mention resolves only against files the workspace **actually has**, so
  a typo, a deleted file, or an email address (`samuel@biotrop.com.br` — nobody's
  path) is simply not a reference. No special case for emails was needed.
- **FR-13** A file mentioned twice attaches once, and a mention of something already
  attached through the button does not duplicate it.

### The quote rule

- **FR-14** An `@` inside a **double-quoted** span is literal text.
  `ele disse "olhe o @logo.png"` references nothing.
- **FR-15** Quotes are **counted, not matched**: an odd number of `"` before the `@`
  means it sits inside an unterminated quoted span, which is still the member
  quoting. The rule must not depend on text that has not been typed yet.
- **FR-16** The menu does not open inside a quoted span either — offering a
  completion for something that will not resolve is worse than offering nothing.
- **FR-17** **Only the double quote counts.** Single quotes were considered and
  rejected: an apostrophe is ordinary prose in both languages this app speaks
  ("it's", "d'água"), so treating `'` as a delimiter would let one apostrophe
  silently disable every reference after it — a failure the member could neither see
  nor explain. Backticks are not delimiters either; that was not asked for.
- **FR-18** This is why a mention is resolved from the **text at send time** rather
  than committed when the menu is used: wrapping `@file` in quotes *after* choosing
  it has to be able to turn it back into prose. A decision taken at insert time could
  not know that.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | Uploading from the files pane puts the file in the workspace and shows it in the tree, with nothing attached to the composer |
| AC-2 | Inside a project, the upload lands in that project's `uploads/` (it rides the same `workspace.p` the panel already carries) |
| AC-3 | `veja @logo.png` sends the sentence plus `[anexo: uploads/logo.png]` |
| AC-4 | `ele disse "olhe o @logo.png"` sends the sentence and **no** marker |
| AC-5 | An unclosed quote before the `@` also suppresses it |
| AC-6 | An apostrophe anywhere in the message suppresses nothing |
| AC-7 | `@ghost.png` and `samuel@biotrop.com.br` produce no marker |
| AC-8 | A file mentioned twice, or mentioned and attached, yields one marker |
| AC-9 | The menu is keyboard-operable and does not open inside quotes |

## Tests

`lib/fileMentions.test.ts` — 23 cases over the pure module: the quote rule (five of
them), resolution against the listing, the email false positive, folder paths,
punctuation boundaries, dedup, case-insensitivity, the caret query, filtering, and
insertion with caret placement.

**Verified to discriminate:** with `insideQuotes` stubbed to `false`, five cases fail
— four resolution cases and the menu one. The rule is load-bearing, not decorative.

The menu itself is not render-tested: the suite runs `environment: "node"`, where no
effect fires and no keyboard event dispatches. Everything decidable as a string rule
was moved into the pure module precisely so it could be covered there.
