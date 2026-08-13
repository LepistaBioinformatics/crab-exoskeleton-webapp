# Sidebar File Preview Specification

## Problem Statement

The workspace files panel (right sidebar → **Files**) can only hand a file back to
the operating system. Clicking a row opens a one-item menu — "Download file" — so
looking at a screenshot the agent produced, or reading a `report.md` it wrote,
means saving the file, leaving the browser, and opening an external application.
The panel already knows the file's name, size and bytes; it just refuses to show
them.

The webapp already renders GFM markdown safely (`MessageContent`, used by the
chat, the canvas timeline and the markdown editor) and already streams file bytes
with their content type (`/api/media/download`). The missing piece is a surface
that puts the two together.

## Goals

- [ ] A member can look at an image, a rendered markdown file, a plain-text/CSV
      file or a PDF **without leaving the webapp** — one click from the files row.
- [ ] Download stays reachable and unchanged for every file, previewable or not.
- [ ] No new runtime dependency, no new BFF route, no new proxy endpoint.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Office formats (`docx`, `xlsx`, `pptx`, `odt`, `ods`, `odp`) | Rendering them needs a parsing library (mammoth/sheetjs) — a dependency and a bundle cost that was not asked for. They keep the download-only menu. |
| Archives (`zip`, `tar`, `gz`, `tgz`, `bz2`, `xz`, `7z`, `rar`) | Listing an archive's entries is a different feature, not a preview. |
| Editing a previewed file | The panel is read-only today; `MemoryEditor` is the editing surface and has its own persistence path. |
| Syntax-highlighted source preview (`.ts`, `.py`, …) | Those extensions are outside `MEDIA_ALL_EXTS` — the proxy rejects them on upload, so they cannot reach this panel. |
| Preview from the `[anexo: …]` chips in the chat transcript | Same component would work, but the ask is about the files panel. The chip uses the same `AttachmentButton`, so it comes along for free where the extension is previewable — see `PREV-08`. |
| A dedicated preview pane inside the sidebar | The sidebar track is a two-slot `w-[200%]` carousel sliding by exactly half (`uploads-sidebar.tsx`), and its default width is 280px. A third slot means reworking that geometry, and 280px is useless for an image. The preview is an overlay instead. |

---

## User Stories

### P1: See an image without downloading it ⭐ MVP

**User Story**: As a member, I want to click an image in the files panel and see
it, so that I can check what the agent produced without saving it first.

**Why P1**: Images are the format where "download to look at it" is most absurd,
and they are the first category in `MEDIA_CATEGORIES`.

**Acceptance Criteria**:

1. WHEN a file's extension is `png`, `jpg`, `jpeg`, `webp` or `gif` THEN the row's
   menu SHALL offer **Preview** above **Download file**.
2. WHEN the member chooses Preview THEN the system SHALL fetch the bytes through
   `/api/media/download` and display them in a modal overlay, scaled to fit the
   viewport without cropping.
3. WHEN the bytes are still loading THEN the overlay SHALL show a spinner rather
   than an empty frame.
4. WHEN the fetch fails THEN the overlay SHALL show the translated error and keep
   a working Download button.

**Independent Test**: Upload a PNG through the panel, click its row, choose
Preview, see the image.

---

### P1: Read a markdown file rendered ⭐ MVP

**User Story**: As a member, I want to open a `.md` file from the panel and read
it formatted, so that the agent's reports are readable where they live.

**Why P1**: The agent writes its deliverables as markdown into `attachments/`;
reading them as raw text in an external editor loses the whole point of markdown.

**Acceptance Criteria**:

1. WHEN a file's extension is `md` THEN the menu SHALL offer Preview.
2. WHEN the member previews a `.md` file THEN the system SHALL render it with the
   same `MessageContent` renderer the chat uses (GFM tables, fenced code with
   highlighting, task lists).
3. WHEN the markdown contains a **relative** image reference
   (`![](diagram.png)`, `![](img/a.png)`, `./x.png`) THEN the system SHALL resolve
   it against the previewed file's own folder and load it through
   `/api/media/download`, so the image renders.
4. WHEN the markdown contains an absolute image URL (`http://`, `https://`,
   `data:`) THEN the system SHALL leave it untouched.
5. WHEN the markdown contains raw HTML THEN the system SHALL NOT render it —
   `rehype-raw` stays out. This preview shows agent-authored content, which is
   exactly why the chat renderer disables raw HTML.

**Independent Test**: Preview a `.md` file containing a table, a fenced code
block and `![](sibling.png)`; all three render.

---

### P1: Read a plain-text or CSV file ⭐ MVP

**User Story**: As a member, I want to open `.txt` and `.csv` files and read them
in place.

**Why P1**: Same one-click expectation, and they need no renderer at all.

**Acceptance Criteria**:

1. WHEN a file's extension is `txt` or `csv` THEN the menu SHALL offer Preview.
2. WHEN the member previews one THEN the system SHALL show its text in a
   monospaced, scrollable, `pre-wrap` block — never interpreting it as markdown.
3. WHEN the listing reports a size above **2 MB** THEN the system SHALL NOT fetch
   the body; it SHALL say the file is too large to preview and offer Download.

**Independent Test**: Preview a small `.csv`, see its raw rows; preview a 5 MB
`.txt`, see the size notice with no network request for the body.

