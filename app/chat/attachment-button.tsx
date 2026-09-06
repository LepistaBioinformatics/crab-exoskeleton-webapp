"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cva } from "class-variance-authority";
import { Download, Eye, Paperclip } from "lucide-react";
import { downloadMedia, fileTypeGroup, mediaUrl, previewKind } from "@/lib/media";
import { FileTypeIcon, formatSize } from "@/app/chat/file-visuals";
import type { Workspace } from "./fragment";
import { requestPreview } from "@/app/chat/media-preview-bus";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// A clickable file reference, in one of two shapes.
//
// `chip` is the compact original: a paperclip and a name. `card` shows what the file
// IS — the picture itself for an image, and the type glyph with the name and size for
// everything else. An attachment used to be a name and nothing else, which is
// unreadable exactly where it matters most: a member who pasted a screenshot could not
// tell WHICH screenshot without opening it.
//
// Clicking a chip or a card opens a small menu (Preview when the format allows it,
// Download always), portaled to <body> with fixed positioning so it is never clipped by
// an overflow container. Clicking an IMAGE skips the menu and opens the preview — a
// picture that is already showing has no "show me or save it" ambiguity left, and the
// preview carries the download control anyway.
const trigger = cva("inline-flex min-w-0 items-center gap-1 text-left", {
  variants: {
    tone: {
      chip: "max-w-full rounded-lg border border-current/25 px-2 py-1 text-xs hover:bg-current/10",
    },
  },
  defaultVariants: { tone: "chip" },
});

// A TILE: one square, one caption, the same footprint whatever the file is.
//
// Square and FIXED, both deliberately. A box that only capped the image left the
// tile the shape of whatever was inside it — a portrait screenshot sat in a band of
// empty space, and a long filename made the caption wider than the picture it
// described. Neither is a layout; they are the absence of one. A fixed square makes
// every attachment the same object, which is also what lets a row of them scroll as
// a row.
//
// The size is per surface: the transcript is scrollable history where an attachment
// is content, the composer is a fixed strip above the input where the same
// attachment is furniture.
const TILE = {
  card: { box: "h-32 w-32", caption: "w-32" },
  compact: { box: "h-24 w-24", caption: "w-24" },
} as const;

const tileBox = cva(
  "flex items-center justify-center overflow-hidden rounded-xl border border-current/20 bg-elevated",
);

export default function AttachmentButton({
  workspace,
  path,
  name,
  size,
  tone = "chip",
}: {
  workspace: Workspace;
  path: string;
  name: string;
  /**
   * Shown beside the name when the surface HAS it — the composer from the upload
   * response, the files pane from the listing. A transcript `[anexo: …]` marker
   * carries a path and a name and nothing else, and fetching a listing to caption a
   * chip is a request bought for a parenthesis.
   */
  size?: number;
  tone?: "chip" | "card" | "compact";
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  // Asks the panel to show it, instead of opening an overlay over the conversation.
  // `size` is absent for a transcript chip — there is no listing behind it — and the
  // preview re-checks the fetched bytes anyway.
  const openInPanel = () => requestPreview({ path, name, size });
  // Null for the formats the webapp cannot show (office documents, archives). The menu
  // then stays the one-item menu it has always been — no disabled entry explaining a
  // rule nobody asked about.
  const kind = previewKind(path);
  // `previewKind`, not `fileTypeGroup`: the group counts `.svg` as an image and this
  // must not. The proxy serves every file as `application/octet-stream`, and a browser
  // sniffs raster bytes inside an <img> but demands a real `image/svg+xml` for SVG — so
  // an inline SVG would always fail to decode. Sharing the predicate with the menu also
  // means the two can never disagree about the same file.
  //
  // `broken` is not defensive padding. Any extension uploads now
  // (unrestricted-upload-types) and an extension can LIE about its bytes — that was the
  // reported symptom behind that feature. A broken-image glyph where a preview was
  // promised is worse than the type card that would have been there anyway.
  const showsImage = kind === "image" && tone !== "chip" && !broken;
  const caption = size != null ? `${name} · ${formatSize(size)}` : name;

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ x: r.left, y: r.bottom + 4 });
    }
    setError(null);
    setOpen((o) => !o);
  }

  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      await downloadMedia(workspace, path, name);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setBusy(false);
    }
  }

  // `chip` is the compact original — a paperclip and a name — kept for any surface too
  // narrow for a tile.
  const chip = (
    <button ref={btnRef} type="button" onClick={toggle} className={trigger({ tone: "chip" })} title={name}>
      <Paperclip size={12} className="shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </button>
  );

  const shape = tone === "compact" ? TILE.compact : TILE.card;

  const tile = (
    <button
      ref={btnRef}
      type="button"
      // A picture that is already showing has no "show me or save it" ambiguity left,
      // so it opens the full preview; a type tile is not the content, so its click
      // still has a question to ask and keeps the menu.
      onClick={showsImage ? openInPanel : toggle}
      className="block shrink-0 text-left"
      title={caption}
    >
      <span className={`${tileBox()} ${shape.box}`}>
        {showsImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/image cannot take
          // a runtime-resolved workspace URL, and optimization is off in this
          // deployment. The route authenticates from the session COOKIE, so a plain src
          // needs no fetch, no blob and no revocation, and the browser gets to stream
          // and cache it.
          <img
            src={mediaUrl(workspace, path)}
            alt={name}
            loading="lazy"
            onError={() => setBroken(true)}
            // `cover`, not `contain`: filling the square is the whole point of having
            // one. A letterboxed thumbnail is a grey box with a picture in the middle.
            className="h-full w-full object-cover"
          />
        ) : (
          <FileTypeIcon group={fileTypeGroup(path)} size={30} />
        )}
      </span>
      {/* Bounded by the tile, never by the text: the caption is what was overflowing
          the picture it belongs to. */}
      <span className={`mt-1 block truncate text-[11px] text-fg-muted ${shape.caption}`}>
        {caption}
      </span>
    </button>
  );

  return (
    <span className="relative inline-flex min-w-0">
      {tone === "chip" ? chip : tile}

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} aria-hidden />
            <div
              style={{ position: "fixed", left: pos.x, top: pos.y }}
              className="z-[60] w-48 rounded-lg border border-brand bg-surface p-1 shadow-xl"
            >
              {kind && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openInPanel();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
                >
                  <Eye size={15} className="shrink-0 text-fg-muted" aria-hidden />
                  {t.preview.action}
                </button>
              )}
              <button
                type="button"
                onClick={onDownload}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated disabled:opacity-60"
              >
                <Download size={15} className="shrink-0 text-fg-muted" aria-hidden />
                {busy ? t.attachment.downloading : t.attachment.download}
              </button>
              {error && <p className="px-2 py-1 text-xs text-red-500">{errorText(err, error)}</p>}
            </div>
          </>,
          document.body,
        )}

    </span>
  );
}
