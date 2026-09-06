# file-preview-in-pane — Specification

**Status:** Implemented (2026-09-06), both slices. See Reconciliation at the end.
**Size:** Large — the preview's home changes, its format list roughly triples, and
two lazy dependencies arrive.
**Repo:** `crab-exoskeleton-webapp` only.

---

## Problem

Two complaints, one surface.

**The list of previewable formats is short.** `PREVIEW_KINDS` (`lib/media.ts`) holds
image, `md`, `txt`, `csv` and `pdf`. Everything else — a Python script, a shell
script, a `.docx` report, a spreadsheet — is download-only, so reading what the agent
just wrote means leaving the browser.

**Reading blocks the chat.** `FilePreview` is a modal. Its own doc explains why:
*"An overlay rather than a third pane in the files sidebar: that sidebar is a two-slot
track whose default width is 280px, so a third destination would mean reworking its
geometry to arrive at a column too narrow to read a document in anyway."* Half of that
is no longer true — the panel now opens at a third of the viewport
(`right-rail-discoverability`, second pass) — and the half that remains is about the
track, not about width.

## Goal

Read a document beside the conversation, not on top of it, and read the formats the
agent actually produces.

## Non-goals

- **Not an editor.** Every pane here is read-only, like the code blocks in the chat.
- **Not rendering member HTML.** See FR-1.3 — this widens what can be *shown* without
  widening what can be *executed*.
- **Not a converter service.** Everything renders in the browser; the proxy keeps
  serving bytes as `application/octet-stream`.

---

## Slice 1 — read in the pane, and every text/code format

### FR-1 — The format list

- **FR-1.1** `previewKind` gains `"code"`. Any extension whose alias resolves to a
  grammar `highlight.js` has (`isKnownGrammar`) previews as code: python, shell, ts,
  js, go, rust, ruby, sql, yaml, toml, ini, dockerfile, makefile, xml, and the rest of
  the alias table. — DEC-1
- **FR-1.2** Extensions that are plain text with no grammar (`log`, `env`) keep
  previewing as `text`.
- **FR-1.3 — This does not spend the origin's safety posture.** Code and text render
  as ESCAPED text through the existing highlighter, never as markup. `html` and `htm`
  alias to the `xml` grammar and are therefore shown as **source**. A member's file
  still cannot execute anything from this origin, which is the invariant
  `lib/media.ts` documents and the reason the list was short in the first place.
- **FR-1.4** The 2 MB text ceiling (`PREVIEW_TEXT_MAX`) applies unchanged to code.

### FR-2 — Where a document opens

- **FR-2.1** The document renders in the files detail pane, in place of the tree. The
  track keeps its two slots and its exact half-slide. — DEC-2
- **FR-2.2** The header's back control is a two-step stack: document → tree → menu.
- **FR-2.3** The chat stays usable with a document open: the pane is beside it, not
  over it. On mobile the pane is still the 92vw overlay, so "beside" is "instead of",
  unchanged from today.
- **FR-2.4** The modal is gone. Both entry points — the files tree and an attachment
  chip in the transcript — open the pane.

### FR-3 — Opening from the transcript

- **FR-3.1** Clicking an attachment chip opens the sidebar on the files section with
  that document, rather than a modal over the conversation.
- **FR-3.2** The chip does not receive a callback threaded through the message tree.
  It publishes on a module-scope channel, the way `notifyConversationsUpdated` and the
  turn store's listeners already work, and `ChatView` subscribes. — DEC-3

## Slice 2 — docx and xlsx

- **FR-4.1** `.docx` previews through `mammoth`, imported dynamically. Its HTML output
  passes a short tag/attribute allowlist before rendering — mammoth's output is derived
  from a member's file, so it is untrusted markup until it is filtered. — DEC-4
- **FR-4.2** `.xlsx` previews through `exceljs`, imported dynamically, as a table of
  **values**: no formula is evaluated and no macro is read.
- **FR-4.3** A workbook with several sheets offers a sheet switcher.
- **FR-4.4** Both imports are dynamic, like the highlighter's grammars, so a
  conversation that never opens a document pays nothing for them.
- **FR-4.5 — SheetJS from npm is rejected, on measurement.** `npm view xlsx version`
  reports `0.18.5` as `latest`; the prototype-pollution fix (CVE-2023-30533) ships from
  0.19.3, which SheetJS distributes from its own CDN and does not publish to npm.
  `exceljs@4.4.0` is current on the registry. — DEC-5

