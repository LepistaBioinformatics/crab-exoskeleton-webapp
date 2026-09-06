"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  PREVIEW_TEXT_MAX,
  downloadMedia,
  fetchMediaBlob,
  mediaUrl,
  resolveMediaRef,
  type PreviewKind,
  previewBlobType,
} from "@/lib/media";
import type { Workspace } from "./fragment";
import MessageContent, { MarkdownImageContext } from "@/app/chat/message-content";
import CodeBlock from "@/app/chat/code-block";
import { languageForFile } from "@/lib/code-highlight";
import { SHEET_ROW_CAP, type SheetPreview } from "@/lib/sheet-preview";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { chatCopy } from "@/lib/i18n/chat";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

/**
 * SHOWS a workspace file instead of handing it to the operating system.
 *
 * A PANE, not a modal. It used to be an overlay, for a reason that has since expired:
 * "the sidebar is a two-slot track whose default width is 280px, so a third
 * destination would mean reworking its geometry to arrive at a column too narrow to
 * read a document in anyway". The panel now opens at a third of the viewport, and the
 * document does not need a third slot — it takes the detail slot the tree was using,
 * which is what lets a member read a document with the conversation still beside it.
 *
 * Body only: the panel's own header carries the file name, the back control and the
 * download button, so this renders content and nothing else.
 *
 * How the bytes arrive differs by kind, and the difference is forced rather than
 * stylistic: an `<img>` may point straight at the media route, but the proxy answers
 * with `Content-Disposition: attachment`, which an `<iframe>` honours by DOWNLOADING
 * the file instead of rendering it. The PDF frame therefore goes through a blob, which
 * carries no headers.
 */
