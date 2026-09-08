# preview-plain-text-fallback — Specification

**Status:** Implemented (2026-09-07)
**Size:** Medium — one inverted default, one byte sniff, one gutter.
**Repo:** `crab-exoskeleton-webapp` only.
**Builds on:** `features/preview-formatting-and-odf`, which fixed how the pane *renders*
what it opens. This changes *what it agrees to open*, and adds the one affordance a file
pane needs that a chat code block does not.

---

## Problem

### 1. An unrecognised extension is refused outright

`previewKind` answers `null` for any extension not in `PREVIEW_KINDS` and not resolvable
through the highlighter's alias table. `.rst`, `.ndjson`, an in-house `.conf2`, a
`.qwerty` an agent invented five minutes ago — all download-only. So are files with **no
extension at all** (`README`, `CHANGELOG`) and **dotfiles** (`.gitignore`,
`.prettierrc`), because the check keys on a suffix and those have none.

The refusal reads as a safety posture, and `lib/media.ts` argues for it as one. But that
argument does not survive contact with what the code actually does: text renders
**escaped**, inside a `<pre>`, exactly as `.txt` has since the beginning. A member's bytes
cannot become markup from this origin either way. What the refusal really bought was
protection from **mojibake** — a `.zip` decoded as UTF-8 is a screenful of U+FFFD — and
that is a much narrower problem than "unknown extension".

### 2. A code file has no line numbers

The `code` pane is the chat's `CodeBlock` with a `<pre>` around it. That is right for a
fenced block in a message and wrong for a file: a line number is how a member says *where*
something is — to a colleague, or back to the agent. Without one they count.

## Goal

Open the file unless there is a reason not to, and make a code file addressable.

## Non-goals

- **Not rendering member markup.** Unchanged and non-negotiable: everything here is
  escaped text inside a `<pre>`.
- **Not content-sniffing a format.** The byte check answers one question — *is this
  text?* — and never guesses a language or a format from content. The name still decides
  the grammar (`languageForFile`).
- **Not numbering the chat.** A four-line snippet in a message has no line worth
  referring to.
- **Not an editor.** Still read-only.

---

## FR-1 — An unknown extension reads as plain text

- **FR-1.1** `previewKind` falls back to `"text"` instead of `null`.
- **FR-1.2** A name with no extension (`README`) and a dotfile (`.gitignore`) read as
  text. A dotfile is a whole name, not a suffix — `dot > 0`, not `dot >= 0`.
- **FR-1.3** An empty name, and a path ending in `/`, still answer `null`.
- **FR-1.4** A `NEVER_TEXT` set keeps the unambiguously binary formats download-only:
  archives, audio, video, unrenderable images, executables and libraries, fonts, the
  office formats no reader here opens, opaque stores. — DEC-1
- **FR-1.5** The set is conservative. Anything arguable (`.dat`, `.bak`) is left to
  FR-2 rather than guessed at from its name.
- **FR-1.6** Text still renders escaped in a `<pre>`, wrapping, with no formatting — the
  existing `text` pane, unchanged.

## FR-2 — The bytes get the last word

- **FR-2.1** A body destined for a text pane is read as bytes and refused if it contains
  a NUL in its first `BINARY_SNIFF_BYTES` (8 KB) — how `git` decides the same question.
- **FR-2.2** A refusal is a **notice**, not an error: the file is fine, it simply is not
  text. Same quiet treatment the size cap gets, with the download button still there.
- **FR-2.3** The sniff applies to every text-shaped kind, not only the fallback: a `.zip`
  renamed `notes.txt` is caught too.
- **FR-2.4** Line endings are normalised (`\r\n` and lone `\r` → `\n`) on the way in. — DEC-3

## FR-3 — Code and scripts carry line numbers

- **FR-3.1** The `code` pane paints a line-number gutter. The `text`, `markdown` and
  document panes do not.
- **FR-3.2** The gutter is `aria-hidden`, so a screen reader is not read a column of bare
  integers, and `select-none`, which is the standard way to ask a browser to leave the
  numbers out of a copied selection.
  **Stated as the declaration, not as the outcome:** what is asserted is that the
  attributes are there. Whether a copy actually excludes the numbers is a per-browser
  behaviour — `user-select: none` has historically not been honoured for copy in Firefox
  — and nothing here tests it. If numbers turn up in a paste, this line is where to start,
  and the fix is a different mechanism rather than a different value. — DEC-7
- **FR-3.3** It stays put when a long line scrolls the pane sideways (`sticky left-0`),
  which is why the scroll container is the outer element rather than the code column.
- **FR-3.4** A trailing newline terminates the last line rather than opening an empty
  one, so it is not counted. — DEC-4
- **FR-3.5** Numbers and code stay aligned by construction, not by tuning. — DEC-2, DEC-5
- **FR-3.6** Both columns take their font-size and line-height from **one constant**, in
  absolute units. Neither the gutter nor the `<code>` may carry a size of its own. — DEC-5

## FR-4 — Two repository defects found on the way