---

## Decisions

| ID | Decision |
| --- | --- |
| DEC-1 | The format list is derived from the highlighter's alias table rather than enumerated again. Two lists of languages is two lists that drift |
| DEC-2 | The document replaces the tree inside the existing detail slot. Rejected: a third slot (`w-[300%]`, thirds) — it reworks a geometry that is exactly half everywhere, and every animation and test on it, to keep a tree visible that the reader is not reading |
| DEC-3 | A module-scope channel for "open this file", not a prop threaded from the message renderer to the shell. The codebase already signals across the tree this way, and the alternative touches every component between a chip and the view |
| DEC-4 | mammoth's HTML is filtered, not trusted. It is generated from the member's own file, and the whole point of FR-1.3 is that this feature does not become the way arbitrary markup renders from this origin |
| DEC-5 | `exceljs`, not SheetJS — measured, not assumed. See FR-4.5 |

## Traceability

| ID | Verified by |
| --- | --- |
| FR-1.1 | Unit: `previewKind` for `py`, `sh`, `ts`, `go`, `sql`, `yml`, `Dockerfile`-style names; and null for an unknown extension |
| FR-1.3 | Unit: `html` previews as code, and the renderer is the escaping one |
| FR-2.1 / FR-2.2 | Component: with a document open the tree is not rendered, and the back control returns to it before returning to the menu |
| FR-3.1 / FR-3.2 | Unit: the channel delivers to a subscriber; component: a chip click publishes |
| FR-4.1 | Unit: the sanitizer keeps a paragraph and drops a `<script>`, an `onclick` and a `javascript:` href |
| FR-4.2 | Unit: a workbook's rows come back as values |

---

## Reconciliation (what shipped, 2026-09-06)

Both slices, each task's test written first.

### Slice 1

| What | Where |
| --- | --- |
| `languageForFile(name)` — the grammar for a file, from the highlighter's own alias table | `lib/code-highlight.ts` |
| `previewKind` gains `"code"`, plus `log`/`env` as text | `lib/media.ts` |
| `FilePreview` is a BODY: no overlay, no dialog role, no header, no Escape handler; renders code through the chat's own `CodeBlock` | `app/chat/file-preview.tsx` |
| The panel hosts it in the files detail slot, with a two-step back stack and the download control in its header | `app/chat/uploads-sidebar.tsx` |
| The transcript's attachment chip publishes a request instead of opening an overlay | `app/chat/media-preview-bus.ts`, `attachment-button.tsx`, `chat-view.tsx` |

### Slice 2

| What | Where |
| --- | --- |
| `mammoth` (dynamic) → HTML → allowlist → the pane | `lib/docx-html.ts`, `file-preview.tsx` |
| `exceljs` (dynamic) → sheets of values, row-capped at 500 and said so | `lib/sheet-preview.ts` |
| `previewKind` gains `docx`/`xlsx`; `.doc`/`.xls` stay download-only — neither library reads them | `lib/media.ts` |
| `types/mammoth-browser.d.ts` — mammoth ships no types for the browser bundle, and the Node entry reaches for `fs` | new |

### Asked for during implementation, and shipped with it

- **The name is the link.** The eye icon on hover is gone: a member looking for a file
  looks at its name, so the name opens it. A file with no preview keeps a plain label —
  a link that does nothing is worse than no link.
- **A name that cannot be previewed is dimmed** (`text-fg-muted`), so which names are
  controls is visible rather than discovered by clicking.
- **The type glyphs are coloured per group.** One muted tone for every type made a
  column of identical grey marks, which is a column whose names get read one at a time.
  `unknown` stays muted: a confident colour on a type we did not recognise would state
  something we do not know.

### Verification

1416 tests green across 112 files; `next build` clean; `tsc --noEmit` at the same four
pre-existing errors in unrelated test files.

**Not covered by tests, and stated instead:** the docx and xlsx *renderers* are exercised
through their pure halves — the sanitizer's allowlist and `readWorkbook` against a real
workbook written by exceljs itself. The components that call them are not, because jsdom's
`Blob` has neither `text()` nor `arrayBuffer()`, which is also why the pane suite feeds a
blob-like stub. What that leaves unverified is the wiring between a fetched blob and each
library, and the first live open of a `.docx` is what checks it.
