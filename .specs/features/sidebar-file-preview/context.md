# Sidebar File Preview — decisions

Gray areas resolved with the user before implementation, plus the ones the codebase
resolved on its own.

## Asked

**PDF is in v1.** `next.config.ts` sets no Content-Security-Policy and nothing in
`middleware.ts` adds one, so a `blob:` URL in an `<iframe>` is not blocked and the
browser's built-in viewer does the rendering. Cost is a handful of lines and no
dependency. Accepted with the known limit that a browser without a built-in viewer
falls back to the download link.

**Relative images inside a previewed markdown file are rewritten.** `![](diagram.png)`
in a file that lives at `reports/q2.md` resolves to `reports/diagram.png` and loads
through `/api/media/download`. Left alone, the src resolves against the webapp
origin and renders a broken-image icon — which reads as a bug rather than as a
limit. Cost is a custom `img` component passed to `MessageContent`.

**Non-previewable formats show only "Download file".** No disabled "Preview" item.
The menu stays a one-item menu for `docx`, `zip`, and friends — exactly what it is
today, so nothing regresses and nothing new is explained.

## Decided from the code, not asked

**The preview is a modal overlay, not a sidebar pane.** `uploads-sidebar.tsx`
renders a two-slot track: `w-[200%]` with two `w-1/2` children, slid by
`-translate-x-1/2`. A third destination means rewriting that geometry. And the
panel's `DEFAULT_WIDTH` is 280px with a persisted user width — a column that
narrow cannot show an image or a rendered document. `markdown-editor.tsx` is the
existing full-screen overlay idiom in this codebase (Esc to close, same header
shape), so the preview follows it.

**No second BFF route.** `/api/media/download` already streams bytes with the
upstream `content-type` and already forwards `project`. `downloadMedia` in
`lib/media.ts` was the only caller and it discarded the `Blob` into an anchor
click; the fetch is extracted into `fetchMediaBlob` and both callers share it.

**Raw HTML stays disabled.** `MessageContent` renders agent-authored markdown with
no `rehype-raw` today. A preview surface for files an agent wrote is not the place
to start allowing raw HTML.

**The 2 MB text cap is checked against `Attachment.size`,** which the listing
already carries, so an oversized CSV is refused *before* the request rather than
after `blob.text()` has already frozen the tab.
