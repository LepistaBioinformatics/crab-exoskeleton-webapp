# 011 — The PDF preview stops offering an edit it cannot keep

## What the owner reported

> In the PDF file preview, disable the editing options — there is no way to save after you
> edit.

## Why it could not be a one-liner

The pane handed the file to `<object type="application/pdf">`, which is the browser's own
viewer, and every current browser's viewer ships annotation tools. The preview reads bytes
out of the workspace and has nothing that writes them back, so a highlight or a typed note
could only ever be discarded. The tools were an offer the product could not keep.

**Nothing in the page can switch them off.** The viewer runs in a document of another
origin, so it can be neither styled nor scripted from here.

| Browser | What is available |
|---|---|
| Firefox (pdf.js) | no URL parameter at all — the open request is mozilla/pdf.js#19411, and `pdfjs.annotationEditorMode` is a user preference, not a page's to set |
| Chrome / Edge | `#toolbar=0`, which removes the whole bar — zoom, page navigation and the viewer's own download with it — and is ignored by Firefox |

So the pane draws the pages itself. That is the only answer that is the same in every
browser, and it was the owner's choice between three offered.

## What it is now

`pdfjs-dist` rasterises each page onto a canvas, in a scrolling column, with a footer
carrying the two things the browser's bar had that anyone wanted: where you are in the
document, and how big it is. No toolbar, no editor, nothing to lose.

- **Pages draw when they are nearly on screen.** A 200-page report is 200 rasterisations,
  and a member who opened it to read the first page should not wait for the other 199. The
  placeholder carries page one's aspect ratio, so the scrollbar is honest before anything
  is drawn and scrolling does not jump as pages arrive.
- **Drawn at the device's pixel density** and sized down in CSS, or the text is soft on
  every screen that is not exactly 1x.
- **The download fallback survives.** A document pdf.js cannot open is a document to
  download — the same answer the `<object>` gave for a browser with no viewer. Losing it
  would turn an awkward file into a dead pane.

## The worker, which is the part with a real choice in it

`new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url))` — the shape
the bundler recognises, so it emits the worker as a chunk of its own. The alternative
spelling (`GlobalWorkerOptions.workerSrc = new URL(…).toString()`) copies the raw `.mjs`
through as an asset, which is what trips the production minifier in vercel/next.js#61549;
this build has no such failure.

Constructing it is wrapped in try/catch. A browser that refuses the worker must not take
the preview down: without a port pdf.js sets up its own, slower and on the main thread, and
if that fails too the pane lands on the download offer.

## Weight

`/chat` went 267 kB → 270 kB. pdf.js itself is two lazy chunks fetched on the first PDF
opened and never again, so a member who opens none pays nothing.

`pdfjs-dist` pulls `@napi-rs/canvas` (63 MB of native binaries) as an OPTIONAL dependency,
for rendering under Node — which this pane never does. It is not traced into
`.next/standalone`, so it exists in the build stage and not in the runtime image.

## Three things review caught

**A zoom must not re-rasterise the whole document.** `scale` is a prop on every page, so a
flag that latched "this page has been near" meant one press of `+` fired a render for every
page the member had ever scrolled past — dozens of concurrent worker jobs per click on a
long report. The flag follows the page in and out now: only what is on screen re-draws, and
the rest keep the bitmap they have, stretched by CSS, until they come back. "Has been
drawn" is a second flag, because the placeholder must stop forcing a height once the canvas
has one of its own.

**The observers take the scroll container as a prop** rather than finding it with
`closest(".overflow-auto")`. A class name is not a contract: renaming that utility, or
splitting it into `overflow-y-auto`, would have left both observers measuring against the
viewport and broken page tracking with no error anywhere.

**`previewBlobType` is gone.** It relabelled the blob `application/pdf` because a browser
trusts a blob's own type over an `<object type=…>` attribute — which was true, and had
exactly one consumer. pdf.js reads the bytes and never asks what they claim to be, so the
function, its call and its tests went with the `<object>`.