---

### P2: Read a PDF in place

**User Story**: As a member, I want to open a PDF from the panel and page through
it in the browser's own viewer.

**Why P2**: Valuable, and cheap because the browser does the rendering — but it
depends on a viewer the webapp does not control, so it must not be able to break
the other three formats.

**Acceptance Criteria**:

1. WHEN a file's extension is `pdf` THEN the menu SHALL offer Preview.
2. WHEN the member previews a PDF THEN the system SHALL render the fetched blob in
   an `<iframe>` sized to the overlay.
3. WHEN the browser has no built-in PDF viewer THEN the iframe's fallback content
   SHALL offer Download rather than showing a blank frame.

**Independent Test**: Preview a PDF in Chrome and in Firefox; both page through it.

---

### P2: Get out, and get the file anyway

**User Story**: As a member, I want the preview to close the way every overlay in
this app closes, and to be able to download what I am looking at.

**Acceptance Criteria**:

1. WHEN the overlay is open THEN Esc, the backdrop and an explicit close button
   SHALL each dismiss it.
2. WHEN the overlay is open THEN its header SHALL show the file's display name and
   a Download button that reuses `downloadMedia`.
3. WHEN the overlay closes THEN every object URL it created SHALL be revoked.

**Independent Test**: Open a preview, press Esc; reopen, click the backdrop;
reopen, download from the header.

---

## Edge Cases

- WHEN a file's extension is not in the previewable set (`docx`, `zip`, …) THEN
  the menu SHALL show **only** Download — no disabled Preview item, no tooltip.
- WHEN a file has no extension at all THEN it is treated as non-previewable.
- WHEN the extension case differs (`REPORT.MD`, `photo.PNG`) THEN detection SHALL
  match case-insensitively.
- WHEN the workspace is a **project** (`workspace.p` set) THEN every preview fetch
  SHALL carry the `project` query parameter. A preview that omits it reads the
  agent's own workspace and 404s — the recurring defect in this layer.
- WHEN the member previews a second file while one is open THEN the first blob URL
  SHALL be revoked before the second is created.
- WHEN the fetch returns 401 THEN the existing `errorCode` path applies and the
  overlay shows the session-expired copy, same as download does today.
- WHEN a previewed markdown file sits at the tree root THEN relative image
  resolution SHALL produce `uploads/<img>` and not `uploads//<img>`.
- WHEN a relative image reference walks up (`../shared/logo.png`) THEN the
  resolver SHALL normalise the `..` segments rather than sending them upstream.

---

## Requirement Traceability

| Requirement ID | Story | Where | Status |
| --- | --- | --- | --- |
| PREV-01 | P1: Image preview | `file-preview.tsx` (`kind === "image"`, direct `mediaUrl` src) | Implemented — covered by test |
| PREV-02 | P1: Markdown preview via `MessageContent` | `file-preview.tsx` (`kind === "markdown"`) | Implemented — runtime-unverified |
| PREV-03 | P1: Relative image resolution inside markdown | `lib/media.ts:resolveMediaRef` + `message-content.tsx:MarkdownImageContext` | Implemented — covered by test |
| PREV-04 | P1: Text/CSV preview with a 2 MB cap | `lib/media.ts:PREVIEW_TEXT_MAX`, `file-preview.tsx:tooLarge` | Implemented — covered by test |
| PREV-05 | P2: PDF preview in an iframe | `file-preview.tsx` (blob URL, because the proxy sends `Content-Disposition: attachment`) | Implemented — runtime-unverified |
| PREV-06 | P2: Esc/backdrop/close + header Download + URL revocation | `file-preview.tsx` (document keydown, backdrop `onClick`, effect cleanup) | Implemented — partially covered |
| PREV-07 | Edge: non-previewable formats show Download only | `attachment-button.tsx` (`kind && …`) | Implemented — covered by `previewKind` test |
| PREV-08 | Edge: `project` forwarded on every preview fetch | `lib/media.ts:mediaUrl` (single choke point) | Implemented — covered by test |
| PREV-09 | Edge: case-insensitive extension detection | `lib/media.ts:previewKind` | Implemented — covered by test |

**Coverage:** 9 total, 9 mapped, 0 unmapped.

**Gate run:** `npm test` → 70 files / 983 tests pass (baseline was 68 / 960; +23 new).
`npm run build` compiles clean. `npm run lint` is broken in this repo and was not used.

**What is NOT verified:** nothing was exercised against a live stack. The vitest
environment is `node`, so no effect ever fires in a test — which means the fetch paths
(markdown body, text body, PDF blob), the Esc handler and the object-URL revocation are
covered by reading, not by running. First-paint behaviour (image src, the size refusal,
the markdown image rewrite) is genuinely asserted.

---

## Success Criteria

- [ ] Preview of an image, a `.md`, a `.txt`/`.csv` and a `.pdf` all work from the
      files panel with one menu click.
- [ ] `npm test` stays green (baseline: 68 files / 960 tests) with new unit tests
      covering extension detection, relative-image resolution and the size cap.
- [ ] `lib/i18n/parity.test.ts` passes — every new copy key exists in both the EN
      and PT trees.
- [ ] No new package in `package.json`; no new route under `app/api/`.
