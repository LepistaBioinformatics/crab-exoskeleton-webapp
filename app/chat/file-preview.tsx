"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Code2, Download, Eye, WrapText } from "lucide-react";
import {
  PREVIEW_TEXT_MAX,
  downloadMedia,
  fetchMediaBlob,
  mediaUrl,
  resolveMediaRef,
  type PreviewKind,
  isDocumentKind,
  isSheetKind,
  looksBinary,
} from "@/lib/media";
import type { Workspace } from "./fragment";
import MessageContent, { MarkdownImageContext } from "@/app/chat/message-content";
import CodePane from "@/app/chat/code-pane";
import PdfPane from "@/app/chat/pdf-pane";
import { languageForFile } from "@/lib/code-highlight";
import { SHEET_ROW_CAP, type SheetPreview } from "@/lib/sheet-preview";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import HtmlScriptNotice from "./html-script-notice";
import { useHtmlScripts } from "./html-scripts";
import { chatCopy } from "@/lib/i18n/chat";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";
import { cva } from "class-variance-authority";

// One button in the reading footer. Icon-sized, so the strip reads as chrome under the
// document rather than as a second header — each carries its name in `title` and in
// `aria-label`, since the glyph alone is not a label for anyone.
const toolButton = cva(
  "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
  {
    variants: {
      on: {
        true: "bg-accent/15 text-accent",
        false: "text-fg-muted hover:bg-elevated hover:text-fg",
      },
    },
    defaultVariants: { on: false },
  },
);

/**
 * The word-processor pane's typography, derived token for token from the markdown
 * renderer's `COMPONENTS` table (`message-content.tsx`) rather than invented — DEC-3.
 *
 * `docx-body` used to be a class name NOTHING defined. mammoth maps Word's structure
 * correctly (its default style map covers Heading 1-6, lists to five levels and Strong)
 * and `sanitizeDocxHtml` keeps every one of those tags, so the markup reaching the DOM
 * was always a real document — it was then painted by a rule that did not exist, and
 * under Tailwind's preflight `h1`-`h6` inherit their parent's size and weight while
 * `ul`/`ol` lose their markers entirely. A structured report arrived as a flat wall of
 * text, visibly worse than the same content as markdown.
 *
 * Derived, not invented, because the complaint was comparative: the target is the
 * markdown renderer's scale, and two independently authored scales would drift the first
 * time either was touched. Kept as arbitrary variants here rather than as a class in
 * `globals.css` for the same reason — this way the two sit in files one change can reach.
 *
 * Tables depart in TWO ways, and only two, each with a reason.
 *
 * `border-collapse` rather than `border-separate`: the markdown table's rounded outer
 * corners come from `:first-child`/`:last-child` edge rules that assume a `<thead>`, and
 * a .docx table frequently has none — so the same border TOKENS are applied over
 * collapse, which degrades to a plain grid instead of a broken one.
 *
 * No `min-w-[7rem] max-w-[32rem]` on the cells: markdown's table sits in its own
 * `overflow-x-auto` wrapper that can scroll when the clamps push it wide, and the docx
 * body is ONE injected tree with no per-table wrapper to give it one. A clamp with
 * nowhere to overflow to is a column pushed off the page.
 *
 * Everything else matches, including the three that did not until a member said so: the
 * header tint, the cell word-wrap, and the vertical rhythm around the table.
 */
const DOCX_BODY = [
  "text-base leading-relaxed [&>*:last-child]:mb-0",
  "[&_p]:mb-2",
  "[&_h1]:mb-2 [&_h1]:mt-1 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-bold",
  "[&_h2]:mb-2 [&_h2]:mt-1 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold",
  "[&_h3]:mb-1 [&_h3]:mt-1 [&_h3]:font-display [&_h3]:text-sm [&_h3]:font-bold",
  "[&_h4]:mb-1 [&_h4]:font-display [&_h4]:text-sm [&_h4]:font-semibold",
  "[&_h5]:mb-1 [&_h5]:font-display [&_h5]:text-xs [&_h5]:font-semibold [&_h5]:uppercase [&_h5]:tracking-wide",
  "[&_h6]:mb-1 [&_h6]:font-display [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-wide [&_h6]:text-current/70",
  "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:marker:text-current/60",
  "[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:marker:text-current/60",
  "[&_ul_ul]:mb-0 [&_ul_ol]:mb-0 [&_ol_ol]:mb-0 [&_ol_ul]:mb-0",
  "[&_li]:mb-0.5",
  "[&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic [&_u]:underline",
  "[&_a]:underline [&_a]:underline-offset-2",
  "[&_hr]:my-3 [&_hr]:border-current/20",
  "[&_blockquote]:mb-2 [&_blockquote]:border-l-2 [&_blockquote]:border-current/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:opacity-90",
  "[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-current/10 [&_pre]:p-3",
  "[&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-current/10 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.9em]",
  "[&_thead_th]:bg-current/[0.05]",
  "[&_th]:border [&_th]:border-current/15 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_th]:[overflow-wrap:break-word]",
  "[&_td]:border [&_td]:border-current/15 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:[overflow-wrap:break-word]",
  "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg",
].join(" ");

