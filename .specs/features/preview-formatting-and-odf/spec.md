# preview-formatting-and-odf — Specification

**Status:** Implemented (2026-09-06). See Reconciliation at the end.
**Size:** Large — two small rendering fixes and one new reader, the last of which adds a
dependency and a format family.
**Repo:** `crab-exoskeleton-webapp` only.
**Builds on:** `features/file-preview-in-pane`, which moved the preview into the detail
pane and widened its format list. This fixes what that feature *shows* rather than
*which* files it shows — plus the one family it left out.

---

## Problem

Three complaints about the same pane, with three unrelated causes. All three were
located in the code before this spec was written; none is a guess.

### 1. Code and config files render as one line

`app/chat/file-preview.tsx` renders the `code` kind as a bare `<CodeBlock>`:

```tsx
<div className="p-3">
  <CodeBlock code={text} className={language ? `language-${language}` : undefined} />
</div>
```

`CodeBlock` returns a `<code>` element and nothing else — deliberately, because in the
chat its `<pre>` wrapper comes from the markdown renderer (`message-content.tsx:186`,
the `pre` component). The preview has no markdown renderer, so it supplies no `<pre>`,
and `globals.css` is Tailwind with preflight and carries no `pre`/`code` rule of its
own. A bare `<code>` therefore keeps `white-space: normal`, every newline collapses to a
space, and a `.yaml`, `.json`, `.ts` or `.sql` file arrives as a single unreadable
paragraph.

This is the whole `code` kind — which, per `previewKind`, is *everything* resolved
through the highlighter's alias table. The `text` kind (`txt`, `csv`, `log`, `env`) is
unaffected: it has its own `<pre className="whitespace-pre-wrap">` and always did. That
asymmetry is why the bug survived the feature that shipped it.

### 2. A .docx renders with no typography at all

`mammoth` maps Word's structure correctly — its default style map
(`node_modules/mammoth/lib/options-reader.js`) covers `Heading 1`–`Heading 6` in three
spellings, ordered and unordered lists to five levels, `Strong`, footnotes and
hyperlinks — and `sanitizeDocxHtml` keeps every one of those tags. So the *markup*
arriving in the DOM is a real document: `<h1>`, `<ul>`, `<strong>`, `<table>`.

It is then styled by the class `docx-body`, **which does not exist**. No rule anywhere in
the repository defines it. Under Tailwind's preflight `h1`–`h6` inherit their parent's
size and weight and `ul`/`ol` lose their markers and padding, so a structured report
paints as an undifferentiated wall of text — visibly worse than the same content as
markdown, which goes through `MessageContent`'s fully specified `COMPONENTS` table.

The cause is a dangling class name, not a conversion failure. Established by reading
mammoth's default map, not assumed.

### 3. LibreOffice files cannot be opened at all

`PREVIEW_KINDS` has `docx` and `xlsx` and nothing else from the office families. `.odt`,
`.ods` and `.odp` return `null` from `previewKind`, so they keep the download-only menu.
An agent that writes with LibreOffice, or a member who uploads from it, has no way to
read the file in the browser.

The gap shows in the sidebar too. `FILE_TYPE_GROUPS` knows `ods` (as `sheet`) but has
never heard of `odt`, `odp` — or, as it turns out, `docx` and `doc`, which have been
falling through to the neutral `unknown` glyph since that table was written.

## Goal

A previewed file looks like what it is: code keeps its lines, a Word document keeps its
headings, and the OpenDocument formats can be opened at all.

## Non-goals

- **Not an editor.** Every pane here stays read-only.
- **Not a fidelity renderer.** A `.docx` or `.odt` preview is a readable rendering of the
  document's *structure*, not a reproduction of its page layout. No page breaks, no
  columns, no fonts from the file, no positioned graphics. That is already true of the
  `.docx` path and is not changed by making it legible.
- **Not rendering member markup.** FR-1.3 of `file-preview-in-pane` still holds: nothing
  a member uploads executes from this origin. Every path added here produces either
  escaped text or markup that has been through `sanitizeDocxHtml`'s allowlist.
- **Not a converter service.** Everything is read in the browser; the proxy keeps
  serving `application/octet-stream` with `Content-Disposition: attachment`.
- **Not the pre-2007 binary formats.** `.doc` and `.xls` stay download-only, for the
  reason `lib/media.ts` already records: no library here reads them, and failing loudly
  is worse than an honest download.

---

## FR-1 — Code keeps its lines

- **FR-1.1** A `code` preview renders inside a `<pre>`, so newlines and indentation
  survive. The wrapper goes at the call site in `file-preview.tsx`; `CodeBlock` is
  **not** changed. — DEC-1
- **FR-1.2** The wrapper scrolls horizontally rather than wrapping (`overflow-x-auto`).
  Indentation is column-significant in YAML, and the readability of one long line is
  worth less than the shape of the block. This deliberately differs from the `text`
  kind, which wraps. — DEC-2
- **FR-1.3** The code pane matches the chat's fenced blocks in font, size and surface,
  reusing the same `codeText({ block: true })` recipe rather than a second one.
