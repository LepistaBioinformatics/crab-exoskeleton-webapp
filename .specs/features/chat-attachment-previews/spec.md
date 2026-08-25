# chat-attachment-previews — Spec

**Status:** Implemented (tests + build green; runtime-unverified until deploy)
**Size:** Medium (one new component, three surfaces, one extraction)
**Repo:** `crab-exoskeleton-webapp` only. Nothing in the proxy changes — the media
route already serves the bytes an `<img>` needs.

---

## Problem

An attachment is a NAME. A paperclip glyph, the filename, and nothing else — in
the composer before sending, and in the transcript afterwards. A member who
pasted a screenshot cannot tell which screenshot it was without opening it; a
member scrolling back through a conversation sees a row of identical chips where
the pictures should be.

The information is already reachable — `mediaUrl` returns a URL an `<img>` can
point straight at, and `FilePreview` already renders the file in full — so the
chip is not protecting anything. It is just the shape the first version had.

## Goal

An image attachment looks like the image. Everything else looks like what it is:
its type, its name, its size.

## Non-goals

- **Not** a PDF thumbnail. Rendering page one needs a PDF library in the chat
  bundle (`FilePreview` uses `<object>`, which cannot produce a thumbnail).
  Considered and refused — DEC-3.
- **Not** a text snippet card. A body preview means one request per text
  attachment and a card whose height depends on what it fetched. Refused for the
  same reason: the type, the name and the size answer "what is this" already.
- **Not** a change to what an attachment IS. The `[anexo: uploads/…]` marker, the
  parsing, the upload path and the download route are untouched.

---

## Requirements

### Images

- **FR-0** "Image" means `previewKind(path) === "image"`, **not**
  `fileTypeGroup(path) === "image"`. The group counts `.svg`; `PREVIEW_KINDS`
  deliberately does not. The proxy serves every file as
  `application/octet-stream`, and a browser sniffs raster bytes inside an `<img>`
  but demands a real `image/svg+xml` for SVG — so an inline SVG would always fail
  to decode and fall through FR-5. Sharing the predicate with the menu's Preview
  item also means the two can never disagree about the same file.
- **FR-1** Every attachment is a **fixed square tile** with a caption beneath it:
  128px in the transcript, 96px in the composer. An image fills it
  (`object-fit: cover`); anything else centres its type glyph in it.

  Revised after use — the first version capped the image at 320×240 and let the
  tile take the shape of what was inside. That is not a layout: a portrait
  screenshot sat in a band of empty space, a wide one was simply too big, and a
  long filename made the caption wider than the picture it described. A fixed
  square makes every attachment the same object, which is also what lets a row of
  them scroll as a row.
- **FR-1.1** The caption is bounded by the **tile**, never by the text: same width,
  `truncate`, with the full name on the tile's `title`.
- **FR-2** The `<img>` points **straight at `mediaUrl`**. The route authenticates
  from the session cookie, so a plain `src` needs no fetch, no blob and no
  revocation, and the browser gets to stream and cache it. (This is the property
  `mediaUrl`'s own comment records; `<iframe>` may not, which is why the PDF
  preview goes through a blob.)
- **FR-3** `loading="lazy"`. A long transcript can hold dozens of images and must
  not request them all on mount.

  **Accepted cost, recorded so nobody reads FR-12 as free:** there is no thumbnail
  endpoint. Every preview — the 320px one in the transcript and the 20px one in the
  files pane — fetches the **full bytes**, bounded only by `mediaMaxBytes` (10 MiB
  today, and `admin-managed-storage-limits` will make that administrable and
  probably larger). Laziness bounds it to what is on screen; scrolling a pane full
  of photographs still pulls each one at full size. A resizing endpoint is the fix
  if that ever bites, and it is a proxy feature, not a webapp one.
- **FR-4** `alt` is the filename. It is what a screen reader has to work with, and
  what appears if the bytes never arrive.
- **FR-5** A file that FAILS to decode falls back to the type card (FR-6). This is
  not defensive padding: any extension now uploads
  (`unrestricted-upload-types`), and an extension can lie about its bytes — that
  was the whole reported symptom behind that feature. A broken-image glyph where
  a preview was promised is worse than the card that would have been there
  anyway.
- **FR-6** Clicking an image opens **`FilePreview`** directly, not the two-item
  menu. Clicking a picture means "show it bigger", and `FilePreview` carries the
  download control, so nothing is lost by skipping the menu.

### Everything else

- **FR-7** A non-image attachment renders as a card: the type glyph, the filename,
  and the size when the surface knows it. The glyph is the one the files pane
  already uses (`FILE_TYPE_ICONS` over `fileTypeGroup`) — pdf, sheet, archive,
  code, audio, video, markdown, text, and the neutral file for `unknown`.
- **FR-8** Clicking it keeps the **existing menu** (Preview when the format allows
  it, Download always). Unlike an image, a card is not itself the content, so the
  choice still means something.
- **FR-9** Size is shown **only where it is known**. The composer has it from the
  upload response and the files pane has it from the listing; a transcript
  `[anexo: …]` marker carries a path and a name and nothing else, and fetching a
  listing to caption a chip is a request bought for a parenthesis.

### Surfaces

- **FR-10** **Composer**, before sending — the point of a preview here is noticing
  the wrong screenshot before it is sent. The remove (✕) control sits **inside** the
  square's top corner: an offset corner is the first thing a scrolling container
  clips.