- **FR-4.1** `.gitignore` said `node_modules/`, which matches a **directory only**. A
  worktree reaching the shared install through a symlink puts a non-directory of that
  name at the root, and one was committed. The pattern loses its trailing slash and the
  symlink is untracked.
- **FR-4.2** `.dockerignore` listed `node_modules`, `.next` and `.git` without `**/`, and
  those patterns are not recursive. A git worktree under `.claude/worktrees/` therefore
  went into the build context — ~500 MB of it. The recursive forms are added, and
  `.claude` is excluded outright.

---

## Decisions

- **DEC-1 — The exclusion list names BINARY formats, not readable ones.**
  Inverting the default inverts what has to be enumerated. Listing every readable text
  format was the old design and it is exactly what failed: the list can only ever speak
  for formats someone thought of, and the complaint was about the ones nobody did. The
  binary set is bounded and slow-moving; the text set is neither.

- **DEC-2 — The gutter is a sibling `<pre>`, not a per-line wrapper.**
  highlight.js returns spans that **cross newlines**, so splitting its output into
  per-line elements means re-opening those spans at each boundary — a well-known source
  of subtly wrong colouring. Two `<pre>` elements that share one font size and one
  line-height stay aligned without anyone maintaining the correspondence.

- **DEC-3 — Line endings are normalised at the boundary.**
  A CRLF file would otherwise number correctly and paint a stray glyph at the end of
  every line. Done once, where the bytes are decoded, rather than in the gutter and the
  body separately — which is the arrangement that lets them disagree.

- **DEC-4 — The trailing newline is dropped from the body the gutter measures.**
  Body and count are derived in one `useMemo` from one string. Deriving them separately
  is how a gutter comes to be one line longer than its file.

- **DEC-5 — One type constant on both columns, in absolute units.**
  Added after the first attempt shipped visibly broken: the numbers ran out before the
  code did. The two columns were sized separately — `text-[0.85em]` on the gutter's own
  `<pre>`, the same `0.85em` on the `<code>` inside the other — which reads like the same
  size and is not. **A block's line boxes are at least as tall as its strut, and the
  strut follows the block's own font-size.** The code column's `<pre>` carried no size,
  so its strut stayed at `1.625 × 1em` while the gutter's was `1.625 × 0.85em`; every
  code line was ~15% taller than its number and the error accumulated down the file.

  Absolute units, not just a shared token, because a relative `em` resolves against
  whatever each column inherits and a unitless line-height re-multiplies per element —
  two columns can agree on the tokens and still disagree on the pixels. A fixed
  `leading-[20px]` makes a line exactly 20px in both, whatever the `<code>` does.

- **DEC-6 — No line-number library.**
  Checked before fixing, because the defect looked like a reason to adopt one.
  `highlight.js`, which is already here, has no built-in numbering.
  `highlightjs-line-numbers.js` is third-party, rewrites the highlighted block into a
  `<table>` by imperative DOM manipulation after the fact — which fights React — and is
  not actively maintained. `react-syntax-highlighter` has `showLineNumbers` ready-made,
  and `shiki` and Prism have equivalents, but each arrives with its own highlighter and
  its own grammars: adopting one would replace the per-grammar lazy loading
  `code-highlight.ts` accounts for byte by byte.

  Decisive point: **all of them align the columns the same way this does**, by giving the
  numbers and the code identical type. There was no missing library, only a CSS defect.

- **DEC-7 — A requirement is written at the level it was actually checked.**
  FR-3.2 first read "copying the pane must yield the code, not the code interleaved with
  numbers", and the only thing behind it was a test asserting the class was present.
  Those are different claims, and the gap is the one this feature has already been caught
  by twice: a style that resolves differently than it reads. Where a spec line cannot be
  verified from here, it now says what WAS verified and names the browser behaviour it is
  relying on, so nobody later reads it as a settled guarantee.

---

## Verification

- `previewKind` answers `text` for unknown extensions, no extension and dotfiles; `null`
  for the binary set and for an empty name.
- `looksBinary` calls text text (including UTF-8 well above ASCII), calls a NUL binary,
  reads an empty file as text, and inspects only the head.
- Rendered in jsdom, a real script shows `1\n2` for a two-line file with a trailing
  newline, a CRLF file counts once, a markdown document has no gutter, and a binary body
  shows the notice and stops the spinner.
- Both columns of the code pane carry one type constant, sized in px, with nothing on the
  `<code>`; and no `.hljs-*` rule in `globals.css` sets a metric — those rules set only
  `color`, `font-style` and `font-weight`, so nothing re-sizes the highlighted spans
  inside one column and not the other.
- `yarn test` — 114 files, 1468 tests, green. `yarn build` clean. `npx tsc --noEmit`
  reports nothing in any file this feature touches.

**Verified on screen, by the user, not by this suite.** The gutter alignment shipped
broken once and the whole suite was green for it — line boxes are a layout property and
jsdom computes no layout, so *every* assertion here is about markup and none is about
pixels. The alignment was confirmed by opening a real file in the running app. Anything
in this feature that depends on layout should be treated the same way: green tests are
not evidence of it.