- **FR-1.4** Highlighting, the grammar lookup and the 2 MB ceiling are unchanged.

## FR-2 — A .docx reads like the markdown beside it

- **FR-2.1** `docx-body` becomes real styling: headings differentiated by size and
  weight, lists with their markers and indent restored, paragraph rhythm, blockquotes,
  tables with borders, `<pre>`/`<code>`, and `<hr>`.
- **FR-2.2** The scale is **derived from `message-content.tsx`'s `COMPONENTS`**, not
  invented. The stated requirement is parity with markdown; two independently authored
  scales would drift the first time either was touched. — DEC-3
- **FR-2.3** It is expressed as Tailwind arbitrary variants on the container
  (`[&_h1]:…`), colocated with the element that uses it, rather than as a class in
  `globals.css`. — DEC-3
- **FR-2.4** No change to `sanitizeDocxHtml`. The allowlist is the security boundary and
  this requirement is about CSS.

## FR-3 — The OpenDocument formats open

- **FR-3.1** `.ods` previews as a spreadsheet, through the **existing** `xlsx` pane:
  sheet tabs, the `SHEET_ROW_CAP` truncation notice and the cell table are reused
  unchanged, because the reader returns the existing `SheetPreview[]` shape. — DEC-5
- **FR-3.2** `.odt` previews as a document, through the **existing** `docx` pane: the
  reader emits HTML, which goes through `sanitizeDocxHtml` and is painted by the FR-2
  styling.
- **FR-3.3** `.odp` previews as a document too, one section per slide: the slide's title
  becomes a heading and its text frames become paragraphs, in document order.
  **Explicitly partial** — a presentation is a visual medium and this shows its *text*.
  Shapes, images, positioning, speaker notes, animations and slide masters are out of
  scope, and the pane says so rather than implying the slide is faithful. — DEC-6
- **FR-3.4** The ODF reader is imported dynamically, like `mammoth` and `exceljs` before
  it: a conversation that opens no OpenDocument file downloads no ODF reader and no zip
  reader.
- **FR-3.5** `FILE_TYPE_GROUPS` gains a `document` group holding `doc`, `docx`, `odt`,
  `rtf`; `odp` joins it as well, and `ods` keeps `sheet`. The sidebar glyph then agrees
  with what can now be opened, and `.docx` stops showing the neutral glyph.
- **FR-3.6** The new group earns its width by varying — a distinct icon and tone in
  `FILE_TYPE_ICONS`/`FILE_TYPE_TONE`, neither of which may collide with an existing
  group's. `fileTypeGroup`'s own rule stands: a confident wrong glyph is worse than a
  neutral one.
- **FR-3.7** The 2 MB text ceiling does not apply: like `docx`/`xlsx`, these are read as
  binary, and their own row and size caps govern.

## FR-4 — Safety is unchanged

- **FR-4.1** ODF content is member-supplied, so `.odt`/`.odp` HTML is built from an
  explicit allowlist of ODF elements and then passed through `sanitizeDocxHtml` anyway —
  two filters, because the second is the one with the suite and the posture behind it.
- **FR-4.2** Nothing in the ODF path follows an external reference: no `xlink:href` that
  is not a plain web link, no embedded object, no macro, no `<style>`, no image bytes
  pulled from elsewhere in the archive.
- **FR-4.3** Formula cells in `.ods` show their stored value, matching the `.xlsx`
  reader's documented behaviour.

---

## Decisions

- **DEC-1 — The `<pre>` goes at the call site, not in `CodeBlock`.**
  `CodeBlock` is shared with the chat, where `message-content.tsx` already supplies the
  `<pre>`. Moving the wrapper inside would nest `<pre>` in every chat message. The
  preview is the surface missing a wrapper, so the preview grows one.

- **DEC-2 — Code scrolls, text wraps.**
  Two kinds, two behaviours, and it is intentional. A `.log` or `.txt` is prose whose
  line breaks are incidental; a `.yaml` or `.py` is a structure whose columns carry
  meaning. Wrapping the second destroys the thing the member opened it to see.

- **DEC-3 — The docx scale is derived from the markdown renderer's, and lives next to
  the element.**
  The complaint that opened this work was comparative — the markdown looked better — so
  the target is that renderer's scale, not a fresh judgement about typography. Kept as
  arbitrary variants on the container so the two sit in files one change can reach; a
  `globals.css` class would put the docx scale a repository away from the markdown one
  it is meant to track.

- **DEC-4 — `jszip`, not a new zip library.**
  An OpenDocument file is a zip whose `content.xml` holds the document. `jszip` is
  **already in the lockfile**, pulled in by `exceljs`, so promoting it to a direct
  dependency adds nothing to install and lets both lazy chunks share one copy. `fflate`
  is smaller in isolation but would be a *second* zip implementation shipped alongside
  the one `exceljs` already carries — the wrong trade in a bundle this repository
  accounts for as carefully as `code-highlight.ts` does its grammars. Declared directly
  rather than used transitively, because depending on a dependency's dependency is a
  break waiting for `exceljs` to change its mind.