/**
 * SHOWS a workspace file instead of handing it to the operating system.
 *
 * A PANE, not a modal. It used to be an overlay, for a reason that has since expired:
 * "the sidebar is a two-slot track whose default width is 280px, so a third slot would
 * mean reworking its geometry to arrive at a column too narrow to read a document in
 * anyway". The pane opens at a third of the viewport now, and the document needs no slot
 * of its own — it takes the detail slot the tree was using, which is what lets a member
 * read a document with the conversation still beside it.
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
/**
 * Which reading of a file with two of them is on screen.
 *
 * Two kinds have two readings: markdown, which is a document and the marks that
 * produce it, and html, which is a page and the markup that produces it. Each used to
 * offer exactly one, and they offered OPPOSITE ones -- markdown rendered with no way to
 * see the source, html as source with no way to see the page.
 */
type PreviewView = "rendered" | "source";

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
  // Off for this session unless the member said otherwise, and gone when the browser
  // closes -- see html-scripts.ts.
  const scripts = useHtmlScripts();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Set when the bytes turn out to be binary after the NAME said they were text. Its own
  // state rather than an error, because it is an ordinary answer about the file.
  const [binary, setBinary] = useState(false);

  // Which way a file with TWO readings is being read. See the toggle below.
  const [view, setView] = useState<PreviewView>("rendered");
  // SESSION-SCOPED AND PER-PANE, deliberately unpersisted. Wrapping is a reading of the
  // file in front of the member, not a preference about code: the report whose every line
  // is a 300-character URL wants it and the YAML opened next does not.
  const [wrap, setWrap] = useState(false);
  // Back to the rendered reading, and to scrolling, whenever the FILE changes. Both
  // choices belong to the document being read, not to the pane: a member who looked at
  // one file's markup does not mean "show me markup from now on", and this pane is NOT
  // keyed by path — opening a second file reuses the instance, so anything not reset
  // here is carried into the next file silently.
  useEffect(() => {
    setView("rendered");
    setWrap(false);
  }, [path]);

  // The kinds that can be read two ways, and therefore the only ones that offer the
  // choice. Everything else has one reading and a toggle would be a control that does
  // nothing.
  const dual = kind === "markdown" || kind === "html";
  const asSource = dual && view === "source";

  const needsBody =
    kind === "markdown" || kind === "html" || kind === "text" || kind === "code";
  // Resolved from the NAME, like previewKind itself: the grammar and the decision to
  // preview at all come from the same table, so they cannot disagree.
  //
  // Asked for the source reading too: a markdown read as source is highlighted with
  // the markdown grammar and an html with xml, which is what the alias table already
  // says those extensions mean.
  const language = kind === "code" || asSource ? languageForFile(name) : null;
  const tooLarge = needsBody && size != null && size > PREVIEW_TEXT_MAX;
  // Read out here, so the effect below depends on a STRING rather than on the copy
  // object — the same reason its other dependencies are `workspace`'s primitives.
  const slideLabel = t.preview.slide;
  // An <img> streams from the route itself, so only the frame and the text bodies
  // are actually loading here.
  const loading = !error && !tooLarge && !binary &&
    ((needsBody && text === null) ||
      (kind === "pdf" && frameUrl === null) ||
      (isDocumentKind(kind) && docHtml === null) ||
      (isSheetKind(kind) && sheets === null));

  useEffect(() => {
    if (tooLarge) return;
    // Reset, because this pane is not keyed by path: opening a second file reuses the
    // instance, and a sticky `binary` would refuse a text file on the strength of the
    // one opened before it.
    setBinary(false);
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
          return blob.arrayBuffer();
        })
        .then((bytes) => {
          if (cancelled) return;
          // Read as BYTES rather than through `blob.text()`, because the plain-text
          // fallback means an unrecognised extension arrives here on trust: the name
          // said nothing, so the file is asked directly. A binary caught at this point
          // is not an error — it is an answer, and it gets the same quiet notice the
          // size cap gets rather than a red alert.
          if (looksBinary(bytes)) {
            setBinary(true);
            return;
          }
          // Newlines are normalised on the way in, which the line gutter depends on: a
          // CRLF file would otherwise number correctly and paint a stray glyph at the
          // end of every line.
          setText(new TextDecoder().decode(bytes).replace(/\r\n?/g, "\n"));
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    } else if (isDocumentKind(kind)) {
      // The reader and the sanitizer arrive together and only here: a conversation that
      // never opens a document pays for neither (file-preview-in-pane FR-4.4). Which
      // reader is decided by the KIND, which is why `.odt` and `.odp` are kinds of their
      // own rather than sharing `docx` — the format table stays the one place that knows.
      fetchMediaBlob(workspace, path)
        .then(async (blob) => {
          const bytes = await blob.arrayBuffer();
          if (kind === "docx") {
            // The reader and the sanitizer are fetched TOGETHER, not one after the
            // other: they are independent chunks, and awaiting them in sequence would
            // add a round trip to the first paint of the commonest document format.
            const [{ convertToHtml }, { sanitizeDocxHtml }] = await Promise.all([
              import("mammoth/mammoth.browser"),
              import("@/lib/docx-html"),
            ]);
            const { value } = await convertToHtml({ arrayBuffer: bytes });
            // Sanitized before it is ever handed to the DOM — mammoth's output is derived
            // from the member's own file, which makes it untrusted markup (DEC-4).
            return sanitizeDocxHtml(value);
          }
          const [odf, { sanitizeDocxHtml }] = await Promise.all([
            import("@/lib/odf"),
            import("@/lib/docx-html"),
          ]);
          const xml = await odf.readOdfContent(bytes);
          // Filtered too, even though the ODF walk emits only tags it chose itself and
          // escapes every text node. Two filters is the point: this is the one with the
          // suite and the stated posture behind it (preview-formatting-and-odf FR-4.1).
          return sanitizeDocxHtml(
            kind === "odp"
              ? odf.presentationHtml(xml, (n) => slideLabel.replace("{n}", String(n)))
              : odf.textDocumentHtml(xml),
          );
        })
        .then((html) => {
          if (!cancelled) setDocHtml(html);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    } else if (isSheetKind(kind)) {
      fetchMediaBlob(workspace, path)
        .then(async (blob) => {
          const bytes = await blob.arrayBuffer();
          if (kind === "ods") {
            const { readOdfContent, spreadsheetSheets } = await import("@/lib/odf");
            // Returns the shape the spreadsheet pane already consumes, so `.ods` inherits
            // the sheet tabs, the row cap and the truncation notice without a line of
            // UI (DEC-5).
            return spreadsheetSheets(await readOdfContent(bytes));
          }
          const { readWorkbook } = await import("@/lib/sheet-preview");
          return readWorkbook(bytes);
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
          // No re-typing any more. The bytes arrive as octet-stream and used to be
          // relabelled `application/pdf`, because a browser trusts a blob's own type over
          // an `<object type=…>` attribute — so the preview showed its fallback in Firefox
          // and downloaded itself in Chromium. There is no `<object>` now: pdf.js reads
          // the bytes and never asks what they claim to be.
          created = URL.createObjectURL(blob);
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
    // the files screen's listing effect uses.
  }, [workspace.t, workspace.s, workspace.r, workspace.p, path, kind, needsBody, tooLarge, slideLabel]);

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

  // Which controls the footer has anything to offer. Both are about the FILE rather than
  // about the panel, which is why they are here and not in the pane's header.
  const showsCode = (kind === "code" || asSource) && text !== null;
  const footer = !error && !tooLarge && (dual || showsCode);

  return (
    // A COLUMN, so the controls sit BELOW the scrolling area instead of floating inside
    // it. They were `sticky top-0` in the scroller, level with the line-number gutter's
    // own `sticky left-0`, and at equal z-index in one stacking context the tie goes to
    // document order — so scrolling a source file up dragged the numbers' background and
    // rule straight over the bar. Outside the scrollport there is nothing left to race:
    // no sticky descendant can reach the footer, and the footer cannot cover the last
    // line of a file or the bottom edge of a rendered frame either.
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="min-h-0 flex-1 overflow-auto" aria-label={t.preview.aria}>

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

          {binary && (
            // The other half of the plain-text fallback. An unrecognised extension is
            // now opened on trust, so the file that turns out to be binary is refused
            // HERE, after its bytes said so — and it is a notice, not an error, because
            // nothing went wrong.
            <div className="p-4">
              <Alert severity="info">{t.preview.binary}</Alert>
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
            // DRAWN HERE, not handed to the browser. It was an `<object>` — the browser's
            // own viewer — and every current browser's viewer ships annotation tools that
            // this pane cannot honour: it reads bytes out of the workspace and has nothing
            // that writes them back, so a highlight or a typed note could only ever be
            // discarded. `pdf-pane.tsx` records why no setting turns them off.
            //
            // The fallback survives the change and is the same offer it always was: a
            // document pdf.js cannot open is a document to download, not an error.
            <PdfPane
              url={frameUrl}
              fallback={
                <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
                  <p className="text-sm text-fg-muted">{t.preview.pdfFallback}</p>
                  <Button size="sm" variant="outlined" disabled={downloading} onClick={onDownload}>
                    <Download size={14} aria-hidden />
                    {downloading ? t.attachment.downloading : t.attachment.download}
                  </Button>
                </div>
              }
            />
          )}

          {!error && kind === "markdown" && !asSource && text !== null && (
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
            // `text-reading-fg`, the same token the chat's message band reads. It was
            // `text-fg`, so in dark mode a markdown file rendered cooler and brighter
            // here than the same markdown in the transcript beside it.
            <div className="mx-auto max-w-[820px] px-6 py-5 text-reading-fg [container-type:inline-size]">
              <MarkdownImageContext.Provider value={resolveImage}>
                <MessageContent content={text} />
              </MarkdownImageContext.Provider>
            </div>
          )}

      {!error && kind === "html" && !asSource && text !== null && (
        // A FRAME, and the sandbox is the whole reason this is allowed to exist.
        //
        // The bytes were written by an agent that reads untrusted material -- web pages,
        // uploaded files, a member's own paste -- so rendering them in THIS origin would
        // turn a prompt injection into script running with the member's session. The
        // pane showed html as source for exactly that reason, and the reason has not
        // changed; what changed is that a frame can render a page without being this
        // origin.
        //
        // TWO VALUES, AND NEVER A THIRD. `sandbox=""` is the most restrictive value
        // there is -- no scripts, no same-origin, no forms, no navigation, no popups --
        // and is what a session gets until the member says otherwise. `allow-scripts`
        // ALONE gives the frame an opaque origin: scripts run, and cookies,
        // localStorage, the parent DOM and top-level navigation stay unreachable.
        //
        // `allow-same-origin` NEVER APPEARS, in either value or in any future one.
        // Beside `allow-scripts` it undoes the sandbox entirely -- the frame could reach
        // into this origin and remove its own sandbox attribute -- and that is the
        // mistake this comment exists to stop.
        //
        // srcdoc, not a blob URL: the bytes are already here, and a blob would be an
        // object to revoke and a second way for the frame to have an origin.
        <div className="flex h-full min-h-0 flex-col">
          <HtmlScriptNotice />
          <iframe
            title={name}
            // Keyed on the setting so turning it on RELOADS the document. A frame keeps
            // the sandbox it was created with; changing the attribute on a live frame
            // leaves the page that is already parsed exactly as restricted as it was,
            // and the member would read a notice saying scripts are on over a page where
            // they are not.
            key={scripts ? "scripts" : "no-scripts"}
            sandbox={scripts ? "allow-scripts" : ""}
            srcDoc={text}
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
        </div>
      )}

      {!error && kind === "text" && text !== null && (
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-reading-fg">
          {text}
        </pre>
      )}

      {!error && isDocumentKind(kind) && docHtml !== null && (
        <div className="mx-auto max-w-[820px] px-6 py-5">
          {kind === "odp" && (
            // Said out loud for the same reason the sheet's row cap is: this shows the
            // deck's TEXT, and a partial view that does not admit it misrepresents the
            // file (FR-3.3).
            <div className="mb-4">
              <Alert severity="info">{t.preview.slidesPartial}</Alert>
            </div>
          )}
          {/* The one `dangerouslySetInnerHTML` in the preview, and the only reason it is
              acceptable is the line above it: what goes in has been through
              sanitizeDocxHtml, which is an allowlist and has its own suite. */}
          <div className={`text-reading-fg ${DOCX_BODY}`} dangerouslySetInnerHTML={{ __html: docHtml }} />
        </div>
      )}

      {!error && isSheetKind(kind) && sheets !== null && (
        <div className="flex h-full min-h-0 flex-col">
          {sheets.length > 1 && (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-rule px-2 py-1.5">
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
          {/* THE MARKDOWN TABLE'S GRAMMAR, not chrome's. It was `border-rule` at
              `px-2 py-1 text-xs` -- `--rule` is a brand-tinted boundary for the frame
              around a document, and drawing a document's own grid in it made a
              spreadsheet look like a different product from the same data pasted into
              the chat. `border-current/15` is the markdown cell's, and it follows the
              text colour, which is what lets one grid read on any surface.

              The zebra follows it inward for the same reason: `bg-elevated/40` is a
              surface step, `bg-current/[0.04]` is the tint the markdown table already
              uses for its header row. Kept at all -- markdown has no zebra -- because a
              sheet is hundreds of rows wide and a markdown table is not. */}
          <div className="min-h-0 flex-1 overflow-auto text-reading-fg">
            <table className="w-max border-collapse text-[0.9em]">
              <tbody>
                {(sheets[sheetIndex]?.rows ?? []).map((row, r) => (
                  <tr key={r} className="even:bg-current/[0.04]">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className="max-w-[320px] truncate border border-current/15 px-3 py-2 align-top"
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
            <div className="shrink-0 border-t border-rule px-3 py-1.5 text-[11px] text-fg-muted">
              {t.preview.sheetTruncated.replace("{n}", String(SHEET_ROW_CAP))}
            </div>
          )}
        </div>
      )}

      {/* Code goes through the SAME highlighter the chat's code blocks use, with the
          grammar resolved from the file's own name. Escaped by highlight.js, which is
          what makes widening the format list free of the "member bytes never render
          from this origin" posture — `page.html` arrives here as source. */}
      {!error && (kind === "code" || asSource) && text !== null && (
        // NUMBERED, because this is a FILE rather than a fenced block in a message: the
        // number is how a member says where something is, to a colleague or back to the
        // agent, and a code pane without one makes them count. The chat's blocks are
        // deliberately left unnumbered — a four-line snippet has no line to refer to.
        //
        // Scrolling is still the DEFAULT (`preview-formatting-and-odf` DEC-2: a log is
        // prose whose line breaks are incidental, a YAML is a structure whose columns
        // carry meaning), but it is no longer the only reading. The control below turns
        // wrapping on for the file in front of the member, which is the case DEC-2 never
        // covered — a generated HTML report whose every line is a 300-character URL.
        <CodePane code={text} language={language} wrap={wrap} />
      )}
      </div>

      {footer && (
        // ICONS, not words, and `title` on every one of them. The bar is a strip of
        // reading controls under a document, not a navigation level: at label width it
        // read as the more important thing on screen, which it is not.
        <div
          role="group"
          aria-label={t.preview.viewLabel}
          className="flex shrink-0 items-center gap-0.5 border-t border-rule px-2 py-1"
        >
          {dual &&
            (["rendered", "source"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                title={v === "rendered" ? t.preview.viewRendered : t.preview.viewSource}
                aria-label={v === "rendered" ? t.preview.viewRendered : t.preview.viewSource}
                onClick={() => setView(v)}
                className={toolButton({ on: view === v })}
              >
                {v === "rendered" ? <Eye size={14} aria-hidden /> : <Code2 size={14} aria-hidden />}
              </button>
            ))}

          {showsCode && (
            <button
              type="button"
              aria-pressed={wrap}
              title={t.preview.wrapLines}
              aria-label={t.preview.wrapLines}
              onClick={() => setWrap((w) => !w)}
              className={toolButton({ on: wrap })}
            >
              <WrapText size={14} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