- **FR-10.1** Both attachment rows — the composer's and the transcript's — are **one
  row that scrolls sideways** (`overflow-x-auto`), not a wrapping grid. Fixed-width
  tiles mean enough attachments are wider than the chat column, and wrapping answers
  that by growing DOWNWARD, which pushes the input toward the top of the screen
  exactly when someone has a lot to send. A wide table and a code block already
  scroll this way inside a message.
- **FR-11** **Sent messages** — every `[anexo: …]` marker the transcript carries,
  whoever authored it. One renderer, one code path, no per-role branch.
- **FR-12** **Files pane rows**: an image row shows a thumbnail in place of its
  type glyph, lazily, at **20px** — the row's existing line height, so the row does
  not grow. The column is 280px wide and a taller row means fewer files visible,
  which is what that pane is for. `object-fit: cover`, not `contain`: at this size
  a letterboxed image is a grey box with a stripe in it, while a crop of the middle
  still reads as "the blue chart".
- **FR-13** `tone="chip"` survives as a variant. It is what a narrow surface
  should use, and removing it would leave no compact form at all.

### Shared code

- **FR-14** `FileTypeIcon`, `FILE_TYPE_ICONS` and `formatSize` are extracted from
  `uploads-sidebar.tsx` into a module both it and the new component import. Two
  copies of the glyph table is how a new file type comes to be drawn one way in
  the sidebar and another in the chat.

---

## Decisions

- **DEC-1 — a click on an image opens the full preview, not a menu.** The menu
  exists to disambiguate "show me" from "save it". A picture that is already
  showing has no such ambiguity left.
- **DEC-2 — the composer's cap is smaller than the transcript's.** Same component,
  different bound: the transcript is a scrollable history where a 320px image is
  content; the composer is a fixed row above the input where the same image is
  furniture.
- **DEC-2.1 — a scrolling row, not a deck.** Overlapping the tiles like a hand of
  cards was the other candidate offered. It was refused: a deck hides files, and the
  remove control of a covered one cannot be reached — the composer's row exists
  precisely so a wrong file can be spotted AND taken back out.
- **DEC-3 — no PDF thumbnails.** The library cost lands on every chat page load,
  for a picture of a page of text nobody reads at 320px. The type card says "PDF,
  1.2 MB" in less space and with no bundle.
- **DEC-4 — no size in the transcript.** See FR-9. The alternative is a listing
  request per message, or threading the sidebar's listing through the message
  renderer; both are a lot of machinery for a caption.

---

## Acceptance

1. Paste a screenshot → the composer shows the picture, not `pasted-….png`.
2. Send it → the transcript shows the picture, capped at 320px.
3. Click it → the full preview opens, with Download inside.
4. Attach a PDF → a card with the PDF glyph, its name and its size; clicking it
   still offers Preview and Download.
5. Rename a `.txt` to `.png` and attach it → the preview fails to decode and the
   card appears instead; nothing is broken on screen.
6. The files pane shows thumbnails for images with rows the same height as before.
7. An old conversation with `[anexo: …]` markers renders pictures without a
   listing request.

---

## Reconciliation

Shipped as specified. What the implementation settled:

- **FR-0 was not in the first draft** and is the decision that mattered most. The
  obvious predicate (`fileTypeGroup`) would have rendered `.svg` inline, where it
  can never decode.
- **Layout shift, fixed before it existed.** The image box is a **fixed footprint**
  (`min-height` as well as `max-height`), not just a cap. An `<img>` with no
  intrinsic dimensions reflows the transcript as it decodes, and the
  scroll-to-latest that runs before that would be pushed off the bottom by every
  picture in the message.
- **Removal moved to the corner.** The composer's ✕ is absolutely positioned over
  the card rather than sitting in the line, so an image and a type card carry it in
  the same place.
- **`Uploading…` was hard-coded English** in the row being edited — the last
  untranslated string there. Now `chat.composer.uploading`, with distinct en/pt
  values.
- **One test was edited, deliberately.** `uploads-file-row.test.tsx`'s
  "different glyph for a different file type" would have kept passing **vacuously**:
  it read the row's first `<svg>`, and once an image row's leading mark became an
  `<img>`, that first `<svg>` was the row's *preview control*. It is now two tests —
  an image row shows a lazily-loaded thumbnail pointed at the media route, a
  spreadsheet row shows a glyph and no `<img>`. Every other sidebar test passed
  unedited, which is what says the FR-14 extraction was a pure move.

**Not verified:** that the agent's own deliveries reach the transcript as
`[anexo: …]` markers at all. `FILE_DELIVERY.md` tells the agent a chip is "added by
the layer between you and the user", but no marker injection was found in the proxy
— so agent-produced files may only ever appear in the files pane, which this change
covers too. Either way the message renderer needed no per-role branch.

**Verification:** `yarn test` 1372 tests in 102 files green — 11 new in
`attachment-preview.test.tsx` (including the composer's smaller box, the one tone
with its own geometry), one new in `composer-paste.test.tsx` covering the FR-10
wiring end to end, and the two rewritten row tests — plus `yarn build` clean.

### Revision after use: the tile geometry

The first pass shipped a capped box rather than a fixed one, and a wrapping row. In
use that produced three complaints, all the same root cause — **the tile had no shape
of its own**:

1. too big (320px of transcript width per attachment),
2. empty space around a picture narrower than its own caption,
3. and a row that grew downward as attachments were added.

Fixed by giving the tile a size instead of a maximum: a 128px square in the
transcript, 96px in the composer, `object-cover` inside it, the caption truncated to
the same width, and the row scrolling sideways. The remove control moved from outside
the corner to inside it, because `overflow-x` clips what leaves the box.