- **DEC-5 — `.ods` returns `SheetPreview[]`, so it needs no UI.**
  The spreadsheet pane — tabs, truncation notice, cell table, `title` tooltips — is
  already written and already tested. A reader that returns the shape it consumes makes
  the whole of `.ods` a `lib/` change plus a one-line branch in the component. It is the
  cheapest of the three ODF items and lands first among them.

- **DEC-6 — `.odp` is included, and its limits are stated in the pane.**
  "LibreOffice files" plainly means Writer, Calc *and* Impress, and silently shipping two
  of three would answer the request only partly. But a presentation renderer is a third
  surface, and pretending a text dump is a slide would be its own defect. The compromise:
  reuse the ODF text walker `.odt` needs, group by `draw:page`, and label the result as a
  text extraction so nobody mistakes it for the deck.

- **DEC-7 — One ODF parser, three entry points.**
  `.odt`, `.ods` and `.odp` are the same container and the same XML vocabulary; what
  differs is which body element the walk starts from (`office:text`, `office:spreadsheet`,
  `office:presentation`). Three separate parsers would triplicate the zip handling and
  the style resolution for no gain.

- **DEC-8 — Bold and italic come from the automatic-style table, not from tag names.**
  ODF carries no `<strong>`. Emphasis lives in `<style:style>` entries in
  `office:automatic-styles`, referenced by `text:style-name` on a `<text:span>`. The
  reader resolves that table once per document and maps `fo:font-weight: bold` and
  `fo:font-style: italic` onto `<strong>`/`<em>`. Skipping this is what makes the naive
  ODF extraction look worse than the `.docx` path it sits beside.

---

## Verification

- A multi-line `.yaml` body renders with its newlines intact, asserted on the rendered
  output — that is the regression that hid here.
- `CodeBlock` still emits no `<pre>` of its own, so the chat is unchanged.
- The docx container carries the heading, list and table rules, and its scale matches the
  markdown renderer's tokens.
- The ODF reader turns a fixture `content.xml` into the expected rows and HTML,
  including a repeated column (`table:number-columns-repeated`), a nested list, a heading
  level, a bold span resolved through the automatic-style table, and a slide boundary.
- `sanitizeDocxHtml`'s existing suite passes unchanged.
- `yarn test` green; `yarn build` clean.

---

## Reconciliation

Everything specified was built. What the work changed about the spec:

- **FR-3.5/FR-3.6 were written around a gap that turned out to be larger.** The draft
  said `FILE_TYPE_GROUPS` "has never heard of `odt` or `odp`". It has never heard of
  `docx` or `doc` either — no word-processor extension was in that table at all, so a
  Word file has been drawing the neutral `unknown` glyph since the table was written,
  long before any of this. The new `document` group therefore fixes a pre-existing defect
  as well as the new one. `ods` deliberately stays in `sheet`: a Calc file is a
  spreadsheet before it is a LibreOffice file, and the group is what a member
  distinguishes at a glance.

- **The kinds did not collapse.** The draft left open whether `.odt` should simply map to
  the `docx` kind. It does not: the kind is what selects the READER (mammoth, exceljs or
  the ODF walk), so collapsing them would have moved that decision out of `PREVIEW_KINDS`
  and into the component. `isDocumentKind`/`isSheetKind` express "which pane paints it"
  instead, and the component branches on those.

- **DEC-8 was added during implementation, not during specification.** The first draft of
  the reader mapped tags only, and a bolded ODF run has no tag — emphasis is a reference
  into `office:automatic-styles`. That is the single detail separating a readable `.odt`
  from one that looks worse than the `.docx` beside it, so it became a decision rather
  than an implementation note.

- **Two padding defects were found by the fixtures, not by reasoning.** An `.ods` row is
  stored out to the sheet's full width and the sheet out to its full height, so a file
  with one used cell arrives as `table:number-columns-repeated="1020"` inside
  `table:number-rows-repeated="1048570"`. Trailing empties are trimmed and empty rows are
  buffered rather than emitted, which is what keeps a blank row BETWEEN two real ones
  while dropping the million after the last one.

- **`text:tracked-changes` had to be dropped explicitly.** The walk recurses into unknown
  elements by default (the same choice `sanitizeDocxHtml` documents for unknown
  wrappers), and that default would have pasted a reviewer's DELETED sentences back into
  the document. It is in `DROP` with a test naming the reason.

**Verified:** `yarn test` — 114 files, 1452 tests, green. `yarn build` clean.
`npx tsc --noEmit` reports no error in any file this feature touched (four pre-existing
errors remain in unrelated test files). JSZip's chunks appear in no page entry of
`.next/app-build-manifest.json`, so FR-3.4 holds: a conversation that opens no
OpenDocument file downloads neither the reader nor the zip library.

**Not done, and deliberately:** `yarn lint` cannot run in this repository — `next lint`
has no ESLint config and drops into an interactive setup prompt. That predates this work
and was left alone.