export default function FilePreview({
  workspace,
  path,
  name,
  kind,
  size,
}: {
  workspace: Workspace;
  path: string;
  name: string;
  kind: PreviewKind;
  /** From the listing, so an oversized text file is refused before it is fetched. */
  size?: number;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const [text, setText] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  // The two office formats, each read by a library imported only when one is opened.
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const needsBody = kind === "markdown" || kind === "text" || kind === "code";
  // Resolved from the NAME, like previewKind itself: the grammar and the decision to
  // preview at all come from the same table, so they cannot disagree.
  const language = kind === "code" ? languageForFile(name) : null;
  const tooLarge = needsBody && size != null && size > PREVIEW_TEXT_MAX;
  // An <img> streams from the route itself, so only the frame and the text bodies
  // are actually loading here.
  const loading = !error && !tooLarge &&
    ((needsBody && text === null) ||
      (kind === "pdf" && frameUrl === null) ||
      (kind === "docx" && docHtml === null) ||
      (kind === "xlsx" && sheets === null));

  useEffect(() => {
    if (tooLarge) return;
    let cancelled = false;
    // The one object URL this component creates. Held in the closure as well as in
    // state so the cleanup can revoke it even when the fetch resolves after unmount.
    let created: string | null = null;

    if (needsBody) {
      fetchMediaBlob(workspace, path)
        .then((blob) => {
          // Checked AGAIN, against the bytes. The listing's size is the cheap guard, but
          // a chat `[anexo: …]` chip has no listing behind it and passes none — and the
          // failure this cap exists to prevent (a huge CSV freezing the tab) does not
          // care which surface opened the file.
          if (blob.size > PREVIEW_TEXT_MAX) throw new Error("too_large");
          return blob.text();
        })
        .then((body) => {
          if (!cancelled) setText(body);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    } else if (kind === "docx") {
      // mammoth and the sanitizer arrive together and only here: a conversation that
      // never opens a .docx pays for neither (FR-4.4).
      fetchMediaBlob(workspace, path)
        .then(async (blob) => {
          const [{ convertToHtml }, { sanitizeDocxHtml }] = await Promise.all([
            import("mammoth/mammoth.browser"),
            import("@/lib/docx-html"),
          ]);
          const { value } = await convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          // Sanitized before it is ever handed to the DOM — mammoth's output is derived
          // from the member's own file, which makes it untrusted markup (DEC-4).
          return sanitizeDocxHtml(value);
        })
        .then((html) => {
          if (!cancelled) setDocHtml(html);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    } else if (kind === "xlsx") {
      fetchMediaBlob(workspace, path)
        .then(async (blob) => {
          const { readWorkbook } = await import("@/lib/sheet-preview");
          return readWorkbook(await blob.arrayBuffer());
        })
        .then((read) => {
          if (cancelled) return;
          setSheets(read);
          setSheetIndex(0);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    } else if (kind === "pdf") {
      fetchMediaBlob(workspace, path)
        .then((blob) => {
          if (cancelled) return;
          // Re-typed, because the bytes arrive as octet-stream and the browser believes
          // the blob over the <object type=…> attribute. See previewBlobType.
          const mime = previewBlobType(kind);
          created = URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob);
          setFrameUrl(created);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    }

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
    // Primitives, not the `workspace` object — the caller rebuilds it per render, and
    // depending on the object would refetch (and re-revoke) on every one. Same idiom
    // uploads-sidebar's listing effect uses.
  }, [workspace.t, workspace.s, workspace.r, workspace.p, path, kind, needsBody, tooLarge]);

  // Relative refs inside the previewed markdown resolve against ITS folder and load
  // through the media route. Memoised because it is a context value read by a
  // module-constant renderer — see MarkdownImageContext.
  const resolveImage = useCallback(
    (src: string) => {
      const target = resolveMediaRef(path, src);
      return target ? mediaUrl(workspace, target) : null;
    },
    [workspace.t, workspace.s, workspace.r, workspace.p, path], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const src = useMemo(
    () => mediaUrl(workspace, path),
    [workspace.t, workspace.s, workspace.r, workspace.p, path], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function onDownload() {
    setDownloading(true);
    try {
      await downloadMedia(workspace, path, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg" aria-label={t.preview.aria}>
          {error && (
            <div className="p-4">
              <Alert severity="error">{errorText(err, error)}</Alert>
            </div>
          )}

          {tooLarge && (
            <div className="p-4">
              <Alert severity="info">{t.preview.tooLarge}</Alert>
            </div>
          )}

          {loading && (
            <div className="flex h-full items-center justify-center">
              <Spinner size={28} />
            </div>
          )}

          {!error && kind === "image" && (
            // Straight at the route: the session is a cookie, so no fetch, no blob and
            // nothing to revoke. `object-contain` scales to fit without cropping.
            // eslint-disable-next-line @next/next/no-img-element -- see message-content
            <img
              src={src}
              alt={name}
              className="mx-auto h-full w-full object-contain p-2"
              onError={() => setError("unknown")}
            />
          )}

          {!error && kind === "pdf" && frameUrl && (
            // `<object>`, not `<iframe>`: an iframe's children are fallback for a browser
            // with no frame support at all, so on a browser that simply has no PDF viewer
            // they never paint and the member gets a blank rectangle. An object DOES
            // render its children when it cannot display the data.
            <object data={frameUrl} type="application/pdf" className="h-full w-full">
              <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
                <p className="text-sm text-fg-muted">{t.preview.pdfFallback}</p>
                <Button size="sm" variant="outlined" disabled={downloading} onClick={onDownload}>
                  <Download size={14} aria-hidden />
                  {downloading ? t.attachment.downloading : t.attachment.download}
                </Button>
              </div>
            </object>
          )}

          {!error && kind === "markdown" && text !== null && (
            // `container-type: inline-size` is load-bearing, not styling.
            //
            // MessageContent breaks wide tables out past the text column using
            // `max(0px, 50cqw - 360px)` per side. `cqw` resolves against the nearest
            // query container, which in the chat is the message band. There is none
            // here, so it fell back to the VIEWPORT: on a 1400px screen that is 340px
            // of negative margin each side, and the table grew past the modal itself
            // — a second, outer scrollbar on top of the table's own, hiding content
            // from anyone who did not think to scroll the whole dialog.
            //
            // Declaring the container makes the same formula measure THIS column, and
            // its own clamp then does the right thing: a modest breakout when the
            // dialog is wide, and none at all once the column is under 720px.
            <div className="mx-auto max-w-[820px] px-6 py-5 text-fg [container-type:inline-size]">
              <MarkdownImageContext.Provider value={resolveImage}>
                <MessageContent content={text} />
              </MarkdownImageContext.Provider>
            </div>
          )}

      {!error && kind === "text" && text !== null && (
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-fg">
          {text}
        </pre>
      )}

      {!error && kind === "docx" && docHtml !== null && (
        // The one `dangerouslySetInnerHTML` in the preview, and the only reason it is
        // acceptable is the line above it: what goes in has been through
        // sanitizeDocxHtml, which is an allowlist and has its own suite.
        <div
          className="mx-auto max-w-[820px] px-6 py-5 text-fg docx-body"
          dangerouslySetInnerHTML={{ __html: docHtml }}
        />
      )}

      {!error && kind === "xlsx" && sheets !== null && (
        <div className="flex h-full min-h-0 flex-col">
          {sheets.length > 1 && (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-brand/20 px-2 py-1.5">
              {sheets.map((sheet, i) => (
                <button
                  key={sheet.name}
                  type="button"
                  aria-current={i === sheetIndex ? "true" : undefined}
                  onClick={() => setSheetIndex(i)}
                  className={`shrink-0 rounded-lg px-2 py-1 text-xs transition-colors ${
                    i === sheetIndex ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-elevated"
                  }`}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-max border-collapse text-xs">
              <tbody>
                {(sheets[sheetIndex]?.rows ?? []).map((row, r) => (
                  <tr key={r} className="even:bg-elevated/40">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className="max-w-[320px] truncate border border-brand/20 px-2 py-1 text-fg"
                        title={cell}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheets[sheetIndex]?.truncated && (
            <div className="shrink-0 border-t border-brand/20 px-3 py-1.5 text-[11px] text-fg-muted">
              {t.preview.sheetTruncated.replace("{n}", String(SHEET_ROW_CAP))}
            </div>
          )}
        </div>
      )}

      {/* Code goes through the SAME highlighter the chat's code blocks use, with the
          grammar resolved from the file's own name. Escaped by highlight.js, which is
          what makes widening the format list free of the "member bytes never render
          from this origin" posture — `page.html` arrives here as source. */}
      {!error && kind === "code" && text !== null && (
        <div className="p-3">
          <CodeBlock
            code={text}
            className={language ? `language-${language}` : undefined}
            streaming={false}
          />
        </div>
      )}
    </div>
  );
}
