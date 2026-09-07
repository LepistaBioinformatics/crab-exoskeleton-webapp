# preview-formatting-and-odf — Tasks

Three independent slices. T1 and T2 are small, visible and gate nothing, so they land
first and separately; the ODF work is the only real engineering and must not hold them.

---

## T1 — Code preview keeps its lines  `[P]`

- **What:** Wrap the `code` branch's `<CodeBlock>` in a `<pre>` and give it the chat's
  block-code recipe.
- **Where:** `app/chat/file-preview.tsx`
- **Reuses:** `codeText({ block: true })` and the `pre` styling from
  `app/chat/message-content.tsx`
- **Do not touch:** `app/chat/code-block.tsx` — DEC-1
- **Done when:** FR-1.1 – FR-1.4
- **Tests:** `app/chat/file-preview.test.tsx` — a multi-line body renders with its
  newlines preserved; `code-block.test.tsx` still asserts no `<pre>`.

## T2 — .docx typography  `[P]`

- **What:** Give `docx-body` a real scale, derived from the markdown `COMPONENTS` table.
- **Where:** `app/chat/file-preview.tsx` (arbitrary variants on the container)
- **Reuses:** the size/weight/spacing tokens in `app/chat/message-content.tsx`
- **Done when:** FR-2.1 – FR-2.4
- **Tests:** `app/chat/file-preview.test.tsx` — the container carries heading, list and
  table rules and no longer relies on a class nothing defines.

## T3 — The ODF reader

- **What:** `lib/odf.ts` — unzip, read `content.xml`, resolve `office:automatic-styles`,
  and walk the three body vocabularies. Returns `SheetPreview[]` for `.ods` and HTML for
  `.odt`/`.odp`.
- **Where:** new `lib/odf.ts`, new `lib/odf.test.ts`
- **Depends on:** nothing (parallel with T1/T2), but merged after them
- **Reuses:** `SheetPreview`/`SHEET_ROW_CAP` from `lib/sheet-preview.ts`,
  `sanitizeDocxHtml` from `lib/docx-html.ts`
- **Done when:** FR-3.1 – FR-3.3, FR-4.1 – FR-4.3, DEC-7, DEC-8
- **Tests:** fixture `content.xml` strings inline (house convention — see
  `lib/docx-html.test.ts`): headings, nested lists, bold via automatic style, a table
  with `table:number-columns-repeated`, a row cap, a slide boundary, and a `<script>`
  that must not survive.

## T4 — Wire the formats in

- **What:** `PREVIEW_KINDS` gains `odt`/`odp` → `docx` kind and `ods` → `xlsx` kind;
  `file-preview.tsx` routes those kinds through the ODF reader instead of
  mammoth/exceljs. `jszip` becomes a direct dependency.
- **Where:** `lib/media.ts`, `app/chat/file-preview.tsx`, `package.json`
- **Depends on:** T3
- **Done when:** FR-3.1 – FR-3.4, FR-3.7, DEC-4
- **Tests:** `lib/media.preview.test.ts` — `previewKind` answers for all three
  extensions, case-insensitively.

## T5 — The sidebar glyph

- **What:** `FILE_TYPE_GROUPS` gains a `document` group (`doc`, `docx`, `odt`, `odp`,
  `rtf`); icon and tone added.
- **Where:** `lib/media.ts`, `app/chat/file-visuals.tsx`
- **Depends on:** nothing
- **Done when:** FR-3.5, FR-3.6
- **Tests:** `lib/media.test.ts` — `fileTypeGroup` answers `document` for `.docx` and
  `.odt`, and the icon/tone records stay exhaustive.

## T6 — Gate

- `yarn test` green, `yarn build` clean, `npx tsc --noEmit` clean.
